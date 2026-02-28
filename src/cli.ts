#!/usr/bin/env node

/**
 * Strudel CLI — terminal interface for Strudel live-coding music.
 *
 * Commands:
 *   play <name> [--version <n>]              Play a saved song
 *   stop                                      Stop playback
 *   pause                                     Pause playback
 *   current                                   Show current playback state
 *   make <name> --code <code>                 Create a new song
 *   update <name> --from <s> --to <s> [--index <n>]  Find & replace in song code
 *   detail <name> [--version <n>]             Show song code
 *   delete <name>                             Delete a saved song
 *   list                                      List all saved songs
 */

import { Command } from 'commander';
import { C } from './constants.js';
import * as storage from './storage.js';
import * as client from './client.js';

// ── Error Formatting Helpers ──

/**
 * Display code with line numbers, highlighting the error line.
 */
function formatCodeWithError(code: string, errorLine?: number, errorCol?: number): void {
  const lines = code.split('\n');
  const lineNumWidth = String(lines.length).length;

  console.error(`${C.dim}  ┌──────────────────────────────────${C.reset}`);
  for (let i = 0; i < lines.length; i++) {
    const lineNum = String(i + 1).padStart(lineNumWidth, ' ');
    const isErrorLine = errorLine != null && i + 1 === errorLine;

    if (isErrorLine) {
      console.error(`${C.red}  │ ${lineNum} │ ${lines[i]}${C.reset}`);
      // Show column pointer
      if (errorCol != null) {
        const pointer = ' '.repeat(errorCol) + '^';
        console.error(`${C.red}  │ ${' '.repeat(lineNumWidth)} │ ${pointer}${C.reset}`);
      }
    } else {
      console.error(`${C.dim}  │ ${lineNum} │${C.reset} ${lines[i]}`);
    }
  }
  console.error(`${C.dim}  └──────────────────────────────────${C.reset}`);
}

/**
 * Format and display an error message. If the error message contains
 * line/column info, extract it and show the code context.
 */
function formatError(err: Error, code?: string): void {
  const msg = err.message;

  // Try to extract line/column from error messages like:
  // "Syntax error (line 1, col 5): ..."
  // "Evaluation error: ..."
  const lineMatch = msg.match(/line (\d+)/i);
  const colMatch = msg.match(/col(?:umn)? (\d+)/i);

  const errorLine = lineMatch ? parseInt(lineMatch[1], 10) : undefined;
  const errorCol = colMatch ? parseInt(colMatch[1], 10) : undefined;

  // Determine error type for better display
  let errorType = 'Error';
  let errorDetail = msg;

  if (msg.includes('Syntax error')) {
    errorType = 'Syntax Error';
    errorDetail = msg.replace(/^Syntax error[^:]*:\s*/i, '');
  } else if (msg.includes('Evaluation error')) {
    errorType = 'Evaluation Error';
    errorDetail = msg.replace(/^Evaluation error:\s*/i, '');
  } else if (msg.includes('not found')) {
    errorType = 'Not Found';
  } else if (msg.includes('not defined')) {
    errorType = 'Reference Error';
  }

  console.error(`${C.red}✗ ${errorType}:${C.reset} ${errorDetail}`);

  if (code && (errorLine || msg.includes('error'))) {
    console.error();
    formatCodeWithError(code, errorLine, errorCol);
  }
}

const program = new Command();

program
  .name('strudel')
  .description('CLI for playing Strudel live-coding music')
  .version('1.0.0');

// ── play ──

program
  .command('play')
  .description('Start playing a saved song')
  .argument('<name>', 'Song name')
  .option('--ver <n>', 'Version number (default: latest)', parseInt)
  .action(async (name: string, opts: { ver?: number }) => {
    let songCode: string | undefined;
    try {
      const { code, version } = await storage.getSongCode(name, opts.ver);
      songCode = code;
      console.log(`${C.dim}Starting daemon...${C.reset}`);

      const result = await client.play(code, name, version);

      console.log(
        `${C.green}▶${C.reset} ${C.bold}Now playing:${C.reset} ${C.cyan}${result.name}${C.reset} ${C.dim}(v${result.version})${C.reset}`,
      );
    } catch (err) {
      formatError(err as Error, songCode);
      process.exit(1);
    }
  });

// ── stop ──

program
  .command('stop')
  .description('Stop playback')
  .action(async () => {
    try {
      await client.stop();
      console.log(`${C.yellow}■${C.reset} Playback stopped.`);
    } catch (err) {
      console.error(`${C.red}✗${C.reset} ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── pause ──

program
  .command('pause')
  .description('Pause playback')
  .action(async () => {
    try {
      await client.pause();
      console.log(`${C.yellow}⏸${C.reset} Playback paused.`);
    } catch (err) {
      console.error(`${C.red}✗${C.reset} ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── current ──

program
  .command('current')
  .description('Show current playback state')
  .action(async () => {
    try {
      const running = await client.isDaemonRunning();
      if (!running) {
        console.log(`${C.dim}No music is playing. Use 'strudel play <name>' to start.${C.reset}`);
        return;
      }

      const cur = await client.getCurrent();

      const stateIcon =
        cur.state === 'playing'
          ? `${C.green}▶${C.reset}`
          : cur.state === 'paused'
            ? `${C.yellow}⏸${C.reset}`
            : `${C.dim}■${C.reset}`;

      console.log(`${stateIcon} ${C.bold}State:${C.reset} ${cur.state}`);

      if (cur.name) {
        console.log(
          `  ${C.bold}Song:${C.reset}    ${C.cyan}${cur.name}${C.reset}${cur.version ? ` ${C.dim}(v${cur.version})${C.reset}` : ''}`,
        );
      }

      if (cur.code) {
        console.log(`  ${C.bold}Code:${C.reset}`);
        console.log(`${C.dim}  ┌──────────────────────────────────${C.reset}`);
        for (const line of cur.code.split('\n')) {
          console.log(`${C.dim}  │${C.reset} ${line}`);
        }
        console.log(`${C.dim}  └──────────────────────────────────${C.reset}`);
      }
    } catch (err) {
      console.error(`${C.red}✗${C.reset} ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── make ──

program
  .command('make')
  .description('Create a new song')
  .argument('<name>', 'Song name')
  .requiredOption('-c, --code <code>', 'Strudel code for the song')
  .option('--no-validate', 'Skip code validation')
  .action(async (name: string, opts: { code: string; validate: boolean }) => {
    try {
      // Validate code before saving (unless --no-validate)
      if (opts.validate !== false) {
        console.log(`${C.dim}Validating code...${C.reset}`);
        const result = await client.validate(opts.code);
        if (!result.valid) {
          const loc = result.line != null ? ` ${C.dim}(line ${result.line}, col ${result.column})${C.reset}` : '';
          console.error(`${C.red}✗ Code validation failed${loc}${C.reset}`);
          console.error(`  ${C.red}${result.error}${C.reset}`);
          console.error();
          formatCodeWithError(opts.code, result.line, result.column);
          console.error();
          console.error(`${C.dim}Tip: Fix the code and try again, or use --no-validate to skip validation.${C.reset}`);
          process.exit(1);
        }
      }

      const version = await storage.makeSong(name, opts.code);
      console.log(
        `${C.green}✓${C.reset} Created song ${C.cyan}${C.bold}${name}${C.reset} ${C.dim}(v1, ${version.createdAt})${C.reset}`,
      );
      console.log(`${C.dim}  Code: ${opts.code}${C.reset}`);
    } catch (err) {
      formatError(err as Error);
      process.exit(1);
    }
  });

// ── update ──

program
  .command('update')
  .description('Find & replace in a song\'s code and auto-play')
  .argument('<name>', 'Song name')
  .requiredOption('-f, --from <string>', 'Text to find')
  .requiredOption('-t, --to <string>', 'Replacement text')
  .option('-i, --index <n>', 'Occurrence index (0-based) if multiple matches', parseInt)
  .action(async (name: string, opts: { from: string; to: string; index?: number }) => {
    let updatedCode: string | undefined;
    try {
      const { code, version } = await storage.updateSong(name, opts.from, opts.to, opts.index);
      updatedCode = code;

      // Validate the updated code before playing
      console.log(`${C.dim}Validating updated code...${C.reset}`);
      const validation = await client.validate(code);
      if (!validation.valid) {
        const loc = validation.line != null ? ` ${C.dim}(line ${validation.line}, col ${validation.column})${C.reset}` : '';
        console.error(`${C.red}✗ Updated code has errors${loc}${C.reset}`);
        console.error(`  ${C.red}${validation.error}${C.reset}`);
        console.error();
        formatCodeWithError(code, validation.line, validation.column);
        console.error();
        console.error(`${C.yellow}⚠${C.reset} Song saved as v${version} but NOT playing due to errors.`);
        console.error(`${C.dim}Fix with: strudel update ${name} --from '...' --to '...'${C.reset}`);
        process.exit(1);
      }

      console.log(
        `${C.green}✓${C.reset} Updated ${C.cyan}${name}${C.reset} → ${C.bold}v${version}${C.reset}`,
      );
      console.log(`  ${C.dim}${opts.from}${C.reset} → ${C.green}${opts.to}${C.reset}`);

      // Auto-play the updated code
      console.log(`${C.dim}Sending updated code to daemon...${C.reset}`);
      await client.evaluate(code, name, version);
      console.log(
        `${C.green}▶${C.reset} ${C.bold}Now playing:${C.reset} ${C.cyan}${name}${C.reset} ${C.dim}(v${version})${C.reset}`,
      );
    } catch (err) {
      formatError(err as Error, updatedCode);
      process.exit(1);
    }
  });

// ── detail ──

program
  .command('detail')
  .description('Show song code and version info')
  .argument('<name>', 'Song name')
  .option('--ver <n>', 'Version number (default: latest)', parseInt)
  .action(async (name: string, opts: { ver?: number }) => {
    try {
      const detail = await storage.detailSong(name, opts.ver);

      console.log(
        `${C.cyan}${C.bold}${name}${C.reset} — v${detail.version}/${detail.totalVersions} ${C.dim}(${detail.createdAt})${C.reset}`,
      );
      console.log();
      console.log(`${C.dim}┌──────────────────────────────────${C.reset}`);
      for (const line of detail.code.split('\n')) {
        console.log(`${C.dim}│${C.reset} ${line}`);
      }
      console.log(`${C.dim}└──────────────────────────────────${C.reset}`);
    } catch (err) {
      console.error(`${C.red}✗${C.reset} ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── version-change ──

program
  .command('version-change')
  .description('Roll back to a previous version as a smooth update (no stop/start)')
  .argument('<version>', 'Version number to restore', parseInt)
  .option('-n, --name <name>', 'Song name (default: currently playing song)')
  .action(async (version: number, opts: { name?: string }) => {
    try {
      if (isNaN(version) || !Number.isInteger(version) || version < 1) {
        console.error(`${C.red}✗${C.reset} Invalid version number: must be a positive integer.`);
        process.exit(1);
      }

      let songName = opts.name;

      if (!songName) {
        const running = await client.isDaemonRunning();
        if (!running) {
          console.error(
            `${C.red}✗${C.reset} No song specified and daemon is not running. Use ${C.dim}--name <song>${C.reset} or start playing first.`,
          );
          process.exit(1);
        }
        const cur = await client.getCurrent();
        if (!cur.name) {
          console.error(
            `${C.red}✗${C.reset} No song is currently loaded. Use ${C.dim}--name <song>${C.reset} to specify one.`,
          );
          process.exit(1);
        }
        songName = cur.name;
      }

      const { code, fromVersion, newVersion } = await storage.promoteVersion(songName, version);

      console.log(
        `${C.green}✓${C.reset} Promoted ${C.cyan}${songName}${C.reset} v${fromVersion} → ${C.bold}v${newVersion}${C.reset}`,
      );

      await client.evaluate(code, songName, newVersion);
      console.log(
        `${C.green}▶${C.reset} ${C.bold}Now playing:${C.reset} ${C.cyan}${songName}${C.reset} ${C.dim}(v${newVersion})${C.reset}`,
      );
    } catch (err) {
      formatError(err as Error);
      process.exit(1);
    }
  });

// ── sequence ──

program
  .command('sequence')
  .description('Chain specific historical versions of a song with per-step delays')
  .argument('<name>', 'Song name')
  .requiredOption('--versions <json>', 'JSON array of [version, delaySec] pairs')
  .action(async (name: string, opts: { versions: string }) => {
    // Parse JSON
    let steps: unknown;
    try {
      steps = JSON.parse(opts.versions);
    } catch {
      console.error(
        `${C.red}✗${C.reset} Invalid JSON for --versions. Expected format: ${C.dim}[[version, delaySec], ...]${C.reset}`,
      );
      console.error(`${C.dim}  Example: '[[1,8],[3,12],[2,6]]'${C.reset}`);
      process.exit(1);
    }

    // Validate structure
    if (!Array.isArray(steps) || steps.length === 0) {
      console.error(`${C.red}✗${C.reset} --versions must be a non-empty JSON array.`);
      process.exit(1);
    }

    for (let i = 0; i < steps.length; i++) {
      const item = steps[i];
      if (
        !Array.isArray(item) ||
        item.length !== 2 ||
        typeof item[0] !== 'number' ||
        typeof item[1] !== 'number'
      ) {
        console.error(
          `${C.red}✗${C.reset} Invalid entry at index ${i}: each item must be ${C.dim}[version, delaySec]${C.reset} (two numbers).`,
        );
        process.exit(1);
      }
      const [ver, delay] = item as [number, number];
      if (!Number.isInteger(ver) || ver < 1) {
        console.error(
          `${C.red}✗${C.reset} Invalid version at index ${i}: must be a positive integer, got ${ver}.`,
        );
        process.exit(1);
      }
      if (delay < 0) {
        console.error(
          `${C.red}✗${C.reset} Invalid delay at index ${i}: must be >= 0, got ${delay}.`,
        );
        process.exit(1);
      }
    }

    const validated = steps as [number, number][];
    const total = validated.length;

    try {
      for (let i = 0; i < total; i++) {
        const [ver, delay] = validated[i];
        const { code, newVersion } = await storage.promoteVersion(name, ver);
        await client.evaluate(code, name, newVersion);

        if (i < total - 1) {
          console.log(
            `${C.green}▶${C.reset} ${C.dim}[${i + 1}/${total}]${C.reset} v${ver} → new v${newVersion}, next in ${delay}s`,
          );
          await new Promise((r) => setTimeout(r, delay * 1000));
        } else {
          console.log(
            `${C.green}▶${C.reset} ${C.dim}[${i + 1}/${total}]${C.reset} v${ver} → new v${newVersion} ${C.dim}(done)${C.reset}`,
          );
        }
      }

      console.log(
        `${C.green}✓${C.reset} Sequence complete for ${C.cyan}${name}${C.reset} — ${total} step(s) applied.`,
      );
    } catch (err) {
      formatError(err as Error);
      process.exit(1);
    }
  });

// ── delete ──

program
  .command('delete')
  .description('Delete a saved song')
  .argument('<name>', 'Song name')
  .action(async (name: string) => {
    try {
      // If the song is currently playing, stop playback first
      const running = await client.isDaemonRunning();
      if (running) {
        const cur = await client.getCurrent();
        if (cur.name === name && cur.state !== 'stopped') {
          await client.stop();
          console.log(`${C.yellow}■${C.reset} Stopped playback of ${C.cyan}${name}${C.reset}.`);
        }
      }

      await storage.deleteSong(name);
      console.log(`${C.green}✓${C.reset} Deleted song ${C.cyan}${C.bold}${name}${C.reset}.`);
    } catch (err) {
      console.error(`${C.red}✗${C.reset} ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── rename ──

program
  .command('rename')
  .description('Rename a saved song')
  .argument('<old-name>', 'Current song name')
  .argument('<new-name>', 'New song name')
  .action(async (oldName: string, newName: string) => {
    try {
      await storage.renameSong(oldName, newName);
      console.log(`${C.green}✓${C.reset} Renamed ${C.cyan}${C.bold}${oldName}${C.reset} → ${C.cyan}${C.bold}${newName}${C.reset}`);
    } catch (err) {
      console.error(`${C.red}✗${C.reset} ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── list ──

program
  .command('list')
  .description('List all saved songs')
  .action(async () => {
    try {
      const songs = await storage.listSongs();

      if (songs.length === 0) {
        console.log(`${C.dim}No songs yet. Use 'strudel make <name> --code <code>' to create one.${C.reset}`);
        return;
      }

      console.log(`${C.bold}Songs:${C.reset}`);
      for (const name of songs) {
        const detail = await storage.detailSong(name);
        console.log(
          `  ${C.cyan}${name}${C.reset} ${C.dim}(${detail.totalVersions} version${detail.totalVersions > 1 ? 's' : ''})${C.reset}`,
        );
      }
    } catch (err) {
      console.error(`${C.red}✗${C.reset} ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── Parse and execute ──

program.parse();
