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

  // Register synth sounds
  if (typeof (webaudio as any).registerSynthSounds === 'function') {
    try {
      await (webaudio as any).registerSynthSounds();
    } catch {
      // May fail if some sounds need network — not critical
    }
  }

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
  const validate = (code: string): ValidationResult => {
    // Step 1: Try transpiling (catches JS syntax errors and mini-notation errors)
    if (transpilerFn) {
      try {
        transpilerFn(code);
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
    // Pre-validate: catches syntax and mini-notation errors before eval
    const validation = validate(code);
    if (!validation.valid) {
      const loc = validation.line != null ? ` (line ${validation.line}, col ${validation.column})` : '';
      throw new Error(`Syntax error${loc}: ${validation.error}`);
    }

    // Intercept console.error to capture Strudel's swallowed errors
    const capturedErrors: string[] = [];
    const origConsoleError = console.error;
    const origConsoleLog = console.log;

    console.error = (...args: any[]) => {
      const msg = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ');
      // Strudel logs errors with "[eval] error:" prefix
      if (msg.includes('[eval] error:') || msg.includes('Error:')) {
        capturedErrors.push(msg);
      }
      // Still log to original for daemon.log visibility
      origConsoleError.apply(console, args);
    };

    // Also capture console.log since some errors go there
    console.log = (...args: any[]) => {
      const msg = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ');
      if (msg.includes('[eval] error:')) {
        capturedErrors.push(msg);
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
      // Extract the most meaningful error message
      const errorMsg = capturedErrors
        .map(msg => {
          // Clean up "[eval] error: " prefix and CSS formatting from Strudel's console
          let cleaned = msg
            .replace(/^\[eval\] error:\s*/i, '')
            .replace(/%c/g, '')  // Remove %c format markers
            .replace(/background-color:[^;]+;/g, '')  // Remove CSS
            .replace(/color:[^;]+;/g, '')
            .replace(/border-radius:[^;]+;/g, '')
            .replace(/font-weight:[^;]+;/g, '')
            .trim();
          // Remove stack trace lines (keep first line)
          const firstLine = cleaned.split('\n')[0].trim();
          return firstLine;
        })
        .filter(Boolean);

      // Deduplicate (Strudel may log the same error with different formatting)
      const unique = [...new Set(errorMsg)];
      throw new Error(`Evaluation error: ${unique.join('; ')}`);
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
