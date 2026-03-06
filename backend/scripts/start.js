#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const SERVER_TS = path.join(ROOT, "server.ts");
const BUILD_FILE = path.join(ROOT, "dist", "server.js");

function getLatestMtime(dir) {
  let latest = 0;

  const walk = (d) => {
    for (const file of fs.readdirSync(d)) {
      const full = path.join(d, file);
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        walk(full);
      } else if (file.endsWith(".ts")) {
        latest = Math.max(latest, stat.mtimeMs);
      }
    }
  };

  walk(dir);
  return latest;
}

function buildNeeded() {
  if (!fs.existsSync(BUILD_FILE)) {
    return true;
  }

  const buildTime = fs.statSync(BUILD_FILE).mtimeMs;
  const srcTime = getLatestMtime(SRC_DIR);
  const serverTsTime = fs.existsSync(SERVER_TS)
    ? fs.statSync(SERVER_TS).mtimeMs
    : 0;

  return Math.max(srcTime, serverTsTime) > buildTime;
}

function getPackageManager() {
  if (fs.existsSync(path.join(ROOT, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(ROOT, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(ROOT, "bun.lockb"))) return "bun";
  return "npm";
}

try {
  if (buildNeeded()) {
    console.log("Build missing or outdated. Building...");
    const pm = getPackageManager();
    execSync(`${pm} run build`, { stdio: "inherit" });
  } else {
    console.log("Build is up to date.");
  }

  const child = spawn("node", ["dist/server.js"], {
    stdio: "inherit",
  });

  child.on("exit", (code) => process.exit(code));
} catch (err) {
  console.error("Failed to start server:", err);
  process.exit(1);
}
