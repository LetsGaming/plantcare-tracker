/**
 * src/core/utils/time.ts
 * Epoch normalisation shared by the modules that accept client or EXIF timestamps.
 */

/** Numbers below this are Unix seconds, anything at or above is milliseconds. */
const SECONDS_MILLIS_CUTOVER = 1e11;

/**
 * Epoch milliseconds for an ISO string, a Date, or a number given in
 * seconds or milliseconds. Null when the input is not a valid point in time.
 */
export const toEpochMillis = (input: string | number | Date): number | null => {
  const ms =
    typeof input === 'number'
      ? input < SECONDS_MILLIS_CUTOVER
        ? input * 1000
        : input
      : new Date(input).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/** Unix epoch seconds (floored) for the same inputs, or null when invalid. */
export const toEpochSeconds = (input: string | number | Date): number | null => {
  const ms = toEpochMillis(input);
  return ms === null ? null : Math.floor(ms / 1000);
};
