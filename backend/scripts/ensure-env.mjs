#!/usr/bin/env node
/**
 * Keeps a package's `.env` in step with its `.env.example`.
 *
 * - No `.env` yet: it is created from the example.
 * - New keys in the example (after an update): appended to the existing `.env` with their documentation and
 *   default. Values the user already set, comments, order and unknown keys are never touched, and a key that
 *   is commented out counts as present.
 * - Secrets (a key containing SECRET with an empty default) get a random value when they are added.
 *
 * Before that, it checks that every dependency in package.json is installed. After a pull that added
 * dependencies, `dev` and `build` stop with one clear message ("run pnpm install") instead of hundreds of
 * type errors. Set PLANTCARE_SKIP_DEP_CHECK=1 to skip the check.
 *
 * Runs before `dev`, `build` and `start`, so a settings file is never committed, never conflicts with a pull
 * and always has every setting. This file is identical in backend/scripts and frontend/scripts.
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KEY_PATTERN = '[A-Za-z_][A-Za-z0-9_]*';
const SECRET_KEY = /SECRET/;

/** Entries of an example file: key, default value and the comment lines directly above it. */
export const parseExample = (text) => {
  const entries = [];
  let comments = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#')) {
      comments.push(raw.trimEnd());
      continue;
    }
    const match = new RegExp(`^(${KEY_PATTERN})=(.*)$`).exec(line);
    if (match) entries.push({ key: match[1], value: match[2], comments });
    comments = [];
  }
  return entries;
};

const definedKeys = (text) =>
  new Set([...text.matchAll(new RegExp(`^\\s*#?\\s*(${KEY_PATTERN})=`, 'gm'))].map((m) => m[1]));

const randomSecret = () => randomBytes(48).toString('hex');

/** Names from package.json (dependencies and devDependencies) that are not installed in node_modules. */
export const findMissingDependencies = (packageDir) => {
  const manifestPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const names = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ];
  return names.filter(
    (name) => !fs.existsSync(path.join(packageDir, 'node_modules', name, 'package.json')),
  );
};

/**
 * Brings `envPath` up to date with `examplePath`.
 * @returns {{ created: boolean, added: string[] }}
 */
export const healEnv = ({
  examplePath,
  envPath,
  generateSecret = randomSecret,
  now = () => new Date(),
}) => {
  if (!fs.existsSync(examplePath)) return { created: false, added: [] };

  const entries = parseExample(fs.readFileSync(examplePath, 'utf8'));
  const existed = fs.existsSync(envPath);
  const current = existed ? fs.readFileSync(envPath, 'utf8') : '';
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const defined = definedKeys(current);
  const missing = entries.filter((entry) => !defined.has(entry.key));

  if (existed && missing.length === 0) return { created: false, added: [] };

  const block = [];
  for (const entry of missing) {
    block.push(...entry.comments);
    const value =
      entry.value === '' && SECRET_KEY.test(entry.key) ? generateSecret(entry.key) : entry.value;
    block.push(`${entry.key}=${value}`, '');
  }

  let output = current;
  if (existed) {
    if (output && !output.endsWith('\n')) output += eol;
    output += `${eol}# Added automatically from .env.example (${now().toISOString().slice(0, 10)}):${eol}`;
  } else {
    output = `# Created automatically from .env.example. Change the values; new settings are added here after updates.${eol}${eol}`;
  }
  output += block.join(eol);

  fs.writeFileSync(envPath, output, { mode: 0o600 });
  return { created: !existed, added: missing.map((entry) => entry.key) };
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const { created, added } = healEnv({
      examplePath: path.join(packageDir, '.env.example'),
      envPath: path.join(packageDir, '.env'),
    });
    if (created)
      console.log(
        `[env] Created ${path.join(packageDir, '.env')} from .env.example. Review the values.`,
      );
    else if (added.length > 0) console.log(`[env] Added new settings to .env: ${added.join(', ')}`);
  } catch (error) {
    console.warn(`[env] Could not update .env: ${error instanceof Error ? error.message : error}`);
  }

  if (process.env.PLANTCARE_SKIP_DEP_CHECK !== '1') {
    const missing = findMissingDependencies(packageDir);
    if (missing.length > 0) {
      const shown = missing.slice(0, 8).join(', ');
      const more = missing.length > 8 ? ` and ${missing.length - 8} more` : '';
      console.error(
        `[deps] ${missing.length} dependencies are not installed (${shown}${more}). ` +
          `The dependencies changed since the last install. Run: pnpm install (in ${packageDir})`,
      );
      process.exitCode = 1;
    }
  }
}
