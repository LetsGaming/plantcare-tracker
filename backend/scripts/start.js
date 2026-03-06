#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync, spawn } from "child_process";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
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

  return srcTime > buildTime;
}

try {
  if (buildNeeded()) {
    console.log("Build missing or outdated. Building...");
    execSync("npm run build", { stdio: "inherit" });
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
