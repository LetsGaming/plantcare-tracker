/** A positive number from user input; accepts a decimal comma. Null when it is not usable. */
export const parsePart = (raw: unknown): number | null => {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** True when at least one component is selected and every selected one has a usable part. */
export const selectionIsValid = (
  selectedIds: readonly number[],
  parts: Record<number, number | string | undefined>,
): boolean => selectedIds.length > 0 && selectedIds.every((id) => parsePart(parts[id]) !== null);
