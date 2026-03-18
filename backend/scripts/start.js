#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const ROOT = process.cwd();

const SRC_DIR = path.join(ROOT, "src");
const SERVER_TS = path.join(ROOT, "server.ts");

const DIST_FILE = path.join(ROOT, "dist", "server.js");
const CACHE_FILE = path.join(ROOT, ".buildcache.json");

const EXTRA_FILES = ["package.json", "tsconfig.json", ".env"].map((f) =>
  path.join(ROOT, f),
);

function getPackageManager() {
  if (fs.existsSync(path.join(ROOT, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(ROOT, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(ROOT, "bun.lockb"))) return "bun";
  return "npm";
}

function hashFile(file) {
  const data = fs.readFileSync(file);
  return crypto.createHash("sha1").update(data).digest("hex");
}

function walk(dir, list = []) {
  if (!fs.existsSync(dir)) return list;

  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      walk(full, list);
    } else if (file.endsWith(".ts")) {
      list.push(full);
    }
  }

  return list;
}

function getAllSourceFiles() {
  const files = walk(SRC_DIR);

  if (fs.existsSync(SERVER_TS)) {
    files.push(SERVER_TS);
  }

  for (const extra of EXTRA_FILES) {
    if (fs.existsSync(extra)) {
      files.push(extra);
    }
  }

  return files;
}

function calculateProjectHash() {
  const files = getAllSourceFiles();

  const hash = crypto.createHash("sha1");

  for (const file of files.sort()) {
    hash.update(file);
    hash.update(hashFile(file));
  }

  return hash.digest("hex");
}

function readCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(hash) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ hash }, null, 2));
}

function buildNeeded() {
  if (!fs.existsSync(DIST_FILE)) {
    return true;
  }

  const cache = readCache();
  const currentHash = calculateProjectHash();

  if (!cache) {
    writeCache(currentHash);
    return true;
  }

  if (cache.hash !== currentHash) {
    writeCache(currentHash);
    return true;
  }

  return false;
}

function ensureBuild() {
  const pm = getPackageManager();

  if (buildNeeded()) {
    console.log("Sources changed. Building...");
    execSync(`${pm} run build`, { stdio: "inherit" });
  } else {
    console.log("Build cache valid. Skipping build.");
  }

  if (!fs.existsSync(DIST_FILE)) {
    console.error("Build failed: dist/server.js not found");
    process.exit(1);
  }
}

function startServerInline() {
  const serverPath = path.join(ROOT, "dist", "server.js");

  try {
    require(serverPath);
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

try {
  ensureBuild();
  startServerInline();
} catch (err) {
  console.error("Fatal startup error:", err);
  process.exit(1);
}
