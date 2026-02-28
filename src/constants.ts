import { homedir } from 'node:os';
import { join } from 'node:path';

// ── Directory & File Paths ──

export const STRUDEL_DIR = join(homedir(), '.strudel-cli');
export const SONGS_FILE = join(STRUDEL_DIR, 'songs.json');
export const PID_FILE = join(STRUDEL_DIR, 'daemon.pid');
export const DAEMON_LOG = join(STRUDEL_DIR, 'daemon.log');

// ── Daemon Config ──

export const DAEMON_HOST = '127.0.0.1';
export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const HEALTH_POLL_INTERVAL_MS = 200;
export const HEALTH_POLL_MAX_ATTEMPTS = 75; // 15 seconds total

// ── Colors (ANSI escape codes — zero dependencies) ──

export const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
} as const;
