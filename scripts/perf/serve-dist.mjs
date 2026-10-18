import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { loadSession, parseFlags, repoRoot, requireId } from "./lib/session.mjs";

const HELP = `Serves frontend/dist-perf like the production nginx: gzip and brotli, immutable hashed assets,
no-cache index.html and sw.js, SPA fallback, and /api and /uploads proxied to the session backend.

Usage: node scripts/perf/serve-dist.mjs --id <dev-up session id> [--port <n>]

--port defaults to 0 (a free port). The served URL is printed on startup.`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg", ".txt", ".map"]);
const MIN_COMPRESS_BYTES = 1024;

const flags = parseFlags(process.argv.slice(2));
if (flags.help) {
  console.log(HELP);
  process.exit(0);
}

const distRoot = path.resolve(repoRoot, "frontend", "dist-perf");
const rootWithSep = distRoot.endsWith(path.sep) ? distRoot : distRoot + path.sep;
const cache = new Map();

const resolveFile = (urlPath) => {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relative = path.normalize(decoded.replace(/^[/\\]+/, ""));
  const candidate = path.resolve(distRoot, relative);
  if (candidate !== distRoot && !candidate.startsWith(rootWithSep)) return null;
  try {
    return fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
};

const compress = (buffer, encoding) =>
  encoding === "br"
    ? zlib.brotliCompressSync(buffer, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length },
      })
    : zlib.gzipSync(buffer, { level: 6 });

const load = (file, encoding) => {
  const key = `${file}|${encoding}|${fs.statSync(file).mtimeMs}`;
  let body = cache.get(key);
  if (!body) {
    const raw = fs.readFileSync(file);
    body = encoding === "identity" ? raw : compress(raw, encoding);
    cache.set(key, body);
  }
  return body;
};

const cacheControl = (file) => {
  const rel = path.relative(distRoot, file).split(path.sep).join("/");
  if (rel.startsWith("assets/")) return "public, max-age=31536000, immutable";
  if (rel === "index.html" || rel === "sw.js") return "no-cache";
  return "public, max-age=3600";
};

const sendFile = (req, res, file) => {
  const ext = path.extname(file).toLowerCase();
  const accept = String(req.headers["accept-encoding"] ?? "");
  let encoding = "identity";
  if (COMPRESSIBLE.has(ext) && fs.statSync(file).size >= MIN_COMPRESS_BYTES) {
    if (/\bbr\b/.test(accept)) encoding = "br";
    else if (/\bgzip\b/.test(accept)) encoding = "gzip";
  }
  const body = load(file, encoding);
  const headers = {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": cacheControl(file),
    Vary: "Accept-Encoding",
  };
  if (encoding !== "identity") headers["Content-Encoding"] = encoding;
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : body);
};

const proxy = (req, res, backendPort) => {
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: backendPort,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`Backend unreachable: ${error.message}`);
  });
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
};

try {
  if (!fs.existsSync(path.join(distRoot, "index.html"))) {
    throw new Error(`${distRoot} has no index.html. Run: node scripts/perf/build-dist.mjs --id <id>`);
  }
  const session = loadSession(requireId(flags));
  const port = flags.port === undefined ? 0 : Number(flags.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid --port "${flags.port}"`);

  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname.startsWith("/api/") || pathname.startsWith("/uploads/")) {
      proxy(req, res, session.backendPort);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    const file = resolveFile(pathname === "/" ? "/index.html" : pathname);
    if (file) {
      sendFile(req, res, file);
    } else if (pathname.startsWith("/assets/") || path.extname(pathname)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    } else {
      sendFile(req, res, path.join(distRoot, "index.html"));
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`[serve-dist] serving ${distRoot} at http://127.0.0.1:${server.address().port}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
} catch (error) {
  console.error(`[serve-dist] ${error.message}`);
  process.exit(1);
}
