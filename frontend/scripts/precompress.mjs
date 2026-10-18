#!/usr/bin/env node

/**
 * Writes gzip (.gz) and brotli (.br) siblings next to the compressible files
 * of the build output so nginx (`gzip_static on`) or serve.js can send them
 * without compressing per request.
 *
 *   node scripts/precompress.mjs [distDir]      (default: dist)
 */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompress, constants, gzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

const COMPRESSIBLE = new Set([
  ".js",
  ".mjs",
  ".css",
  ".html",
  ".json",
  ".svg",
  ".txt",
  ".xml",
  ".webmanifest",
  ".map",
]);
const MIN_BYTES = 1024;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(process.argv[2] ?? path.join(here, "..", "dist"));
  if (!(await stat(dist).catch(() => null))?.isDirectory()) {
    console.error(`precompress: ${dist} is not a directory`);
    process.exit(1);
  }

  let files = 0;
  let original = 0;
  let gzipped = 0;
  let brotlied = 0;
  for await (const file of walk(dist)) {
    if (!COMPRESSIBLE.has(path.extname(file).toLowerCase())) continue;
    const source = await readFile(file);
    if (source.length < MIN_BYTES) continue;
    const [gz, br] = await Promise.all([
      gzipAsync(source, { level: 9 }),
      brotliAsync(source, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
          [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
        },
      }),
    ]);
    // A sibling larger than the original would only cost bandwidth.
    if (gz.length < source.length) await writeFile(`${file}.gz`, gz);
    if (br.length < source.length) await writeFile(`${file}.br`, br);
    files += 1;
    original += source.length;
    gzipped += Math.min(gz.length, source.length);
    brotlied += Math.min(br.length, source.length);
  }

  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log(
    `precompress: ${files} files, ${kb(original)} -> gzip ${kb(gzipped)}, brotli ${kb(brotlied)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
