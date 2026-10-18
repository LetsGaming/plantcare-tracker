import { ValidationError } from '../../../core/errors';

const MIN_CAPTURE_MS = Date.UTC(2000, 0, 1);
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

const invalid = (message: string): ValidationError =>
  new ValidationError('Invalid date value', { date: message });

/** Parses the `date` form field (epoch milliseconds) into epoch milliseconds. */
export const parseCaptureDate = (raw: string | number, now: number = Date.now()): number => {
  const text = typeof raw === 'number' ? String(raw) : raw.trim();
  if (!/^\d{1,16}$/.test(text))
    throw invalid('date must be an integer Unix timestamp in milliseconds');
  const ms = Number(text);
  if (!Number.isSafeInteger(ms) || ms < MIN_CAPTURE_MS || ms > now + MAX_FUTURE_MS) {
    throw invalid('date must be between 2000-01-01 and tomorrow');
  }
  return ms;
};
