/**
 * Strudel daemon — long-running background process that holds the audio engine.
 *
 * Starts an HTTP server on a random port, writes { port, pid } to daemon.pid,
 * and responds to play/stop/pause/evaluate/current commands.
 *
 * Auto-exits after 30 minutes of inactivity.
 */

// Catch known superdough errors that are non-fatal (buffer management in Node)
process.on('uncaughtException', (err) => {
  // Known superdough issues in Node.js — suppress silently
  if (err.message?.includes('Cannot call `start` twice')) return;
  if (err.message?.includes('Cannot call `stop`')) return;
  if (err.message?.includes('invalid state')) return;
  log(`Uncaught exception: ${err.message}\n${err.stack}`);
});

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { writeFile, unlink } from 'node:fs/promises';
import { createEngine } from './engine.js';
import { PID_FILE, DAEMON_HOST, INACTIVITY_TIMEOUT_MS, DAEMON_LOG, STRUDEL_DIR } from './constants.js';
import { mkdirSync, appendFileSync, existsSync } from 'node:fs';
import type { DaemonState, StrudelEngine } from './types.js';

// ── Logging ──

function ensureDir() {
  if (!existsSync(STRUDEL_DIR)) {
    mkdirSync(STRUDEL_DIR, { recursive: true });
  }
}

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    ensureDir();
    appendFileSync(DAEMON_LOG, line);
  } catch {
    // If logging fails, continue silently
  }
}

// ── State ──

let engine: StrudelEngine | null = null;
let state: DaemonState = { state: 'stopped' };
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(async () => {
    log('Inactivity timeout reached. Shutting down.');
    await cleanup();
    process.exit(0);
  }, INACTIVITY_TIMEOUT_MS);
}

// ── Request Parsing ──

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// ── Route Handlers ──

function handleHealth(res: ServerResponse) {
  json(res, 200, { ok: true, pid: process.pid });
}

function handleCurrent(res: ServerResponse) {
  json(res, 200, { ...state });
}

async function handlePlay(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readBody(req);
    const { code, name, version } = JSON.parse(body);

    if (!code || typeof code !== 'string') {
      json(res, 400, { ok: false, error: 'Missing "code" in request body' });
      return;
    }

    if (!engine) {
      json(res, 500, { ok: false, error: 'Engine not initialized' });
      return;
    }

    // Stop current playback if any
    if (state.state === 'playing') {
      engine.stop();
    }

    // Evaluate new code (starts playback automatically)
    await engine.evaluate(code);

    state = {
      state: 'playing',
      name: name || undefined,
      version: version || undefined,
      code,
    };

    resetInactivityTimer();
    log(`Playing: ${name || 'anonymous'} v${version || '?'}`);
    json(res, 200, { ok: true, name: state.name, version: state.version, state: state.state });
  } catch (err) {
    log(`Play error: ${(err as Error).message}`);
    json(res, 500, { ok: false, error: (err as Error).message });
  }
}

async function handleStop(res: ServerResponse) {
  try {
    if (engine) {
      engine.stop();
    }
    state = { state: 'stopped' };
    resetInactivityTimer();
    log('Stopped playback');
    json(res, 200, { ok: true, state: 'stopped' });
  } catch (err) {
    log(`Stop error: ${(err as Error).message}`);
    json(res, 500, { ok: false, error: (err as Error).message });
  }
}

async function handlePause(res: ServerResponse) {
  try {
    if (engine) {
      engine.pause();
    }
    if (state.state === 'playing') {
      state = { ...state, state: 'paused' };
    }
    resetInactivityTimer();
    log('Paused playback');
    json(res, 200, { ok: true, state: 'paused' });
  } catch (err) {
    log(`Pause error: ${(err as Error).message}`);
    json(res, 500, { ok: false, error: (err as Error).message });
  }
}

async function handleEvaluate(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readBody(req);
    const { code, name, version } = JSON.parse(body);

    if (!code || typeof code !== 'string') {
      json(res, 400, { ok: false, error: 'Missing "code" in request body' });
      return;
    }

    if (!engine) {
      json(res, 500, { ok: false, error: 'Engine not initialized' });
      return;
    }

    // Evaluate new code — Strudel's REPL seamlessly replaces the active pattern
    // without stopping the scheduler, so the transition is smooth (no gap).
    await engine.evaluate(code);

    state = {
      state: 'playing',
      name: name || state.name,
      version: version || state.version,
      code,
    };

    resetInactivityTimer();
    log(`Evaluated: ${name || 'anonymous'} v${version || '?'}`);
    json(res, 200, { ok: true });
  } catch (err) {
    log(`Evaluate error: ${(err as Error).message}`);
    json(res, 500, { ok: false, error: (err as Error).message });
  }
}

async function handleValidate(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readBody(req);
    const { code } = JSON.parse(body);

    if (!code || typeof code !== 'string') {
      json(res, 400, { ok: false, error: 'Missing "code" in request body' });
      return;
    }

    if (!engine) {
      json(res, 500, { ok: false, error: 'Engine not initialized' });
      return;
    }

    const result = engine.validate(code);
    log(`Validate: valid=${result.valid}${result.error ? ` error=${result.error}` : ''}`);
    json(res, 200, { ok: true, ...result });
  } catch (err) {
    log(`Validate error: ${(err as Error).message}`);
    json(res, 500, { ok: false, error: (err as Error).message });
  }
}

// ── HTTP Server ──

const server = createServer(async (req, res) => {
  const url = req.url || '/';
  const method = req.method || 'GET';

  try {
    if (method === 'GET' && url === '/health') {
      handleHealth(res);
    } else if (method === 'GET' && url === '/current') {
      handleCurrent(res);
    } else if (method === 'POST' && url === '/play') {
      await handlePlay(req, res);
    } else if (method === 'POST' && url === '/stop') {
      await handleStop(res);
    } else if (method === 'POST' && url === '/pause') {
      await handlePause(res);
    } else if (method === 'POST' && url === '/evaluate') {
      await handleEvaluate(req, res);
    } else if (method === 'POST' && url === '/validate') {
      await handleValidate(req, res);
    } else {
      json(res, 404, { ok: false, error: 'Not found' });
    }
  } catch (err) {
    log(`Server error: ${(err as Error).message}`);
    json(res, 500, { ok: false, error: 'Internal server error' });
  }
});

// ── Cleanup ──

async function cleanup() {
  log('Cleaning up...');

  if (engine) {
    try {
      engine.stop();
    } catch {
      // Best effort
    }
  }

  try {
    await unlink(PID_FILE);
  } catch {
    // File might not exist
  }

  server.close();
}

// ── Startup ──

async function main() {
  log('Daemon starting...');

  // Initialize the Strudel engine
  try {
    engine = await createEngine();
    log('Strudel engine initialized successfully');
  } catch (err) {
    log(`Failed to initialize engine: ${(err as Error).message}`);
    process.exit(1);
  }

  // Start HTTP server on random port
  await new Promise<void>((resolve) => {
    server.listen(0, DAEMON_HOST, () => {
      resolve();
    });
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    log('Failed to get server address');
    process.exit(1);
  }

  const port = addr.port;
  const pidInfo = JSON.stringify({ port, pid: process.pid });

  ensureDir();
  await writeFile(PID_FILE, pidInfo, 'utf-8');

  log(`Daemon ready on ${DAEMON_HOST}:${port} (pid: ${process.pid})`);

  // Start inactivity timer
  resetInactivityTimer();

  // Handle signals
  process.on('SIGTERM', async () => {
    log('Received SIGTERM');
    await cleanup();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    log('Received SIGINT');
    await cleanup();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    log(`Uncaught exception: ${err.message}\n${err.stack}`);
  });

  process.on('unhandledRejection', (reason) => {
    log(`Unhandled rejection: ${reason}`);
  });
}

main().catch((err) => {
  log(`Fatal error: ${(err as Error).message}`);
  process.exit(1);
});
