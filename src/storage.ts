import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { STRUDEL_DIR, SONGS_FILE } from './constants.js';
import type { SongsData, Song, SongVersion } from './types.js';

// ── Helpers ──

async function ensureDir(): Promise<void> {
  if (!existsSync(STRUDEL_DIR)) {
    await mkdir(STRUDEL_DIR, { recursive: true });
  }
}

async function loadSongs(): Promise<SongsData> {
  await ensureDir();
  if (!existsSync(SONGS_FILE)) {
    return { songs: {} };
  }
  const raw = await readFile(SONGS_FILE, 'utf-8');
  return JSON.parse(raw) as SongsData;
}

async function saveSongs(data: SongsData): Promise<void> {
  await ensureDir();
  await writeFile(SONGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ── File Lock ──

const SONGS_LOCK = join(STRUDEL_DIR, 'songs.lock');
const LOCK_TIMEOUT = 5000; // 5 seconds max wait

export async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (e: any) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() - start > LOCK_TIMEOUT) {
        // Stale lock — remove and retry
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }
  try {
    return await fn();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

// ── Public API ──

/**
 * Create a new song with initial code (version 1).
 * Throws if song already exists.
 */
export async function makeSong(name: string, code: string): Promise<SongVersion> {
  return withLock(SONGS_LOCK, async () => {
    const data = await loadSongs();

    if (data.songs[name]) {
      throw new Error(`Song '${name}' already exists. Use 'strudel update' to modify it.`);
    }

    const version: SongVersion = {
      code,
      createdAt: new Date().toISOString(),
    };

    data.songs[name] = { versions: [version] };
    await saveSongs(data);
    return version;
  });
}

/**
 * Find & replace in the latest version's code, creating a new version.
 * If `from` matches multiple times and no index is given, throws with count.
 * Returns the new version's code.
 */
export async function updateSong(
  name: string,
  from: string,
  to: string,
  index?: number,
): Promise<{ code: string; version: number }> {
  // Bug 4: empty `from` causes indexOf infinite loop
  if (!from || from.length === 0) {
    throw new Error('--from cannot be empty');
  }

  // Bug 3: NaN validation for --index
  if (index !== undefined) {
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0) {
      throw new Error('--index must be a non-negative integer');
    }
  }

  return withLock(SONGS_LOCK, async () => {
    const data = await loadSongs();
    const song = data.songs[name];

    if (!song) {
      throw new Error(`Song '${name}' not found. Use 'strudel make' to create one.`);
    }

    const latest = song.versions[song.versions.length - 1];
    let code = latest.code;

    // Count occurrences
    const matches: number[] = [];
    let searchPos = 0;
    while (true) {
      const idx = code.indexOf(from, searchPos);
      if (idx === -1) break;
      matches.push(idx);
      searchPos = idx + 1;
    }

    if (matches.length === 0) {
      throw new Error(`No match found for '${from}' in song '${name}'.`);
    }

    if (matches.length > 1 && index === undefined) {
      throw new Error(
        `Found ${matches.length} matches for '${from}'. Please specify --index (0-based) or use a more specific string.`,
      );
    }

    const targetIndex = index ?? 0;

    if (targetIndex < 0 || targetIndex >= matches.length) {
      throw new Error(
        `Index ${targetIndex} is out of range. Found ${matches.length} match(es) (0-based).`,
      );
    }

    // Replace only the occurrence at the target index
    const pos = matches[targetIndex];
    code = code.substring(0, pos) + to + code.substring(pos + from.length);

    const newVersion: SongVersion = {
      code,
      createdAt: new Date().toISOString(),
    };

    song.versions.push(newVersion);
    await saveSongs(data);

    return { code, version: song.versions.length };
  });
}

/**
 * Get song detail. Returns code for specified version (latest if omitted).
 */
export async function detailSong(
  name: string,
  version?: number,
): Promise<{ code: string; version: number; totalVersions: number; createdAt: string }> {
  const data = await loadSongs();
  const song = data.songs[name];

  if (!song) {
    throw new Error(`Song '${name}' not found. Use 'strudel make' to create one.`);
  }

  const totalVersions = song.versions.length;
  const versionIndex = version ? version - 1 : totalVersions - 1;

  if (versionIndex < 0 || versionIndex >= totalVersions) {
    throw new Error(
      `Version ${version} not found. Song '${name}' has ${totalVersions} version(s).`,
    );
  }

  const sv = song.versions[versionIndex];
  return {
    code: sv.code,
    version: versionIndex + 1,
    totalVersions,
    createdAt: sv.createdAt,
  };
}

/**
 * List all song names.
 */
export async function listSongs(): Promise<string[]> {
  const data = await loadSongs();
  return Object.keys(data.songs);
}

/**
 * Delete a song by name.
 * Throws if song doesn't exist.
 */
export async function deleteSong(name: string): Promise<void> {
  return withLock(SONGS_LOCK, async () => {
    const data = await loadSongs();

    if (!data.songs[name]) {
      throw new Error(`Song '${name}' not found.`);
    }

    delete data.songs[name];
    await saveSongs(data);
  });
}

/**
 * Get the latest code for a song (used by play command).
 */
export async function getSongCode(
  name: string,
  version?: number,
): Promise<{ code: string; version: number }> {
  const detail = await detailSong(name, version);
  return { code: detail.code, version: detail.version };
}
