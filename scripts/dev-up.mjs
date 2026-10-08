#!/usr/bin/env node
/**
 * Starts an isolated PlantCare stack for manual and browser testing: the backend with mocked
 * shop scrapers and AI guide on its own SQLite file and free port, the Vite frontend pointed at
 * it, and a database filled with mock data through the real API.
 *
 * Everything mutable lives under data/agent-<id>/ and logs/agent-<id>/, so sessions sharing a
 * checkout never collide. Pair every dev-up with `node scripts/dev-down.mjs --id <id>`.
 *
 * Usage: node scripts/dev-up.mjs [--id <name>] [--user <name>] [--no-seed] [--loggedout]
 *   --user      account the printed client url logs in as (admin, grower or newbie; default grower)
 *   --no-seed   start with an empty database
 *   --loggedout print a plain url so the login flow can be exercised
 *
 * Mock data: see scripts/dev/seed/index.mjs.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getFreePort,
  killPid,
  parseArgs,
  repoRoot,
  sessionPaths,
  spawnBackground,
  waitForHttp,
} from "./dev/lib/session.mjs";
import { PASSWORD, createContext } from "./dev/seed/context.mjs";
import { runSeed } from "./dev/seed/index.mjs";
import { USERS } from "./dev/seed/steps/01-users.mjs";

const API_PATH = "/api/v2";
const STARTUP_TIMEOUT_MS = 40_000;

const main = async () => {
  const { id, seed, loggedout, user } = parseArgs(process.argv.slice(2));
  const log = (message) => console.log(`[dev-up:${id}] ${message}`);
  const { dataDir, logDir, sessionFile } = sessionPaths(id);

  if (seed && !USERS.some((entry) => entry.username === user)) {
    throw new Error(`Unknown --user "${user}". Seeded users: ${USERS.map((u) => u.username).join(", ")}`);
  }

  // A previous run under this id may have died before dev-down ran.
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(logDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const backendPort = await getFreePort();
  const clientPort = await getFreePort();
  const session = {
    id,
    backendPort,
    clientPort,
    backendPid: null,
    clientPid: null,
    dataDir,
    logDir,
    startedAt: new Date().toISOString(),
  };
  const persist = () => fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
  // Stops what this run started, so a failed start leaves no orphaned servers behind.
  const fail = (message) => {
    console.error(`[dev-up:${id}] ${message}`);
    killPid(session.clientPid, "frontend", log);
    killPid(session.backendPid, "backend", log);
    process.exit(1);
  };
  const dbPath = path.join(dataDir, "plantcare.db");
  const apiUrl = `http://localhost:${backendPort}${API_PATH}`;

  const backendLog = path.join(logDir, "backend.log");
  log(`starting backend on :${backendPort}`);
  const backend = spawnBackground(path.join(repoRoot, "backend", "node_modules", "tsx", "dist", "cli.mjs"), ["src/tools/devServer.ts"], {
    cwd: path.join(repoRoot, "backend"),
    logFile: backendLog,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(backendPort),
      DB_PATH: dbPath,
      NAS_PATH: path.join(dataDir, "uploads"),
      ALLOWED_ORIGINS: `http://localhost:${clientPort}`,
      JWT_SECRET: randomBytes(24).toString("hex"),
      JWT_REFRESH_SECRET: randomBytes(24).toString("hex"),
      JWT_EXPIRATION: "12h",
    },
  });

  session.backendPid = backend.pid;
  persist();

  if (!(await waitForHttp(`http://127.0.0.1:${backendPort}${API_PATH}/health`, STARTUP_TIMEOUT_MS))) {
    fail(`backend did not respond in time, see ${backendLog}`);
  }
  log("backend ready");

  let devToken = null;
  if (seed) {
    const ctx = createContext({ apiUrl: `http://127.0.0.1:${backendPort}${API_PATH}`, dbPath, log });
    try {
      await runSeed(ctx);
    } catch (err) {
      fail(`seeding failed: ${err.message}\n  backend log: ${backendLog}`);
    }
    devToken = loggedout ? null : ctx.token(user);
  }

  const clientLog = path.join(logDir, "frontend.log");
  log(`starting frontend on :${clientPort}`);
  const client = spawnBackground(
    path.join(repoRoot, "frontend", "node_modules", "vite", "bin", "vite.js"),
    ["--port", String(clientPort), "--strictPort", "--host", "localhost"],
    {
      cwd: path.join(repoRoot, "frontend"),
      logFile: clientLog,
      env: { ...process.env, VITE_API_URL: apiUrl },
    },
  );
  session.clientPid = client.pid;
  persist();
  if (!(await waitForHttp(`http://localhost:${clientPort}/`, STARTUP_TIMEOUT_MS))) {
    fail(`frontend did not respond in time, see ${clientLog}`);
  }

  const clientUrl = `http://localhost:${clientPort}/${devToken ? `?devToken=${devToken}` : ""}`;
  console.log("");
  log("ready");
  console.log(`  App:      ${clientUrl}`);
  console.log(`  API:      ${apiUrl}`);
  if (seed) {
    console.log(`  Accounts: ${USERS.map((u) => `${u.username} (${u.role})`).join(", ")}; password ${PASSWORD}`);
    console.log("  Guest:    use 'continue as guest' on the login screen");
  }
  console.log(`  Logs:     ${logDir}`);
  console.log(`  Stop:     node scripts/dev-down.mjs --id ${id}`);
  // No process.exit here: both children are detached and unref'd, and a forced exit right after
  // spawning can crash libuv on Windows.
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
