/**
 * WebAudio polyfill for Node.js — MUST be imported before any Strudel modules.
 *
 * Uses `node-web-audio-api` (Rust-backed) to provide the Web Audio API in Node.js.
 * Also stubs browser-only globals (document, window, navigator, etc.) that Strudel
 * may reference during initialization.
 */

import * as webAudio from 'node-web-audio-api';

const g = globalThis as Record<string, unknown>;

// ── Helper to safely set a global (some are getters in modern Node) ──

function safeSet(key: string, value: unknown) {
  try {
    // Try direct assignment first
    (g as any)[key] = value;
  } catch {
    // If it's a non-configurable getter, use defineProperty
    try {
      Object.defineProperty(globalThis, key, {
        value,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } catch {
      // Truly non-configurable — skip silently
    }
  }
}

// ── Inject all WebAudio classes/functions into globalThis ──

for (const [key, value] of Object.entries(webAudio)) {
  safeSet(key, value);
}

// ── Stub `window` as globalThis ──
// Also ensure window has addEventListener/removeEventListener (superdough needs these)

if (!(g as any).addEventListener) {
  safeSet('addEventListener', () => {});
}
if (!(g as any).removeEventListener) {
  safeSet('removeEventListener', () => {});
}
if (!(g as any).dispatchEvent) {
  safeSet('dispatchEvent', () => true);
}

safeSet('window', g);

// ── Stub `document` ──

safeSet('document', {
  createElement: () => ({
    getContext: () => null,
    style: {},
    setAttribute: () => {},
    getAttribute: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    innerHTML: '',
    textContent: '',
    id: '',
    tagName: 'DIV',
  }),
  createElementNS: () => ({
    getContext: () => null,
    style: {},
    setAttribute: () => {},
    addEventListener: () => {},
  }),
  body: { appendChild: () => {}, removeChild: () => {}, style: {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  getElementsByClassName: () => [],
  getElementsByTagName: () => [],
  head: { appendChild: () => {}, removeChild: () => {} },
  createTextNode: () => ({}),
  createDocumentFragment: () => ({ appendChild: () => {} }),
  documentElement: { style: {} },
  cookie: '',
  title: '',
  readyState: 'complete',
});

// ── Stub `navigator` ──

safeSet('navigator', {
  userAgent: 'node',
  platform: 'node',
  language: 'en',
  languages: ['en'],
  mediaDevices: {
    getUserMedia: () => Promise.reject(new Error('Not supported in Node.js')),
  },
  requestMIDIAccess: () => Promise.reject(new Error('MIDI not available in Node.js')),
});

// ── Stub `CustomEvent` ──

if (!(g as any).CustomEvent || typeof (g as any).CustomEvent !== 'function') {
  class NodeCustomEvent extends Event {
    detail: unknown;
    constructor(type: string, opts?: { detail?: unknown; bubbles?: boolean; cancelable?: boolean }) {
      super(type, opts);
      this.detail = opts?.detail;
    }
  }
  safeSet('CustomEvent', NodeCustomEvent);
}

// ── Stub animation frame ──

if (!(g as any).requestAnimationFrame) {
  safeSet('requestAnimationFrame', (cb: Function) => setTimeout(cb, 16) as unknown as number);
}
if (!(g as any).cancelAnimationFrame) {
  safeSet('cancelAnimationFrame', (id: unknown) => clearTimeout(id as number));
}

// ── Stub HTMLElement ──

if (!(g as any).HTMLElement) {
  safeSet('HTMLElement', class HTMLElement {});
}

// ── Stub location ──

safeSet('location', {
  href: 'http://localhost',
  hostname: 'localhost',
  protocol: 'http:',
  search: '',
  hash: '',
  pathname: '/',
  origin: 'http://localhost',
  host: 'localhost',
});

// ── Stub `self` (some libs check for this) ──

if (!(g as any).self) {
  safeSet('self', g);
}

// ── Ensure fetch exists (Node 18+ has native fetch) ──

if (!(g as any).fetch) {
  safeSet('fetch', () => Promise.reject(new Error('fetch not available')));
}

// ── Stub AudioWorkletNode ──
// `node-web-audio-api` may not fully support AudioWorklet.
// Strudel uses AudioWorkletNode for some effects; this stub makes them silent passthroughs.

if (!(g as any).AudioWorkletNode) {
  safeSet(
    'AudioWorkletNode',
    class AudioWorkletNode {
      connect() {
        return this;
      }
      disconnect() {}
      addEventListener() {}
      removeEventListener() {}
      get port() {
        return {
          postMessage: () => {},
          onmessage: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          start: () => {},
          close: () => {},
        };
      }
      get parameters() {
        return new Map();
      }
      get numberOfInputs() {
        return 1;
      }
      get numberOfOutputs() {
        return 1;
      }
      get channelCount() {
        return 2;
      }
      get context() {
        return null;
      }
    },
  );
}

// ── Stub OfflineAudioContext if missing ──

if (!(g as any).OfflineAudioContext) {
  safeSet(
    'OfflineAudioContext',
    class OfflineAudioContext {
      constructor() {}
      startRendering() {
        return Promise.resolve(null);
      }
      createBufferSource() {
        return {
          connect: () => {},
          start: () => {},
          stop: () => {},
          buffer: null,
        };
      }
      get destination() {
        return {};
      }
    },
  );
}
