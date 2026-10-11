export const SERIES_SIZE = 5;

/** Zero based palette slot per slice; the last slice never shares a slot with the first. */
export const seriesSlots = (count: number): number[] => {
  const slots = Array.from({ length: count }, (_, i) => i % SERIES_SIZE);
  if (count > 1 && slots[count - 1] === slots[0]) slots[count - 1] = 1;
  return slots;
};
