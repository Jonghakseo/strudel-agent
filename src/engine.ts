/**
 * Strudel engine wrapper.
 *
 * IMPORTANT: polyfill.ts is imported first (side-effect) to set up
 * browser API stubs before any Strudel module loads.
 */

import './polyfill.js';
import type { StrudelEngine, ValidationResult } from './types.js';

export async function createEngine(): Promise<StrudelEngine> {
  // Dynamic imports — Strudel modules read globalThis at import time,
  // so the polyfill MUST have run before these lines execute.

  const core = await import('@strudel/core');
  const mini = await import('@strudel/mini');
  const webaudio = await import('@strudel/webaudio');

  let tonal: Record<string, unknown> | null = null;
  try {
    tonal = await import('@strudel/tonal') as any;
  } catch {
    // @strudel/tonal is optional
  }

  let transpiler: Record<string, unknown> | null = null;
  try {
    transpiler = await import('@strudel/transpiler') as any;
  } catch {
    // @strudel/transpiler is optional
  }

  // Register ALL Strudel functions on globalThis so that eval'd code can reference them.
  // This is critical because Strudel's repl uses eval() internally, and functions like
  // `note()`, `s()`, `sound()`, etc. must be globally accessible.
  const g = globalThis as Record<string, unknown>;

  const modules = [core, mini, webaudio];
  if (tonal) modules.push(tonal);
  if (transpiler) modules.push(transpiler);

  for (const mod of modules) {
    for (const [key, value] of Object.entries(mod)) {
      // Skip internal/private keys and avoid overwriting critical Node globals
      if (key.startsWith('_')) continue;
      if (['process', 'Buffer', 'global', 'module', 'exports', 'require'].includes(key)) continue;
      g[key] = value;
    }
  }

  // Enable mini-notation on all strings: "c3 e3 g3".mini()
  if (typeof (mini as any).miniAllStrings === 'function') {
    (mini as any).miniAllStrings();
  }

  // Create a real AudioContext via node-web-audio-api
  const { AudioContext: NodeAudioContext } = await import('node-web-audio-api');
  const audioContext = new NodeAudioContext({
    latencyHint: 'playback' as any,
    sampleRate: 44100,
  });

  // Set audio context for superdough/webaudio
  if (typeof (webaudio as any).setDefaultAudioContext === 'function') {
    (webaudio as any).setDefaultAudioContext(audioContext);
  }
  if (typeof (webaudio as any).setAudioContext === 'function') {
    (webaudio as any).setAudioContext(audioContext);
  }

  // Register synth sounds (triangle, sawtooth, sine, square, noise)
  if (typeof (webaudio as any).registerSynthSounds === 'function') {
    try {
      await (webaudio as any).registerSynthSounds();
    } catch {
      // May fail if some sounds need network — not critical
    }
  }

  // Register ZZFX sounds (z_sawtooth, z_sine, etc.)
  if (typeof (webaudio as any).registerZZFXSounds === 'function') {
    try {
      await (webaudio as any).registerZZFXSounds();
    } catch {
      // Not critical
    }
  }

  // Load default sample libraries — mirrors the browser REPL's prebake.mjs
  // Source: https://codeberg.org/uzu/strudel/src/branch/main/packages/repl/prebake.mjs
  const samplesFn = (webaudio as any).samples;
  if (typeof samplesFn === 'function') {
    const ds = 'https://raw.githubusercontent.com/felixroos/dough-samples/main';
    const sampleSources = [
      [`${ds}/tidal-drum-machines.json`, 'drum machines (TR808, TR909 etc.)'],
      [`${ds}/piano.json`, 'piano'],
      [`${ds}/Dirt-Samples.json`, 'dirt samples (bd, sd, hh etc.)'],
      [`${ds}/vcsl.json`, 'VCSL (gm_acoustic_bass, gm_synth_strings_1 etc.)'],
    ];
    const results = await Promise.allSettled(
      sampleSources.map(([url, label]) =>
        samplesFn(url).then(() => console.log(`[engine] Loaded: ${label}`))
      )
    );
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      console.log(`[engine] Warning: ${failed.length} sample source(s) failed to load`);
    }
  }

  // Register soundfonts (additional GM instruments)
  try {
    const soundfonts = await import('@strudel/soundfonts');
    if (typeof soundfonts.registerSoundfonts === 'function') {
      await soundfonts.registerSoundfonts();
      console.log('[engine] Soundfonts registered');
    }
  } catch (err: any) {
    console.log(`[engine] Warning: Soundfonts unavailable: ${err.message || err}`);
  }

  // Register alias bank for drum machines
  if (typeof (webaudio as any).aliasBank === 'function') {
    try {
      const ts = 'https://raw.githubusercontent.com/todepond/samples/main';
      await (webaudio as any).aliasBank(`${ts}/tidal-drum-machines-alias.json`);
    } catch {
      // Not critical
    }
  }

  // Also register on globalThis so user code can call samples()
  (globalThis as any).samples = samplesFn;

  // Create the REPL instance — transpiler is CRITICAL for:
  // - $: syntax (parallel patterns)
  // - multi-statement code (setcpm() + stack())
  // - double-quote → mini notation conversion
  // - return injection (wrapping last expression)
  const replOptions: Record<string, unknown> = {
    defaultOutput: (webaudio as any).webaudioOutput,
    getTime: () => audioContext.currentTime,
  };

  const transpilerFn = transpiler && (transpiler as any).transpiler;
  if (transpilerFn) {
    replOptions.transpiler = transpilerFn;
  }
  const replInstance = (core as any).repl(replOptions);

  // Verify repl was created
  if (!replInstance || !replInstance.evaluate) {
    throw new Error('Failed to create Strudel REPL — no evaluate method');
  }

  // ── Validation ──
  // Uses the transpiler to pre-check code for syntax errors and
  // mini-notation parse errors WITHOUT executing the code.
  // Pre-process code for CLI input: CLI users pass code as a single line,
  // but Strudel expects $: patterns on separate lines and proper statement separation.
  const preprocessCode = (code: string): string => {
    let result = code;
    // Add newline before $: if preceded by non-whitespace (e.g., "setcpm(30) $:" → "setcpm(30)\n$:")
    result = result.replace(/([^\n;])\s+\$:/g, '$1;\n$:');
    // Add newline before _$: (muted patterns)
    result = result.replace(/([^\n;])\s+_\$:/g, '$1;\n_$:');
    return result;
  };

  const validate = (code: string): ValidationResult => {
    const processed = preprocessCode(code);
    // Step 1: Try transpiling (catches JS syntax errors and mini-notation errors)
    if (transpilerFn) {
      try {
        transpilerFn(processed);
      } catch (err: any) {
        const msg = err.message || String(err);
        return {
          valid: false,
          error: msg,
          line: err.loc?.line,
          column: err.loc?.column,
        };
      }
    }

    // Step 2: If no transpiler, try basic JS syntax check via Function constructor
    if (!transpilerFn) {
      try {
        // eslint-disable-next-line no-new-func
        new Function(code);
      } catch (err: any) {
        return {
          valid: false,
          error: err.message || String(err),
        };
      }
    }

    return { valid: true };
  };

  // ── Evaluate with error capture ──
  // Strudel REPL's evaluate() NEVER throws — it logs errors to console
  // and resolves with undefined. We intercept console.error to capture
  // these swallowed errors and throw them properly.
  const evaluate = async (code: string): Promise<void> => {
    // Pre-process for CLI single-line input
    code = preprocessCode(code);
    // Pre-validate: catches syntax and mini-notation errors before eval
    const validation = validate(code);
    if (!validation.valid) {
      const loc = validation.line != null ? ` (line ${validation.line}, col ${validation.column})` : '';
      throw new Error(`Syntax error${loc}: ${validation.error}`);
    }

    // Intercept console to capture Strudel's swallowed errors.
    // Strudel REPL logs errors in two parts:
    //   console.log("%c[eval] error: <msg>", "background-color:...;color:...;...")
    //   console.error("ErrorType: <msg>")
    // We capture both and extract the clean error message.
    const capturedErrors: string[] = [];
    const origConsoleError = console.error;
    const origConsoleLog = console.log;

    console.error = (...args: any[]) => {
      const firstArg = typeof args[0] === 'string' ? args[0] : String(args[0]);
      // Strudel logs the raw Error object/message via console.error
      if (firstArg.includes('Error:') || firstArg.includes('error')) {
        capturedErrors.push(firstArg);
      }
      origConsoleError.apply(console, args);
    };

    console.log = (...args: any[]) => {
      const firstArg = typeof args[0] === 'string' ? args[0] : String(args[0]);
      // Strudel logs "[eval] error: ..." via console.log with %c CSS
      if (firstArg.includes('[eval] error:')) {
        // Strip %c and extract the actual error message
        const cleaned = firstArg.replace(/%c/g, '').trim();
        capturedErrors.push(cleaned);
      }
      origConsoleLog.apply(console, args);
    };

    try {
      await replInstance.evaluate(code);
    } catch (err: any) {
      // If REPL does throw (unlikely but possible), capture it
      capturedErrors.push(err.message || String(err));
    } finally {
      // Restore console
      console.error = origConsoleError;
      console.log = origConsoleLog;
    }

    // If errors were captured, throw them
    if (capturedErrors.length > 0) {
      // Extract the most meaningful error message.
      // Strudel logs errors in two parts:
      //   "[eval] error: <short msg>"  (via console.log)
      //   "ErrorType: <full msg>"      (via console.error)
      // We prefer the [eval] error version as it's more concise.
      const errorMsg = capturedErrors
        .map(msg => {
          // Clean up "[eval] error: " prefix
          const cleaned = msg.replace(/^\[eval\] error:\s*/i, '').trim();
          // Remove stack trace lines (keep first meaningful line)
          const firstLine = cleaned.split('\n')[0].trim();
          return firstLine;
        })
        .filter(Boolean);

      // Deduplicate (Strudel logs error msg twice: once in [eval] and once as Error)
      const unique = [...new Set(errorMsg)];

      // Prefer the shorter/cleaner message (usually the [eval] error one)
      const bestMsg = unique.reduce((a, b) => a.length <= b.length ? a : b, unique[0]);
      throw new Error(`Evaluation error: ${bestMsg}`);
    }
  };

  const stop = (): void => {
    try {
      if (replInstance.stop) {
        replInstance.stop();
      } else if (replInstance.scheduler?.stop) {
        replInstance.scheduler.stop();
      }
    } catch {
      // Best effort
    }
  };

  const pause = (): void => {
    try {
      if (replInstance.pause) {
        replInstance.pause();
      } else if (replInstance.scheduler?.pause) {
        replInstance.scheduler.pause();
      } else {
        // Fallback: just stop
        stop();
      }
    } catch {
      // Best effort
    }
  };

  const start = (): void => {
    try {
      if (replInstance.start) {
        replInstance.start();
      } else if (replInstance.scheduler?.start) {
        replInstance.scheduler.start();
      }
    } catch {
      // Best effort
    }
  };

  return { evaluate, validate, stop, pause, start };
}
