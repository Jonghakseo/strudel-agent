/**
 * Strudel engine wrapper.
 *
 * IMPORTANT: polyfill.ts is imported first (side-effect) to set up
 * browser API stubs before any Strudel module loads.
 */

import './polyfill.js';
import type { StrudelEngine } from './types.js';

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

  // Create the REPL instance
  const replInstance = (core as any).repl({
    defaultOutput: (webaudio as any).webaudioOutput,
    getTime: () => audioContext.currentTime,
  });

  // Verify repl was created
  if (!replInstance || !replInstance.evaluate) {
    throw new Error('Failed to create Strudel REPL — no evaluate method');
  }

  const evaluate = async (code: string): Promise<void> => {
    try {
      await replInstance.evaluate(code);
    } catch (err) {
      const msg = (err as Error).message;
      // Strudel's repl might log errors without throwing — check for common issues
      throw new Error(`Strudel evaluation error: ${msg}`);
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

  return { evaluate, stop, pause, start };
}
