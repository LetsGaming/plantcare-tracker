export const LONG_TASK_MS = 50;

export const median = (values) => {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const blockedTime = (tasks) =>
  tasks.reduce((sum, task) => sum + Math.max(0, task.duration - LONG_TASK_MS), 0);

export const longestTask = (tasks) => tasks.reduce((max, task) => Math.max(max, task.duration), 0);

/** Collapses ids so /api/v2/watering/plant/42 and /plant/43 count as one path. */
export const normalizePath = (pathname) =>
  pathname
    .split("/")
    .map((part) => (/^\d+$/.test(part) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) ? "*" : part))
    .join("/");

export const summarizeRequests = (urls) => {
  const byPath = {};
  let api = 0;
  let uploads = 0;
  let wateringPlant = 0;
  for (const raw of urls) {
    let pathname;
    try {
      pathname = new URL(raw).pathname;
    } catch {
      continue;
    }
    const isApi = pathname.startsWith("/api/");
    const isUploads = pathname.startsWith("/uploads/");
    if (!isApi && !isUploads) continue;
    if (isApi) api++;
    if (isUploads) uploads++;
    if (/\/watering\/plant\//.test(pathname)) wateringPlant++;
    const key = isUploads ? "/uploads/*" : normalizePath(pathname);
    byPath[key] = (byPath[key] ?? 0) + 1;
  }
  return { api, uploads, wateringPlant, byPath };
};

/** Turns raw per-run step records ({ "scenario/step": { metric: number, requestsByPath: {} } }) into medians. */
export const summarizeRuns = (runs) => {
  const stepKeys = new Set();
  for (const run of runs) for (const key of Object.keys(run)) stepKeys.add(key);
  const steps = {};
  for (const key of stepKeys) {
    const records = runs.map((run) => run[key]).filter(Boolean);
    const metricNames = new Set();
    for (const record of records) {
      for (const [name, value] of Object.entries(record)) if (typeof value === "number") metricNames.add(name);
    }
    const summary = {};
    for (const name of metricNames) summary[name] = median(records.map((r) => r[name]));
    const paths = new Set();
    for (const record of records) for (const p of Object.keys(record.requestsByPath ?? {})) paths.add(p);
    summary.requestsByPath = {};
    for (const p of [...paths].sort()) {
      summary.requestsByPath[p] = median(records.map((r) => r.requestsByPath?.[p] ?? 0));
    }
    steps[key] = summary;
  }
  return steps;
};

const COLUMNS = [
  ["longTasks", "long tasks"],
  ["blockedMs", "blocked ms"],
  ["longestMs", "longest ms"],
  ["domNodes", "DOM nodes"],
  ["heapMb", "heap MB"],
  ["apiRequests", "API req"],
  ["uploadRequests", "uploads req"],
  ["wateringPlantRequests", "watering/plant req"],
  ["lastWateringResponseMs", "last watering resp ms"],
  ["imageRequestsPerCard", "img req/card"],
  ["lastApiResponseMs", "last API resp ms"],
  ["cards", "cards"],
  ["publicPageRequests", "public page req"],
  ["replayedItems", "replayed items"],
  ["listCommits", "list commits"],
  ["heapGrowthPct", "heap growth %"],
];

const fmt = (value) => {
  if (value == null) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

export const toMarkdown = ({ label, url, runs, n, steps }) => {
  const lines = [
    `### ${label}`,
    "",
    `Medians over ${runs} run(s), Sales N=${n ?? "n/a"}, ${url}`,
    "",
    `| step | ${COLUMNS.map(([, title]) => title).join(" | ")} |`,
    `|---|${COLUMNS.map(() => "---").join("|")}|`,
  ];
  for (const [key, step] of Object.entries(steps)) {
    lines.push(`| ${key} | ${COLUMNS.map(([name]) => fmt(step[name])).join(" | ")} |`);
  }
  return lines.join("\n");
};

export const compareToBaseline = (current, baseline) => {
  const lines = ["", "Comparison against baseline (current vs baseline):"];
  for (const [key, step] of Object.entries(current.steps)) {
    const base = baseline.steps?.[key];
    if (!base) {
      lines.push(`  ${key}: not in baseline`);
      continue;
    }
    const parts = [];
    for (const [name] of COLUMNS) {
      const now = step[name];
      const was = base[name];
      if (now == null || was == null) continue;
      const delta = now - was;
      const pct = was !== 0 ? ` (${delta >= 0 ? "+" : ""}${((delta / was) * 100).toFixed(0)}%)` : "";
      parts.push(`${name} ${fmt(was)} -> ${fmt(now)}${pct}`);
    }
    lines.push(`  ${key}: ${parts.join(", ")}`);
  }
  return lines.join("\n");
};

/**
 * Targets from plan section 6.2 that navbench can measure. A target names one `step` or a `match`
 * pattern that expands to every measured step it fits. `n` restricts a target to one Sales size;
 * `requires` skips it until the same step reports at least `min` of a metric (the replay target
 * only applies once 2,000 sales were replayed). `max` is inclusive. API timings and explain belong
 * to apitime.mjs and explain.mjs.
 */
export const TARGETS = [
  { id: "tab entry blocked", match: /^tabs\//, metric: "blockedMs", max: 50 },
  { id: "sales-entry warm re-entry blocked", step: "sales-entry/warm-reentry", metric: "blockedMs", max: 50 },
  { id: "sales-entry warm re-entry no long task", step: "sales-entry/warm-reentry", metric: "longTasks", max: 0 },
  {
    id: "enter Substrates with N=2000 Sales mounted",
    step: "sales-entry/substrates-with-sales-mounted",
    metric: "blockedMs",
    max: 50,
    n: 2000,
  },
  { id: "mark-all-seen N=1000 no long task over 200 ms", step: "mark-all-seen/mark-all", metric: "longestMs", max: 200, n: 1000 },
  {
    id: "sales-replay N=2000 no long task over 100 ms",
    step: "sales-replay/replay",
    metric: "longestMs",
    max: 100,
    requires: { metric: "replayedItems", min: 2000 },
  },
  { id: "plants-cold first mount under 100 ms", step: "plants-cold/cold-load", metric: "longestMs", max: 100 },
  { id: "plants-cold at most 2 API requests", step: "plants-cold/cold-load", metric: "apiRequests", max: 2 },
  { id: "plants-cold no history requests", step: "plants-cold/cold-load", metric: "wateringPlantRequests", max: 0 },
  { id: "Plants entry no history requests", match: /^tabs\/\d+-plants$/, metric: "wateringPlantRequests", max: 0 },
  { id: "public-scroll first page under 100 ms", step: "public-scroll/first-page", metric: "longestMs", max: 100 },
  { id: "public-scroll next page blocked", match: /^public-scroll\/next-page-/, metric: "blockedMs", max: 50 },
  { id: "round-tap blocked", match: /^round-tap\/tap-/, metric: "blockedMs", max: 50 },
  { id: "round-tap no history requests", match: /^round-tap\//, metric: "wateringPlantRequests", max: 0 },
  { id: "heap growth over 20 tab switches under 10 percent", step: "heap-20-switches/switches", metric: "heapGrowthPct", max: 10 },
  { id: "DOM nodes all tabs N=2000 under 12k", step: "sales-entry/warm-reentry", metric: "domNodes", max: 12000, n: 2000 },
  { id: "DOM nodes after 20 tab switches under 12k", step: "heap-20-switches/switches", metric: "domNodes", max: 12000 },
  { id: "image requests per card (Sales)", step: "sales-entry/first-entry", metric: "imageRequestsPerCard", max: 1 },
  { id: "image requests per card (public plants)", step: "public-scroll/first-page", metric: "imageRequestsPerCard", max: 1 },
];

const expandTargets = (steps) =>
  TARGETS.flatMap((target) => {
    if (target.step !== undefined) return [{ ...target, stepName: target.step }];
    const names = Object.keys(steps).filter((name) => target.match.test(name));
    return names.map((stepName) => ({ ...target, stepName, id: `${target.id} (${stepName})` }));
  });

export const evaluateTargets = ({ steps, n }) => {
  const lines = ["", "Targets (plan section 6.2):"];
  let failed = 0;
  for (const target of expandTargets(steps)) {
    const step = steps[target.stepName];
    if (!step) continue;
    if (target.n !== undefined && target.n !== n) {
      lines.push(`  SKIP  ${target.id} (needs N=${target.n}, ran N=${n})`);
      continue;
    }
    if (target.requires && !((step[target.requires.metric] ?? 0) >= target.requires.min)) {
      lines.push(`  SKIP  ${target.id} (needs ${target.requires.metric} >= ${target.requires.min}, got ${fmt(step[target.requires.metric])})`);
      continue;
    }
    const value = step[target.metric];
    if (value == null) {
      lines.push(`  SKIP  ${target.id} (no ${target.metric})`);
      continue;
    }
    const pass = value <= target.max;
    if (!pass) failed++;
    lines.push(`  ${pass ? "PASS" : "FAIL"}  ${target.id}: ${target.metric} ${fmt(value)} (max ${target.max})`);
  }
  if (lines.length === 2) lines.push("  no measured step matches a target");
  return { text: lines.join("\n"), failed };
};
