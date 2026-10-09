#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_URL =
  'https://huggingface.co/onnx-community/dinov2-small/resolve/main/onnx/model_quantized.onnx';
const EXPECTED_BYTES = 24_446_700;
const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'models',
  'dinov2-small-q8.onnx',
);

const response = await fetch(MODEL_URL);
if (!response.ok) {
  console.error(`Download failed: HTTP ${response.status}`);
  process.exit(1);
}
const data = Buffer.from(await response.arrayBuffer());
if (data.length !== EXPECTED_BYTES) {
  console.error(`Unexpected size ${data.length}, expected ${EXPECTED_BYTES}`);
  process.exit(1);
}
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, data);
console.log(`Saved ${target}`);
console.log(`sha256:${createHash('sha256').update(data).digest('hex')}`);
