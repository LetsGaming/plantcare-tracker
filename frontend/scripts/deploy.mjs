#!/usr/bin/env node

/**
 * Build & deploy script for the Vue frontend.
 *
 * Works with pnpm (default when detected), npm, or yarn.
 * Everything is configurable via env vars — no need to edit the file:
 *
 *   APP_NAME      pm2 process name            (default: plantcare-frontend)
 *   PORT          port the server listens on  (default: 8080)
 *   HOST          host shown in the summary   (default: localhost)
 *   PM            package manager to use       auto | npm | pnpm | yarn
 *                                             (default: auto — from lockfile)
 *   BUILD_SCRIPT  package.json script to run  (default: build)
 *   DIST_DIR      build output directory      (default: dist)
 *   SERVE_SRC     server entry to copy in     (default: serve.js)
 *   SKIP_INSTALL  set to 1 to skip install
 *   SKIP_BUILD    set to 1 to skip build
 *
 * Example:
 *   PM=pnpm PORT=9000 APP_NAME=my-app node deploy.mjs
 */

import { execSync } from "child_process";
import { cpSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const DIR = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = join(DIR, "..");

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
  appName: process.env.APP_NAME || "plantcare-frontend",
  port: process.env.PORT || "8080",
  host: process.env.HOST || "localhost",
  packageManager: process.env.PM || "auto",
  buildScript: process.env.BUILD_SCRIPT || "build",
  distDir: process.env.DIST_DIR || "dist",
  serveSrc: process.env.SERVE_SRC || "serve.js",
  skipInstall: process.env.SKIP_INSTALL === "1",
  skipBuild: process.env.SKIP_BUILD === "1",
};

const SERVE_SRC = join(BASE_DIR, CONFIG.serveSrc);
const SERVE_DST = join(BASE_DIR, CONFIG.distDir, "serve.cjs");

// ─── Package-manager command matrix ────────────────────────────────────────────
const PM_COMMANDS = {
  npm: {
    lockfile: "package-lock.json",
    frozen: "npm ci --prefer-offline --fund=false --audit=false",
    install: "npm install",
    run: (s) => `npm run ${s}`,
    exec: (b) => `npx ${b}`,
  },
  pnpm: {
    lockfile: "pnpm-lock.yaml",
    frozen: "pnpm install --frozen-lockfile --prefer-offline",
    install: "pnpm install",
    run: (s) => `pnpm run ${s}`,
    exec: (b) => `pnpm exec ${b}`,
  },
  yarn: {
    lockfile: "yarn.lock",
    frozen: "yarn install --frozen-lockfile",
    install: "yarn install",
    run: (s) => `yarn ${s}`,
    exec: (b) => `yarn ${b}`,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

const step = (msg) => console.log(`\n${c.bold(`▶ ${msg}`)}`);
const ok = (msg) => console.log(c.green(`✓ ${msg}`));
const warn = (msg) => console.log(c.yellow(`! ${msg}`));
const die = (msg) => {
  console.error(c.red(`✗ ${msg}`));
  process.exit(1);
};

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: "inherit", cwd: BASE_DIR, ...opts });
  } catch {
    die(`Command failed: ${cmd}`);
  }
}

function tryRun(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: "inherit", cwd: BASE_DIR, ...opts });
    return true;
  } catch {
    return false;
  }
}

function which(bin) {
  try {
    execSync(`command -v ${bin}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function pm2Running(name) {
  try {
    const out = execSync(`pm2 pid ${name}`, { cwd: BASE_DIR, stdio: "pipe" })
      .toString()
      .trim();
    return out !== "" && out !== "0";
  } catch {
    return false;
  }
}

function readPkg() {
  try {
    return JSON.parse(readFileSync(join(BASE_DIR, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function resolvePackageManager() {
  if (CONFIG.packageManager !== "auto") {
    if (!PM_COMMANDS[CONFIG.packageManager])
      die(`Unsupported PM '${CONFIG.packageManager}' (use npm | pnpm | yarn)`);
    return CONFIG.packageManager;
  }
  // Auto-detect from lockfile, then fall back to whatever is installed.
  for (const pm of ["pnpm", "yarn", "npm"]) {
    if (existsSync(join(BASE_DIR, PM_COMMANDS[pm].lockfile))) return pm;
  }
  if (which("pnpm")) return "pnpm";
  if (which("yarn")) return "yarn";
  return "npm";
}

// ─── Guards ───────────────────────────────────────────────────────────────────
const pm = resolvePackageManager();
const cmds = PM_COMMANDS[pm];

for (const bin of ["node", pm, "pm2"]) {
  if (!which(bin))
    die(
      `${bin} not found${bin === "pm2" ? " — install with: npm i -g pm2" : ""}`,
    );
}

if (!existsSync(SERVE_SRC)) die(`Server entry not found at ${SERVE_SRC}`);

console.log(c.bold(`\nUsing ${c.green(pm)} · app ${c.green(CONFIG.appName)} · port ${c.green(CONFIG.port)}`));

// ─── 1. Install ───────────────────────────────────────────────────────────────
if (CONFIG.skipInstall) {
  warn("Skipping install (SKIP_INSTALL=1)");
} else {
  step("Installing dependencies");
  const lockPath = join(BASE_DIR, cmds.lockfile);
  if (existsSync(lockPath)) {
    if (!tryRun(cmds.frozen)) {
      warn("Frozen install failed (lockfile drift?) — retrying with a regular install");
      run(cmds.install);
    }
  } else {
    warn(`${cmds.lockfile} not found — running '${cmds.install}'`);
    run(cmds.install);
  }
  ok("Dependencies ready");
}

// ─── 2. Build ─────────────────────────────────────────────────────────────────
if (CONFIG.skipBuild) {
  warn("Skipping build (SKIP_BUILD=1)");
} else {
  step("Building project");
  const pkg = readPkg();
  if (pkg?.scripts?.[CONFIG.buildScript]) {
    run(cmds.run(CONFIG.buildScript));
  } else {
    warn(`No '${CONFIG.buildScript}' script in package.json — running vite directly`);
    run(cmds.exec("vite build"));
  }
  if (!existsSync(join(BASE_DIR, CONFIG.distDir, "index.html")))
    die(`Build did not produce ${CONFIG.distDir}/index.html`);
  ok(`Build complete → ${CONFIG.distDir}/`);
}

// ─── 3. Copy server ───────────────────────────────────────────────────────────
step(`Copying ${CONFIG.serveSrc} → ${CONFIG.distDir}/serve.cjs`);
if (!existsSync(join(BASE_DIR, CONFIG.distDir)))
  die(`${CONFIG.distDir}/ missing — run a build first (don't set SKIP_BUILD)`);
cpSync(SERVE_SRC, SERVE_DST);
ok("Server script in place");

// ─── 4. Start or restart via pm2 ──────────────────────────────────────────────
step("Deploying with pm2");
const env = { ...process.env, PORT: String(CONFIG.port), NODE_ENV: "production" };

if (pm2Running(CONFIG.appName)) {
  run(`pm2 restart ${CONFIG.appName} --update-env`, { env });
  ok(`Restarted existing pm2 process: ${c.bold(CONFIG.appName)}`);
} else {
  run(`pm2 start ${SERVE_DST} --name ${CONFIG.appName} --interpreter node`, { env });
  ok(`Started new pm2 process: ${c.bold(CONFIG.appName)}`);
}

// ─── 5. Summary ───────────────────────────────────────────────────────────────
const divider = c.bold("─".repeat(43));
console.log(`
${divider}
${c.green(c.bold("   Build & deploy complete"))}
${divider}
  App:  ${c.bold(CONFIG.appName)}
  PM:   ${c.bold(pm)}
  URL:  ${c.bold(`http://${CONFIG.host}:${CONFIG.port}`)}

  ${c.bold(`pm2 logs ${CONFIG.appName}`)}      — live logs
  ${c.bold(`pm2 stop ${CONFIG.appName}`)}      — stop
  ${c.bold("pm2 save && pm2 startup")}  — persist across reboots
${divider}`);
