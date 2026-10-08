/**
 * modules/images/presentation/multipartUpload.ts
 *
 * Reads the image and text fields of a multipart request that
 * @fastify/multipart has already attached to the body.
 */

import type { FastifyRequest } from 'fastify';
import type { MultipartFile, MultipartValue } from '@fastify/multipart';
import { ValidationError } from '../../../core/errors';
import type { UploadedFile } from '../domain/Image';

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

export interface ParsedUpload {
  /** The `image` part, when one was sent. */
  file?: UploadedFile;
  fields: Record<string, string>;
}

const isFilePart = (part: unknown): part is MultipartFile =>
  typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'file';

const isFieldPart = (part: unknown): part is MultipartValue<unknown> =>
  typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'field';

export const readUpload = async (request: FastifyRequest): Promise<ParsedUpload> => {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const [name, part] of Object.entries(body)) {
    if (isFieldPart(part) && typeof part.value === 'string') fields[name] = part.value;
  }

  const image = body['image'];
  if (!isFilePart(image)) return { fields };

  if (!ALLOWED_MIME_TYPES.includes(image.mimetype)) {
    throw new ValidationError('Invalid file type. Only png, jpeg, and jpg are allowed.');
  }
  return { file: { buffer: await image.toBuffer(), originalName: image.filename }, fields };
};
