/**
 * src-v2/core/utils/index.ts
 * Shared pure utility functions used across modules.
 */

export const formatToDBDate = (dateInput: string | number | Date): string => {
  const date = new Date(dateInput);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
};

export const ensureArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value === 'object' && !(value instanceof Set) && !(value instanceof Map)) {
    return Object.values(value as object) as T[];
  }
  if (value instanceof Set || value instanceof Map) return Array.from(value) as T[];
  return [value];
};

export const filterDuplicatesById = <T>(items: T[], idKey: keyof T): T[] => {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item[idKey])) return false;
    seen.add(item[idKey]);
    return true;
  });
};
