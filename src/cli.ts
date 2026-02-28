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
 *   list                                      List all saved songs
 */

import { Command } from 'commander';
import { C } from './constants.js';
import * as storage from './storage.js';
import * as client from './client.js';

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
    try {
      const { code, version } = await storage.getSongCode(name, opts.ver);
      console.log(`${C.dim}Starting daemon...${C.reset}`);

      const result = await client.play(code, name, version);

      console.log(
        `${C.green}▶${C.reset} ${C.bold}Now playing:${C.reset} ${C.cyan}${result.name}${C.reset} ${C.dim}(v${result.version})${C.reset}`,
      );
    } catch (err) {
      console.error(`${C.red}✗${C.reset} ${(err as Error).message}`);
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
    try {
      const { code, version } = await storage.updateSong(name, opts.from, opts.to, opts.index);

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
      console.error(`${C.red}✗${C.reset} ${(err as Error).message}`);
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
