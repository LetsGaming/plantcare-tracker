/// <reference types="node" />
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const serveSource = path.resolve(__dirname, "..", "..", "serve.js");
const BODY = `console.log("${"x".repeat(2000)}");`;

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

let root: string;
let port: number;
let child: ChildProcess;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port: p } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(p));
    });
  });
}

function request(
  method: string,
  urlPath: string,
  headers: Record<string, string> = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: urlPath, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "serve-js-"));
  const dist = path.join(root, "dist");
  fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
  fs.writeFileSync(path.join(root, "secret.txt"), "top secret");
  fs.writeFileSync(path.join(dist, "index.html"), "<html>shell</html>");
  fs.writeFileSync(path.join(dist, "sw.js"), BODY);
  fs.writeFileSync(path.join(dist, "workbox-1a2b3c4d.js"), BODY);
  fs.writeFileSync(path.join(dist, "assets", "index-Ab12Cd34.js"), BODY);
  fs.writeFileSync(path.join(dist, "assets", "index-Ab12Cd34.js.gz"), gzipSync(BODY));
  fs.writeFileSync(path.join(dist, "assets", "index-Ab12Cd34.js.br"), brotliCompressSync(BODY));
  fs.writeFileSync(path.join(dist, "assets", "only-gz-Ef56Gh78.css"), "a{}");
  fs.writeFileSync(path.join(dist, "assets", "only-gz-Ef56Gh78.css.gz"), gzipSync("a{}"));
  fs.writeFileSync(path.join(dist, "assets", "plain.js"), BODY);

  // serve.js is CommonJS but the package is "type": "module"; deploy copies it as serve.cjs.
  const script = path.join(root, "serve.cjs");
  fs.copyFileSync(serveSource, script);

  port = await freePort();
  child = spawn(process.execPath, [script], {
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      DIST_DIR: dist,
      BACKEND_PORT: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("serve.js did not start")), 10000);
    child.stdout?.on("data", (d: Buffer) => {
      if (d.toString().includes(String(port))) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => reject(new Error(`serve.js exited with ${code}`)));
  });
}, 15000);

afterAll(() => {
  child?.kill();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("serve.js static files", () => {
  it("marks hashed assets immutable and everything else revalidating", async () => {
    const hashed = await request("GET", "/assets/index-Ab12Cd34.js");
    expect(hashed.headers["cache-control"]).toBe("public, max-age=31536000, immutable");

    const workbox = await request("GET", "/workbox-1a2b3c4d.js");
    expect(workbox.headers["cache-control"]).toBe("public, max-age=31536000, immutable");

    for (const urlPath of ["/sw.js", "/index.html", "/assets/plain.js"]) {
      const reply = await request("GET", urlPath);
      expect(reply.status).toBe(200);
      expect(reply.headers["cache-control"]).toBe("no-cache");
    }
  });

  it("prefers brotli, then gzip, then the plain file, with Vary", async () => {
    const br = await request("GET", "/assets/index-Ab12Cd34.js", {
      "accept-encoding": "gzip, deflate, br",
    });
    expect(br.headers["content-encoding"]).toBe("br");
    expect(br.headers.vary).toBe("Accept-Encoding");
    expect(br.headers["content-type"]).toBe("application/javascript; charset=utf-8");
    expect(br.body.equals(brotliCompressSync(BODY))).toBe(true);

    const gz = await request("GET", "/assets/index-Ab12Cd34.js", { "accept-encoding": "gzip" });
    expect(gz.headers["content-encoding"]).toBe("gzip");
    expect(gz.headers["content-length"]).toBe(String(gz.body.length));

    const refused = await request("GET", "/assets/index-Ab12Cd34.js", {
      "accept-encoding": "br;q=0, gzip;q=0",
    });
    expect(refused.headers["content-encoding"]).toBeUndefined();
    expect(refused.body.toString()).toBe(BODY);
    expect(refused.headers.vary).toBe("Accept-Encoding");

    const fallback = await request("GET", "/assets/only-gz-Ef56Gh78.css", {
      "accept-encoding": "br, gzip",
    });
    expect(fallback.headers["content-encoding"]).toBe("gzip");
    expect(fallback.headers["content-type"]).toBe("text/css; charset=utf-8");
  });

  it("answers conditional requests with 304", async () => {
    const first = await request("GET", "/assets/index-Ab12Cd34.js", { "accept-encoding": "gzip" });
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();
    expect(first.headers["last-modified"]).toBeTruthy();

    const byEtag = await request("GET", "/assets/index-Ab12Cd34.js", {
      "accept-encoding": "gzip",
      "if-none-match": etag,
    });
    expect(byEtag.status).toBe(304);
    expect(byEtag.body.length).toBe(0);

    const byDate = await request("GET", "/assets/index-Ab12Cd34.js", {
      "accept-encoding": "gzip",
      "if-modified-since": first.headers["last-modified"] as string,
    });
    expect(byDate.status).toBe(304);

    const stale = await request("GET", "/assets/index-Ab12Cd34.js", {
      "accept-encoding": "gzip",
      "if-none-match": 'W/"0-0"',
    });
    expect(stale.status).toBe(200);

    const otherEncoding = await request("GET", "/assets/index-Ab12Cd34.js", {
      "accept-encoding": "br",
      "if-none-match": etag,
    });
    expect(otherEncoding.status).toBe(200);
  });

  it("supports HEAD without a body", async () => {
    const reply = await request("HEAD", "/assets/index-Ab12Cd34.js", { "accept-encoding": "gzip" });
    expect(reply.status).toBe(200);
    expect(reply.body.length).toBe(0);
    expect(Number(reply.headers["content-length"])).toBe(gzipSync(BODY).length);
  });

  it("falls back to index.html for navigation requests only", async () => {
    const route = await request("GET", "/tabs/plants");
    expect(route.status).toBe(200);
    expect(route.body.toString()).toBe("<html>shell</html>");
    expect(route.headers["cache-control"]).toBe("no-cache");

    const missing = await request("GET", "/assets/missing-Zz99Yy88.js");
    expect(missing.status).toBe(404);
  });

  it("rejects path traversal", async () => {
    for (const urlPath of [
      "/..%2fsecret.txt",
      "/%2e%2e%2fsecret.txt",
      "/assets/..%2f..%2fsecret.txt",
    ]) {
      const reply = await request("GET", urlPath);
      expect(reply.status).toBe(403);
      expect(reply.body.toString()).not.toContain("top secret");
    }
    expect((await request("GET", "/%00")).status).toBe(403);
    expect((await request("GET", "/%E0%A4%A")).status).toBe(403);
  });

  it("rejects other methods", async () => {
    expect((await request("POST", "/index.html")).status).toBe(405);
  });
});
