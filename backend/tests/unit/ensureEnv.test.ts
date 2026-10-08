import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findMissingDependencies, healEnv, parseExample } from '../../scripts/ensure-env.mjs';

const example = [
  '# Header, separated by a blank line.',
  '',
  '# Address of the API.',
  'VITE_API_URL=',
  '',
  '# Name in the tab.',
  'VITE_APP_TITLE=Plantcare Tracker',
  '',
  '# Signing secret.',
  'SESSION_SECRET=',
  '',
].join('\n');

describe('healEnv', () => {
  let dir: string;
  let examplePath: string;
  let envPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-env-'));
    examplePath = path.join(dir, '.env.example');
    envPath = path.join(dir, '.env');
    fs.writeFileSync(examplePath, example);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the comments that sit directly above a key and drops detached headers', () => {
    const entries = parseExample(example);
    expect(entries.map((e) => e.key)).toEqual(['VITE_API_URL', 'VITE_APP_TITLE', 'SESSION_SECRET']);
    expect(entries[0].comments).toEqual(['# Address of the API.']);
  });

  it('creates the file with defaults and generates empty secrets', () => {
    const result = healEnv({ examplePath, envPath, generateSecret: () => 'generated' });
    const text = fs.readFileSync(envPath, 'utf8');
    expect(result).toEqual({
      created: true,
      added: ['VITE_API_URL', 'VITE_APP_TITLE', 'SESSION_SECRET'],
    });
    expect(text).toContain('VITE_APP_TITLE=Plantcare Tracker');
    expect(text).toContain('SESSION_SECRET=generated');
    expect(text).toContain('# Name in the tab.');
  });

  it('appends only the missing keys and never touches existing values', () => {
    fs.writeFileSync(envPath, 'VITE_API_URL=http://plants.lan.net/api/v2\nCUSTOM=1\n');
    const result = healEnv({ examplePath, envPath, generateSecret: () => 'generated' });
    const text = fs.readFileSync(envPath, 'utf8');
    expect(result.added).toEqual(['VITE_APP_TITLE', 'SESSION_SECRET']);
    expect(text.startsWith('VITE_API_URL=http://plants.lan.net/api/v2\nCUSTOM=1\n')).toBe(true);
    expect(text).toContain('# Added automatically from .env.example');
    expect(text.match(/VITE_API_URL=/g)).toHaveLength(1);
  });

  it('respects a key the user commented out', () => {
    fs.writeFileSync(envPath, '# VITE_APP_TITLE=Mine\nVITE_API_URL=\nSESSION_SECRET=kept\n');
    expect(healEnv({ examplePath, envPath })).toEqual({ created: false, added: [] });
    expect(fs.readFileSync(envPath, 'utf8')).toBe(
      '# VITE_APP_TITLE=Mine\nVITE_API_URL=\nSESSION_SECRET=kept\n',
    );
  });

  it('changes nothing when the file is complete and keeps CRLF line endings', () => {
    fs.writeFileSync(envPath, 'VITE_API_URL=\r\nVITE_APP_TITLE=X\r\n');
    const result = healEnv({ examplePath, envPath, generateSecret: () => 's' });
    const text = fs.readFileSync(envPath, 'utf8');
    expect(result.added).toEqual(['SESSION_SECRET']);
    expect(text).toContain('SESSION_SECRET=s\r\n');
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(healEnv({ examplePath, envPath })).toEqual({ created: false, added: [] });
  });

  it('does nothing without an example file', () => {
    fs.rmSync(examplePath);
    expect(healEnv({ examplePath, envPath })).toEqual({ created: false, added: [] });
    expect(fs.existsSync(envPath)).toBe(false);
  });
});

describe('shipped examples', () => {
  const root = path.resolve(__dirname, '../..');

  it('fills the backend example with generated JWT secrets and no placeholder values', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-env-real-'));
    try {
      const envPath = path.join(dir, '.env');
      healEnv({ examplePath: path.join(root, '.env.example'), envPath });
      const text = fs.readFileSync(envPath, 'utf8');
      expect(text).toMatch(/^JWT_SECRET=[0-9a-f]{96}$/m);
      expect(text).toMatch(/^JWT_REFRESH_SECRET=[0-9a-f]{96}$/m);
      expect(text).not.toMatch(/change-me|your-key|sk-your/);
      expect(healEnv({ examplePath: path.join(root, '.env.example'), envPath }).added).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps the backend and frontend copies of the script identical', () => {
    for (const file of ['ensure-env.mjs', 'ensure-env.d.mts']) {
      const backend = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
      const frontend = fs.readFileSync(path.join(root, '..', 'frontend', 'scripts', file), 'utf8');
      expect(frontend, file).toBe(backend);
    }
  });
});

describe('findMissingDependencies', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-'));
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { present: '1', '@scope/pkg': '1', absent: '1' },
        devDependencies: { 'dev-absent': '1' },
      }),
    );
    for (const name of ['present', '@scope/pkg']) {
      fs.mkdirSync(path.join(dir, 'node_modules', name), { recursive: true });
      fs.writeFileSync(path.join(dir, 'node_modules', name, 'package.json'), '{}');
    }
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lists dependencies and devDependencies that are not installed', () => {
    expect(findMissingDependencies(dir)).toEqual(['absent', 'dev-absent']);
  });

  it('reports nothing without a package.json', () => {
    fs.rmSync(path.join(dir, 'package.json'));
    expect(findMissingDependencies(dir)).toEqual([]);
  });

  it('stops the script with one clear message when the install is stale', () => {
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.copyFileSync(
      path.resolve(__dirname, '../../scripts/ensure-env.mjs'),
      path.join(dir, 'scripts', 'ensure-env.mjs'),
    );
    const run = (env: NodeJS.ProcessEnv) =>
      spawnSync(process.execPath, [path.join(dir, 'scripts', 'ensure-env.mjs')], {
        env: { ...process.env, ...env },
        encoding: 'utf8',
      });

    const stale = run({});
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('2 dependencies are not installed (absent, dev-absent)');
    expect(stale.stderr).toContain('pnpm install');

    expect(run({ PLANTCARE_SKIP_DEP_CHECK: '1' }).status).toBe(0);
  });
});
