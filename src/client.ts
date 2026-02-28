/**
 * HTTP client for CLI → daemon communication.
 *
 * Reads daemon port from the PID file, auto-starts daemon if not running,
 * and provides typed methods for each API endpoint.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  PID_FILE,
  DAEMON_HOST,
  HEALTH_POLL_INTERVAL_MS,
  HEALTH_POLL_MAX_ATTEMPTS,
  DAEMON_LOG,
  STRUDEL_DIR,
} from './constants.js';
import { withLock } from './storage.js';
import type {
  DaemonPidInfo,
  HealthResponse,
  CurrentResponse,
  PlayResponse,
  StopResponse,
  PauseResponse,
  EvaluateResponse,
} from './types.js';
import { mkdirSync } from 'node:fs';
import { openSync, closeSync } from 'node:fs';

// ── PID File ──

async function readPidFile(): Promise<DaemonPidInfo | null> {
  if (!existsSync(PID_FILE)) return null;
  try {
    const raw = await readFile(PID_FILE, 'utf-8');
    const info = JSON.parse(raw) as DaemonPidInfo;
    if (info.port && info.pid) return info;
    return null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── Daemon Lifecycle ──

function getDaemonScript(): { script: string; isTsFile: boolean } {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // Check for .ts version (development with tsx)
  const tsPath = join(thisDir, 'daemon.ts');
  if (existsSync(tsPath)) return { script: tsPath, isTsFile: true };

  // Compiled version
  return { script: join(thisDir, 'daemon.js'), isTsFile: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startDaemon(): Promise<DaemonPidInfo> {
  const { script, isTsFile } = getDaemonScript();

  // Ensure log directory exists
  if (!existsSync(STRUDEL_DIR)) {
    mkdirSync(STRUDEL_DIR, { recursive: true });
  }

  // Open log file for daemon stdout/stderr
  const logFd = openSync(DAEMON_LOG, 'a');

  if (isTsFile) {
    // Use npx tsx to run .ts file
    const child = spawn('npx', ['tsx', script], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: dirname(dirname(script)), // project root
      env: { ...process.env },
    });
    child.unref();
  } else {
    // Run compiled .js file directly with node
    const child = spawn(process.execPath, [script], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env },
    });
    child.unref();
  }

  // Close our copy of the log fd
  closeSync(logFd);

  // Wait for daemon to be ready
  for (let i = 0; i < HEALTH_POLL_MAX_ATTEMPTS; i++) {
    await sleep(HEALTH_POLL_INTERVAL_MS);

    const pidInfo = await readPidFile();
    if (pidInfo && isProcessAlive(pidInfo.pid)) {
      // Try health check
      try {
        const resp = await fetch(`http://${DAEMON_HOST}:${pidInfo.port}/health`);
        if (resp.ok) return pidInfo;
      } catch {
        // Not ready yet
      }
    }
  }

  throw new Error(
    `Daemon failed to start within ${(HEALTH_POLL_INTERVAL_MS * HEALTH_POLL_MAX_ATTEMPTS) / 1000}s. Check ${DAEMON_LOG} for errors.`,
  );
}

// ── Ensure Daemon is Running ──

const DAEMON_LOCK = join(STRUDEL_DIR, 'daemon.lock');

async function ensureDaemon(): Promise<DaemonPidInfo> {
  const pidInfo = await readPidFile();

  if (pidInfo && isProcessAlive(pidInfo.pid)) {
    // Verify it's actually responding
    try {
      const resp = await fetch(`http://${DAEMON_HOST}:${pidInfo.port}/health`);
      if (resp.ok) return pidInfo;
    } catch {
      // Stale PID file — daemon crashed
    }
  }

  // Need to start daemon — use lock to prevent duplicate spawns
  return withLock(DAEMON_LOCK, async () => {
    // Double-check: another process may have started the daemon while we waited
    const recheck = await readPidFile();
    if (recheck && isProcessAlive(recheck.pid)) {
      try {
        const resp = await fetch(`http://${DAEMON_HOST}:${recheck.port}/health`);
        if (resp.ok) return recheck;
      } catch {
        // Still not healthy — proceed to start
      }
    }
    return startDaemon();
  });
}

// ── HTTP Helpers ──

async function get<T>(path: string, pidInfo: DaemonPidInfo): Promise<T> {
  const url = `http://${DAEMON_HOST}:${pidInfo.port}${path}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error((data as any).error || `HTTP ${resp.status}`);
  }
  return data as T;
}

async function post<T>(path: string, body: unknown, pidInfo: DaemonPidInfo): Promise<T> {
  const url = `http://${DAEMON_HOST}:${pidInfo.port}${path}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error((data as any).error || `HTTP ${resp.status}`);
  }
  return data as T;
}

// ── Public Client API ──

/**
 * Check if daemon is running (without starting it).
 */
export async function isDaemonRunning(): Promise<boolean> {
  const pidInfo = await readPidFile();
  if (!pidInfo || !isProcessAlive(pidInfo.pid)) return false;
  try {
    const resp = await fetch(`http://${DAEMON_HOST}:${pidInfo.port}/health`);
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Get current playback state.
 * Auto-starts daemon if not running.
 */
export async function getCurrent(): Promise<CurrentResponse> {
  const pidInfo = await ensureDaemon();
  return get<CurrentResponse>('/current', pidInfo);
}

/**
 * Play a song (sends code to daemon).
 * Auto-starts daemon if not running.
 */
export async function play(code: string, name: string, version: number): Promise<PlayResponse> {
  const pidInfo = await ensureDaemon();
  return post<PlayResponse>('/play', { code, name, version }, pidInfo);
}

/**
 * Stop playback.
 */
export async function stop(): Promise<StopResponse> {
  const running = await isDaemonRunning();
  if (!running) {
    throw new Error("No music is playing. Use 'strudel play <name>' to start.");
  }
  const pidInfo = (await readPidFile())!;
  return post<StopResponse>('/stop', {}, pidInfo);
}

/**
 * Pause playback.
 */
export async function pause(): Promise<PauseResponse> {
  const running = await isDaemonRunning();
  if (!running) {
    throw new Error("No music is playing. Use 'strudel play <name>' to start.");
  }
  const pidInfo = (await readPidFile())!;
  return post<PauseResponse>('/pause', {}, pidInfo);
}

/**
 * Evaluate code on the running daemon (used by update command).
 * Auto-starts daemon if not running.
 */
export async function evaluate(
  code: string,
  name?: string,
  version?: number,
): Promise<EvaluateResponse> {
  const pidInfo = await ensureDaemon();
  return post<EvaluateResponse>('/evaluate', { code, name, version }, pidInfo);
}

/**
 * Get daemon health (without starting it).
 */
export async function health(): Promise<HealthResponse | null> {
  const pidInfo = await readPidFile();
  if (!pidInfo || !isProcessAlive(pidInfo.pid)) return null;
  try {
    return await get<HealthResponse>('/health', pidInfo);
  } catch {
    return null;
  }
}
