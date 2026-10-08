#!/usr/bin/env node
/**
 * Stops the backend and frontend that dev-up started for one --id (by recorded pid only) and
 * deletes that id's data and log directories. Never touches another id.
 *
 * Usage: node scripts/dev-down.mjs [--id <name>]
 */
import fs from "node:fs";
import { killPid, parseArgs, sessionPaths } from "./dev/lib/session.mjs";

const { id } = parseArgs(process.argv.slice(2));
const log = (message) => console.log(`[dev-down:${id}] ${message}`);
const { dataDir, logDir, sessionFile } = sessionPaths(id);

if (fs.existsSync(sessionFile)) {
  const session = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
  killPid(session.clientPid, "frontend", log);
  killPid(session.backendPid, "backend", log);
} else {
  log("no session file, nothing to stop");
}

// The killed processes may still hold file handles for a moment on Windows.
const remove = (dir) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 30, retryDelay: 500 });
remove(dataDir);
remove(logDir);
log("clean");
