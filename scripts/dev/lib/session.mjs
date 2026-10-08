import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, "..", "..", "..");

export const parseArgs = (argv) => {
  const out = { id: "default", seed: true, loggedout: false, user: "grower" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") out.id = argv[++i];
    else if (arg === "--user") out.user = argv[++i];
    else if (arg === "--no-seed") out.seed = false;
    else if (arg === "--loggedout") out.loggedout = true;
  }
  if (!/^[\w-]+$/.test(out.id)) throw new Error(`Invalid --id "${out.id}" (letters, digits, - and _)`);
  return out;
};

export const sessionPaths = (id) => {
  const dataDir = path.join(repoRoot, "data", `agent-${id}`);
  const logDir = path.join(repoRoot, "logs", `agent-${id}`);
  return { dataDir, logDir, sessionFile: path.join(dataDir, "dev-session.json") };
};

export const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

export const waitForHttp = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
};

/** Runs a node script detached with output going to a log file, so it outlives this script.
 *  Node is spawned directly (no shell), so the recorded pid is the server itself. */
export const spawnBackground = (script, args, { cwd, env, logFile }) => {
  const fd = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env,
    stdio: ["ignore", fd, fd],
    detached: true,
  });
  child.unref();
  return child;
};

export const killPid = (pid, label, log) => {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGTERM");
    }
    log(`stopped ${label} (pid ${pid})`);
  } catch {
    log(`${label} (pid ${pid}) was already stopped`);
  }
};
