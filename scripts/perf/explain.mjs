import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSession, parseFlags, repoRoot, requireId } from "./lib/session.mjs";

const HELP = `Usage: node scripts/perf/explain.mjs --id <session> [--phase A] [--expectations <file>]

Runs EXPLAIN QUERY PLAN for every query in explain-expectations.json against the session database
(opened read-only). A query passes when its plan uses the expected index and no temp b-tree sort.
--phase limits the run to queries tagged with that phase. Exit code 1 on any FAIL.`;

const here = path.dirname(fileURLToPath(import.meta.url));

const main = () => {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    console.log(HELP);
    return 0;
  }
  const session = loadSession(requireId(flags));
  const dbPath = path.join(session.dataDir, "plantcare.db");
  const file = typeof flags.expectations === "string" ? flags.expectations : path.join(here, "explain-expectations.json");
  let expectations = JSON.parse(fs.readFileSync(file, "utf8"));
  if (typeof flags.phase === "string") expectations = expectations.filter((e) => e.phase === flags.phase);

  const require = createRequire(path.join(repoRoot, "backend", "package.json"));
  const Database = require("better-sqlite3");
  const db = new Database(dbPath, { readonly: true });
  db.pragma("busy_timeout = 5000");

  let failed = 0;
  try {
    for (const entry of expectations) {
      const plan = db
        .prepare(`EXPLAIN QUERY PLAN ${entry.sql}`)
        .all(...(entry.params ?? []))
        .map((row) => row.detail);
      const problems = [];
      if (entry.expectIndex) {
        const pattern = new RegExp(`USING (COVERING )?INDEX ${entry.expectIndex}(?![\\w])`);
        if (!plan.some((detail) => pattern.test(detail))) problems.push(`missing index ${entry.expectIndex}`);
      }
      if (entry.forbidTempBtree && plan.some((detail) => detail.includes("USE TEMP B-TREE"))) {
        problems.push("uses a temp b-tree");
      }
      const ok = problems.length === 0;
      if (!ok) failed++;
      console.log(`${ok ? "PASS" : "FAIL"} [${entry.phase ?? "-"}] ${entry.name}${ok ? "" : `: ${problems.join(", ")}`}`);
      if (!ok) for (const detail of plan) console.log(`       ${detail}`);
    }
  } finally {
    db.close();
  }
  console.log(`${expectations.length - failed}/${expectations.length} passed`);
  return failed > 0 ? 1 : 0;
};

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
