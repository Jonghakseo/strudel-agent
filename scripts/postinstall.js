#!/usr/bin/env node

/**
 * Post-install patch for @kabelsalat/web.
 *
 * The package's ESM entry isn't correctly resolved by Node.js because
 * it lacks an "exports" field and "main" points to the CJS/IIFE build.
 * We patch package.json to add the correct "exports" map.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, '..', 'node_modules', '@kabelsalat', 'web', 'package.json');

async function patch() {
  if (!existsSync(pkgPath)) {
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

patch().catch((err) => {
  console.error('[postinstall] Failed to patch:', err.message);
});
