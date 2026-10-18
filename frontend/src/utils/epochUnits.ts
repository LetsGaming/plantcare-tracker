/** Epoch values below this are seconds (it is year 5138 in seconds, March 1973 in milliseconds). */
const SECONDS_CEILING = 1e11;

/** Normalizes an epoch given in seconds or milliseconds to milliseconds. */
export const toEpochMillis = (epoch: number): number =>
  epoch < SECONDS_CEILING ? epoch * 1000 : epoch;
