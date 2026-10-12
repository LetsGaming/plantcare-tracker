import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { performance } from "node:perf_hooks";
import { loadSession, parseFlags, repoRoot, requireId } from "./lib/session.mjs";

const PASSWORD = "DevPass123!";
const DEFAULT_ENDPOINTS = [
  "/plants",
  "/substrates",
  "/components",
  "/watering/plant/{firstPlantId}",
  "/watering/fertilizer-types",
];

const request = (url, { method = "GET", headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.request(url, { method, headers }, (res) => {
      const ttfb = performance.now() - start;
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
          ttfb,
          total: performance.now() - start,
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
};

const stats = (values) => ({
  median: percentile(values, 50),
  p95: percentile(values, 95),
});

const round = (n) => Math.round(n * 100) / 100;

const unwrap = (buffer) => {
  try {
    const parsed = JSON.parse(buffer.toString("utf8"));
    return parsed?.data ?? parsed;
  } catch {
    return null;
  }
};

const firstPlantId = (payload) => {
  const list = Array.isArray(payload) ? payload : (payload?.items ?? payload?.plants ?? []);
  return list[0]?.id ?? list[0]?.plant_id ?? null;
};

const encodedSize = (buffer, headers) => {
  const encoding = headers["content-encoding"];
  return { encoding: encoding ?? "identity", bytes: buffer.length };
};

const measureEncoding = async (url, auth, identityBody, encoding, compress) => {
  const res = await request(url, { headers: { ...auth, "accept-encoding": encoding } });
  const served = encodedSize(res.body, res.headers);
  const serverCompressed = served.encoding === encoding;
  return {
    served: res.body.length,
    servedEncoding: served.encoding,
    wouldBe: serverCompressed ? res.body.length : compress(identityBody).length,
    serverCompressed,
  };
};

const measureEndpoint = async (apiBase, auth, route, runs) => {
  const url = `${apiBase}${route}`;
  const identity = { ...auth, "accept-encoding": "identity" };
  const ttfbs = [];
  const totals = [];
  let last = null;
  for (let i = 0; i < runs; i++) {
    last = await request(url, { headers: identity });
    ttfbs.push(last.ttfb);
    totals.push(last.total);
  }

  const gzip = await measureEncoding(url, auth, last.body, "gzip", (b) =>
    zlib.gzipSync(b, { level: 6 }),
  );
  const br = await measureEncoding(url, auth, last.body, "br", (b) => zlib.brotliCompressSync(b));

  const etag = last.headers.etag ?? null;
  let conditional = null;
  if (etag) {
    const res = await request(url, { headers: { ...identity, "if-none-match": etag } });
    conditional = { status: res.status, notModified: res.status === 304 };
  }

  return {
    endpoint: route,
    runs,
    status: last.status,
    ttfbMs: { median: round(stats(ttfbs).median), p95: round(stats(ttfbs).p95) },
    totalMs: { median: round(stats(totals).median), p95: round(stats(totals).p95) },
    bytes: { raw: last.body.length, gzip, br },
    etag,
    cacheControl: last.headers["cache-control"] ?? null,
    conditional,
  };
};

const kb = (n) => (n / 1024).toFixed(1);

const toMarkdown = (result) => {
  const lines = [
    `API timing: ${result.label} (session ${result.session}, user ${result.user}, ${result.runs} runs)`,
    "",
    "| Endpoint | Status | TTFB med | TTFB p95 | Total med | Total p95 | Raw KB | gzip KB served / would-be | br KB served / would-be | ETag | Cache-Control | Conditional |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const e of result.endpoints) {
    const gz = `${e.bytes.gzip.serverCompressed ? kb(e.bytes.gzip.served) : "n/a"} / ${kb(e.bytes.gzip.wouldBe)}`;
    const br = `${e.bytes.br.serverCompressed ? kb(e.bytes.br.served) : "n/a"} / ${kb(e.bytes.br.wouldBe)}`;
    lines.push(
      `| ${e.endpoint} | ${e.status} | ${e.ttfbMs.median} | ${e.ttfbMs.p95} | ${e.totalMs.median} | ${e.totalMs.p95} | ${kb(e.bytes.raw)} | ${gz} | ${br} | ${e.etag ? "yes" : "no"} | ${e.cacheControl ?? "none"} | ${e.conditional ? e.conditional.status : "n/a"} |`,
    );
  }
  lines.push("", "Times in ms. Served is n/a when the server did not compress that encoding.");
  return lines.join("\n");
};

const main = async () => {
  const flags = parseFlags(process.argv.slice(2));
  const id = requireId(flags);
  const user = typeof flags.user === "string" ? flags.user : "grower";
  const runs = flags.runs === undefined ? 7 : Number(flags.runs);
  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a positive integer");
  const label = typeof flags.label === "string" ? flags.label : id;
  if (!/^[\w.-]+$/.test(label)) throw new Error("--label may only contain letters, digits, . - _");
  const templates =
    typeof flags.endpoints === "string"
      ? flags.endpoints
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : DEFAULT_ENDPOINTS;

  const session = loadSession(id);
  const login = await request(`${session.apiBase}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: user, password: PASSWORD }),
  });
  const token = unwrap(login.body)?.accessToken;
  if (login.status !== 200 || !token) {
    throw new Error(`Login as ${user} failed with status ${login.status}`);
  }
  const auth = { authorization: `Bearer ${token}` };

  let plantId = null;
  if (templates.some((t) => t.includes("{firstPlantId}"))) {
    const res = await request(`${session.apiBase}/plants`, {
      headers: { ...auth, "accept-encoding": "identity" },
    });
    plantId = firstPlantId(unwrap(res.body));
    if (plantId === null) throw new Error("No plant found from /plants for {firstPlantId}");
  }

  const endpoints = [];
  for (const template of templates) {
    const route = template.replaceAll("{firstPlantId}", String(plantId));
    endpoints.push(await measureEndpoint(session.apiBase, auth, route, runs));
  }

  const result = {
    label,
    session: id,
    user,
    runs,
    timestamp: new Date().toISOString(),
    endpoints,
  };
  const dir = path.join(repoRoot, "scripts", "perf", "results");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${label}-apitime.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(toMarkdown(result));
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
