#!/usr/bin/env node

/**
 * Post-install patches for Node.js compatibility under npm/pnpm:
 * 1) @kabelsalat/web exports map fix
 * 2) sfumato ESM import fix for CommonJS soundfont2 dependency
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const NODE_MODULES = join(ROOT, 'node_modules');
const PNPM_STORE = join(NODE_MODULES, '.pnpm');

async function findPnpmPackagePath(prefix, relativePath) {
  if (!existsSync(PNPM_STORE)) return null;
  const entries = await readdir(PNPM_STORE);
  const dir = entries.find((e) => e.startsWith(prefix));
  if (!dir) return null;
  const full = join(PNPM_STORE, dir, 'node_modules', ...relativePath);
  return existsSync(full) ? full : null;
}

async function resolvePath(directPath, pnpmPrefix, pnpmRelativePath) {
  if (existsSync(directPath)) return directPath;
  return findPnpmPackagePath(pnpmPrefix, pnpmRelativePath);
}

async function patchKabelsalat() {
  const pkgPath = await resolvePath(
    join(NODE_MODULES, '@kabelsalat', 'web', 'package.json'),
    '@kabelsalat+web@',
    ['@kabelsalat', 'web', 'package.json'],
  );

  if (!pkgPath) {
    console.log('[postinstall] @kabelsalat/web not found, skipping patch.');
    return;
  }

  const raw = await readFile(pkgPath, 'utf-8');
  const pkg = JSON.parse(raw);

  if (pkg.exports) {
    console.log('[postinstall] @kabelsalat/web already patched.');
    return;
  }

  pkg.main = 'dist/index.mjs';
  pkg.exports = {
    '.': {
      import: './dist/index.mjs',
      default: './dist/index.mjs',
    },
  };

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  console.log('[postinstall] Patched @kabelsalat/web exports.');
}

async function patchSfumato() {
  const sfumatoPath = await resolvePath(
    join(NODE_MODULES, 'sfumato', 'dist', 'sfumato.js'),
    'sfumato@',
    ['sfumato', 'dist', 'sfumato.js'],
  );

  if (!sfumatoPath) {
    console.log('[postinstall] sfumato not found, skipping patch.');
    return;
  }

  let code = await readFile(sfumatoPath, 'utf-8');

  if (code.includes('import soundfont2Pkg from "soundfont2"')) {
    console.log('[postinstall] sfumato already patched.');
    return;
  }

  const target = 'import { DEFAULT_GENERATOR_VALUES as w, SoundFont2 as q } from "soundfont2";';
  const replacement = 'import soundfont2Pkg from "soundfont2";\nconst { DEFAULT_GENERATOR_VALUES: w, SoundFont2: q } = soundfont2Pkg;';

  if (!code.includes(target)) {
    console.log('[postinstall] sfumato import pattern not found, skipping patch.');
    return;
  }

  code = code.replace(target, replacement);
  await writeFile(sfumatoPath, code, 'utf-8');
  console.log('[postinstall] Patched sfumato soundfont2 import.');
}

async function main() {
  await patchKabelsalat();
  await patchSfumato();
}

main().catch((err) => {
  console.error('[postinstall] Failed to patch:', err.message);
});
