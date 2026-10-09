#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_URL =
  'https://huggingface.co/onnx-community/dinov2-small/resolve/main/onnx/model_quantized.onnx';
const EXPECTED_BYTES = 24_446_700;
const EXPECTED_SHA256 = 'c179f8f7f592449c4c1bca4cd124a7538021428c5ffb89afde9503935b197efb';
const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'models',
  'dinov2-small-q8.onnx',
);
const partial = `${target}.tmp`;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const response = await fetch(MODEL_URL);
if (!response.ok) fail(`Download failed: HTTP ${response.status}`);

const data = Buffer.from(await response.arrayBuffer());
const sha256 = createHash('sha256').update(data).digest('hex');
if (data.length !== EXPECTED_BYTES) {
  fail(`Unexpected size ${data.length}, expected ${EXPECTED_BYTES}. Nothing was saved.`);
}
if (sha256 !== EXPECTED_SHA256) {
  fail(
    `Checksum mismatch: got sha256:${sha256}, expected sha256:${EXPECTED_SHA256}. Nothing was saved.`,
  );
}

await mkdir(path.dirname(target), { recursive: true });
try {
  await writeFile(partial, data);
  await rename(partial, target);
} catch (error) {
  await rm(partial, { force: true });
  throw error;
}
console.log(`Saved ${target}`);
console.log(`sha256:${sha256}`);
