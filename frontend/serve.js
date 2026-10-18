/**
 * serve.js: Plantcare Frontend Production Server
 *
 * Läuft aus dem dist/-Verzeichnis nach dem Build (kopiert als serve.cjs).
 * - Serviert statische Dateien aus dem dist/-Verzeichnis (gestreamt, ETag/304,
 *   vorkomprimierte .br/.gz-Geschwister aus scripts/precompress.mjs)
 * - Cache: immutable nur für gehashte /assets/* und workbox-*.js, sonst no-cache
 * - SPA-Fallback: Routen ohne Dateiendung erhalten index.html
 * - Proxied /api/* und /uploads/*  → Backend (Standard: localhost:5000)
 * - Schützt vor Path-Traversal, Timeouts und unsauberem Shutdown
 *
 * Konfiguration ausschließlich über Env-Vars, Datei muss nicht editiert werden:
 *   PORT             Port des Frontend-Servers        (default: 8080)
 *   BIND_HOST        Interface zum Binden             (default: alle)
 *   BACKEND_PROTOCOL http | https                     (default: http)
 *   BACKEND_HOST     Backend-Host                     (default: localhost)
 *   BACKEND_PORT     Backend-Port                     (default: 5000)
 *   PROXY_PATHS      Kommagetrennte Präfixe zum Proxen(default: /api/,/uploads/)
 *   PROXY_TIMEOUT_MS Upstream-Timeout in ms           (default: 30000)
 *   STATIC_MAX_AGE   max-age gehashter Assets (Sek.)  (default: 31536000)
 *   DIST_DIR         Verzeichnis der statischen Dateien(default: __dirname)
 *
 * Hinweis: Diese Datei wird nur als serve.cjs ausgeführt (CommonJS). Nicht direkt
 * mit `node serve.js` starten, das Projekt ist "type": "module".
 */

const http = require("http");
const path = require("path");
const fs = require("fs");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function envInt(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  port: envInt("PORT", 8080),
  bindHost: process.env.BIND_HOST || undefined, // undefined = alle Interfaces
  backendProtocol: process.env.BACKEND_PROTOCOL === "https" ? "https" : "http",
  backendHost: process.env.BACKEND_HOST || "localhost",
  backendPort: envInt("BACKEND_PORT", 5000),
  proxyPaths: (process.env.PROXY_PATHS || "/api/,/uploads/")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  proxyTimeoutMs: envInt("PROXY_TIMEOUT_MS", 30000),
  staticMaxAge: envInt("STATIC_MAX_AGE", 31536000), // 1 Jahr
  distDir: process.env.DIST_DIR || __dirname,
};

const backendClient = CONFIG.backendProtocol === "https" ? require("https") : http;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

// Same set as scripts/precompress.mjs
const COMPRESSIBLE = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".svg",
  ".txt",
  ".xml",
  ".webmanifest",
  ".map",
]);

const HASHED_ASSET = /[-.][A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;
const WORKBOX_CHUNK = /^workbox-[A-Za-z0-9_-]{8,}\.js$/;

// ─── Path-Traversal-Schutz ──────────────────────────────────────────────────────

function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // ungültige Prozent-Kodierung
  }
  if (decoded.includes("\0")) return null;
  if (decoded.split(/[\\/]/).includes("..")) return null;
  const filePath = path.join(CONFIG.distDir, path.normalize(decoded));
  const rel = path.relative(CONFIG.distDir, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return filePath;
}

// ─── Cache- und Encoding-Header ───────────────────────────────────────────────

// Only content-addressed files may be cached forever: Vite output under /assets/
// and the hashed workbox runtime. Everything else must be revalidated.
function isHashedAsset(urlPath) {
  const base = path.posix.basename(urlPath);
  if (urlPath.startsWith("/assets/")) return HASHED_ASSET.test(base);
  return urlPath === `/${base}` && WORKBOX_CHUNK.test(base);
}

function cacheControlFor(urlPath) {
  if (CONFIG.staticMaxAge > 0 && isHashedAsset(urlPath)) {
    return `public, max-age=${CONFIG.staticMaxAge}, immutable`;
  }
  return "no-cache";
}

function acceptedEncodings(header) {
  const accepted = new Set();
  for (const part of String(header || "").split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    if (!name) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    if (q !== undefined && !(Number(q.slice(2)) > 0)) continue;
    accepted.add(name.trim());
  }
  return accepted;
}

function etagMatches(header, etag) {
  const strip = (v) => v.trim().replace(/^W\//, "");
  return header.split(",").some((v) => v.trim() === "*" || strip(v) === strip(etag));
}

function isNotModified(req, etag, mtime) {
  const ifNoneMatch = req.headers["if-none-match"];
  if (ifNoneMatch !== undefined) return etagMatches(ifNoneMatch, etag);
  const since = Date.parse(req.headers["if-modified-since"] || "");
  return Number.isFinite(since) && Math.floor(mtime.getTime() / 1000) * 1000 <= since;
}

// ─── Backend-Proxy ────────────────────────────────────────────────────────────

function proxyToBackend(req, res) {
  const headers = { ...req.headers };
  headers.host = `${CONFIG.backendHost}:${CONFIG.backendPort}`;

  // X-Forwarded-* setzen, damit das Backend den echten Client kennt
  const clientIp = req.socket.remoteAddress || "";
  headers["x-forwarded-for"] = req.headers["x-forwarded-for"]
    ? `${req.headers["x-forwarded-for"]}, ${clientIp}`
    : clientIp;
  headers["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "http";
  headers["x-forwarded-host"] = req.headers.host || "";

  const options = {
    protocol: `${CONFIG.backendProtocol}:`,
    hostname: CONFIG.backendHost,
    port: CONFIG.backendPort,
    path: req.url,
    method: req.method,
    headers,
  };

  const upstream = backendClient.request(options, (backendRes) => {
    res.writeHead(backendRes.statusCode, backendRes.headers);
    backendRes.pipe(res, { end: true });
  });

  upstream.setTimeout(CONFIG.proxyTimeoutMs, () => {
    upstream.destroy(new Error(`Upstream-Timeout nach ${CONFIG.proxyTimeoutMs}ms`));
  });

  upstream.on("error", (err) => {
    console.error("[proxy] Backend nicht erreichbar:", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    }
    if (!res.writableEnded) {
      res.end(
        JSON.stringify({
          success: false,
          error: "Backend nicht erreichbar. Stelle sicher dass der Backend-Server läuft.",
        }),
      );
    }
  });

  req.on("error", () => upstream.destroy());
  req.pipe(upstream, { end: true });
}

// ─── Statische Dateien ────────────────────────────────────────────────────────

function statFile(filePath, cb) {
  fs.stat(filePath, (err, stats) => cb(err || !stats.isFile() ? null : stats));
}

function pickVariant(req, filePath, ext, cb) {
  if (!COMPRESSIBLE.has(ext)) {
    cb(filePath, null, null);
    return;
  }
  const accepted = acceptedEncodings(req.headers["accept-encoding"]);
  const candidates = [
    ["br", ".br"],
    ["gzip", ".gz"],
  ].filter(([encoding]) => accepted.has(encoding));

  const next = (i) => {
    if (i >= candidates.length) {
      cb(filePath, null, null);
      return;
    }
    const [encoding, suffix] = candidates[i];
    statFile(filePath + suffix, (stats) => {
      if (stats) cb(filePath + suffix, encoding, stats);
      else next(i + 1);
    });
  };
  next(0);
}

// cacheKey overrides the url path for cache decisions (SPA fallback is index.html).
function sendFile(req, res, urlPath, filePath, stats, cacheKey) {
  const ext = path.extname(filePath);
  pickVariant(req, filePath, ext, (sendPath, encoding, variantStats) => {
    const info = variantStats || stats;
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cacheControlFor(cacheKey || urlPath),
      ETag: etag,
      "Last-Modified": info.mtime.toUTCString(),
    };
    if (COMPRESSIBLE.has(ext)) headers.Vary = "Accept-Encoding";
    if (encoding) headers["Content-Encoding"] = encoding;

    if (isNotModified(req, etag, info.mtime)) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    headers["Content-Length"] = info.size;
    res.writeHead(200, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = fs.createReadStream(sendPath);
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  });
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

// Navigation requests (no extension, or .html) fall back to the app shell.
function spaFallback(req, res, ext) {
  if (ext && ext !== ".html") {
    sendText(res, 404, "404 Not Found");
    return;
  }
  const index = path.join(CONFIG.distDir, "index.html");
  statFile(index, (stats) => {
    if (!stats) {
      sendText(res, 500, "Server-Fehler: index.html nicht gefunden. Wurde der Build ausgeführt?");
      return;
    }
    sendFile(req, res, "/index.html", index, stats);
  });
}

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = new URL(req.url, `http://localhost:${CONFIG.port}`).pathname;
  } catch {
    sendText(res, 400, "400 Bad Request");
    return;
  }
  const safe = safePath(urlPath);
  if (safe === null) {
    sendText(res, 403, "403 Forbidden");
    return;
  }

  const ext = path.extname(urlPath);

  statFile(safe, (stats) => {
    if (stats) {
      sendFile(req, res, urlPath, safe, stats);
      return;
    }
    fs.stat(safe, (dirErr, dirStats) => {
      if (!dirErr && dirStats.isDirectory()) {
        const index = path.join(safe, "index.html");
        statFile(index, (indexStats) => {
          if (indexStats) sendFile(req, res, "/index.html", index, indexStats);
          else spaFallback(req, res, "");
        });
        return;
      }
      spaFallback(req, res, ext);
    });
  });
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  let pathname;
  try {
    ({ pathname } = new URL(req.url, `http://localhost:${CONFIG.port}`));
  } catch {
    sendText(res, 400, "400 Bad Request");
    return;
  }

  if (CONFIG.proxyPaths.some((p) => pathname.startsWith(p))) {
    proxyToBackend(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      "Content-Type": "text/plain; charset=utf-8",
      Allow: "GET, HEAD",
    });
    res.end("405 Method Not Allowed");
    return;
  }

  serveStatic(req, res);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\x1b[31m✗\x1b[0m Port ${CONFIG.port} ist bereits belegt.`);
  } else {
    console.error(`\x1b[31m✗\x1b[0m Server-Fehler:`, err.message);
  }
  process.exit(1);
});

server.listen(CONFIG.port, CONFIG.bindHost, () => {
  const target = `${CONFIG.backendProtocol}://${CONFIG.backendHost}:${CONFIG.backendPort}`;
  console.log(`\x1b[32m✓\x1b[0m Frontend läuft auf  \x1b[1mhttp://localhost:${CONFIG.port}\x1b[0m`);
  console.log(`\x1b[90m  Backend-Proxy →     ${target}  (${CONFIG.proxyPaths.join(", ")})\x1b[0m`);
});

// ─── Graceful Shutdown (für pm2 restart/stop) ───────────────────────────────────

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`\n${sig} empfangen, Server wird beendet…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
