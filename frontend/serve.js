/**
 * serve.js — Plantcare Frontend Production Server
 *
 * Läuft aus dem dist/-Verzeichnis nach dem Build (kopiert als serve.cjs).
 * - Serviert statische Dateien aus dem dist/-Verzeichnis (mit Cache-Headern)
 * - SPA-Fallback: Routen ohne Dateiendung erhalten index.html
 * - Proxied /api/* und /uploads/*  → Backend (Standard: localhost:5000)
 * - Schützt vor Path-Traversal, Timeouts und unsauberem Shutdown
 *
 * Konfiguration ausschließlich über Env-Vars — Datei muss nicht editiert werden:
 *   PORT             Port des Frontend-Servers        (default: 8080)
 *   BIND_HOST        Interface zum Binden             (default: alle)
 *   BACKEND_PROTOCOL http | https                     (default: http)
 *   BACKEND_HOST     Backend-Host                     (default: localhost)
 *   BACKEND_PORT     Backend-Port                     (default: 5000)
 *   PROXY_PATHS      Kommagetrennte Präfixe zum Proxen(default: /api/,/uploads/)
 *   PROXY_TIMEOUT_MS Upstream-Timeout in ms           (default: 30000)
 *   STATIC_MAX_AGE   Cache max-age für Assets (Sek.)  (default: 31536000)
 *   DIST_DIR         Verzeichnis der statischen Dateien(default: __dirname)
 *
 * Hinweis: Diese Datei wird nur als serve.cjs ausgeführt (CommonJS). Nicht direkt
 * mit `node serve.js` starten — das Projekt ist "type": "module".
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

const backendClient =
  CONFIG.backendProtocol === "https" ? require("https") : http;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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

// ─── Path-Traversal-Schutz ──────────────────────────────────────────────────────

function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // ungültige Prozent-Kodierung
  }
  const filePath = path.join(CONFIG.distDir, path.normalize(decoded));
  const rel = path.relative(CONFIG.distDir, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return filePath;
}

function cacheControlFor(ext) {
  if (ext === ".html") return "no-cache";
  if (CONFIG.staticMaxAge > 0)
    return `public, max-age=${CONFIG.staticMaxAge}, immutable`;
  return "no-cache";
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
    upstream.destroy(
      new Error(`Upstream-Timeout nach ${CONFIG.proxyTimeoutMs}ms`),
    );
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
          error:
            "Backend nicht erreichbar. Stelle sicher dass der Backend-Server läuft.",
        }),
      );
    }
  });

  req.on("error", () => upstream.destroy());
  req.pipe(upstream, { end: true });
}

// ─── Statische Dateien ────────────────────────────────────────────────────────

function sendFile(req, res, filePath, data) {
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": cacheControlFor(ext),
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(req.method === "HEAD" ? undefined : data);
}

function serveStatic(req, res) {
  const urlPath = new URL(req.url, `http://localhost:${CONFIG.port}`).pathname;
  const safe = safePath(urlPath);
  if (safe === null) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 Forbidden");
    return;
  }

  let filePath = safe;
  const ext = path.extname(urlPath);

  fs.stat(filePath, (statErr, stats) => {
    if (!statErr && stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    fs.readFile(filePath, (readErr, data) => {
      if (!readErr) {
        sendFile(req, res, filePath, data);
        return;
      }

      // SPA-Fallback: Routen ohne Dateiendung bekommen index.html
      if (!ext || ext === ".html") {
        fs.readFile(path.join(CONFIG.distDir, "index.html"), (fbErr, html) => {
          if (fbErr) {
            res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            res.end(
              "Server-Fehler: index.html nicht gefunden. Wurde der Build ausgeführt?",
            );
            return;
          }
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache",
          });
          res.end(req.method === "HEAD" ? undefined : html);
        });
      } else {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
      }
    });
  });
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${CONFIG.port}`);

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
  console.log(
    `\x1b[32m✓\x1b[0m Frontend läuft auf  \x1b[1mhttp://localhost:${CONFIG.port}\x1b[0m`,
  );
  console.log(
    `\x1b[90m  Backend-Proxy →     ${target}  (${CONFIG.proxyPaths.join(", ")})\x1b[0m`,
  );
});

// ─── Graceful Shutdown (für pm2 restart/stop) ───────────────────────────────────

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`\n${sig} empfangen — Server wird beendet…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
