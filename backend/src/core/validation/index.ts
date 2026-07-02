/**
 * core/validation/index.ts
 *
 * Shared bridge between zod and the AppError hierarchy.
 *
 * Every use case used to repeat the same four lines: safeParse, check
 * success, fold the issues into a { path: message } map, throw a
 * ValidationError. Some modules (watering, substrate, components) even
 * skipped the fields map and threw with only the first issue message,
 * so 400 responses were inconsistent across the API. This helper makes
 * the behaviour uniform: one call site, always with a per-field map.
 */

import type { ZodType } from 'zod';
import { ValidationError } from '../errors';

/**
 * Parses `input` with the given schema.
 *
 * On success returns the typed, parsed data.
 * On failure throws a ValidationError (HTTP 400) whose `fields` map
 * carries one message per offending path — exactly the shape the
 * frontend consumes from the `{ error: { fields } }` envelope.
 */
export function parseOrThrow<T>(
  schema: ZodType<T>,
  input: unknown,
  message: string,
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = Object.fromEntries(
      result.error.issues.map((issue) => [
        issue.path.join('.') || '_',
        issue.message,
      ]),
    );
    throw new ValidationError(message, fields);
  }
  return result.data;
}
