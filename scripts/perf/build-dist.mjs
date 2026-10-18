import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { loadSession, parseFlags, repoRoot, requireId } from "./lib/session.mjs";

const HELP = `Builds the production frontend into frontend/dist-perf for the perf harness.

Usage: node scripts/perf/build-dist.mjs --id <dev-up session id>

VITE_API_URL is set to the same-origin API path that serve-dist.mjs proxies to the session backend.`;

const flags = parseFlags(process.argv.slice(2));
if (flags.help) {
  console.log(HELP);
  process.exit(0);
}

try {
  const session = loadSession(requireId(flags));
  const frontendDir = path.join(repoRoot, "frontend");
  const vitePackage = createRequire(path.join(frontendDir, "package.json")).resolve("vite/package.json");
  const viteBin = path.join(path.dirname(vitePackage), "bin", "vite.js");
  const result = spawnSync(process.execPath, [viteBin, "build", "--outDir", "dist-perf", "--emptyOutDir"], {
    cwd: frontendDir,
    stdio: "inherit",
    env: { ...process.env, VITE_API_URL: session.viteApiUrl },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`[build-dist] built ${path.join(frontendDir, "dist-perf")} (VITE_API_URL=${session.viteApiUrl})`);
} catch (error) {
  console.error(`[build-dist] ${error.message}`);
  process.exit(1);
}
