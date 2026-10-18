import fs from "node:fs";
import { API_PATH, readSession, repoRoot, sessionPaths } from "../../dev/lib/session.mjs";

export { repoRoot };

export const parseFlags = (argv) => {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) {
      flags[arg.slice(2)] = argv[++i];
    } else {
      flags[arg.slice(2)] = true;
    }
  }
  return flags;
};

export const requireId = (flags) => {
  const id = flags.id;
  if (typeof id !== "string" || !/^[\w-]+$/.test(id)) {
    throw new Error("Missing or invalid --id (the dev-up session id; letters, digits, - and _)");
  }
  return id;
};

export const loadSession = (id) => {
  const { sessionFile } = sessionPaths(id);
  if (!fs.existsSync(sessionFile)) {
    throw new Error(
      `No dev session "${id}" (${sessionFile} not found). Start it with: node scripts/dev-up.mjs --id ${id}`,
    );
  }
  const session = readSession(id);
  return {
    ...session,
    apiBase: `http://127.0.0.1:${session.backendPort}${API_PATH}`,
    viteApiUrl: API_PATH,
  };
};
