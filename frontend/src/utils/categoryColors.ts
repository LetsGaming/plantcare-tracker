const hexToHsl = (hex: string): [number, number, number] => {
  const r = parseInt(hex.substring(1, 3), 16) / 255;
  const g = parseInt(hex.substring(3, 5), 16) / 255;
  const b = parseInt(hex.substring(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s, l];
};

const hueToRgb = (p: number, q: number, t: number): number => {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
};

const hslToHex = (h: number, s: number, l: number): string => {
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h / 360 + 1 / 3);
    g = hueToRgb(p, q, h / 360);
    b = hueToRgb(p, q, h / 360 - 1 / 3);
  }
  const packed =
    (1 << 24) + (Math.round(r * 255) << 16) + (Math.round(g * 255) << 8) + Math.round(b * 255);
  return `#${packed.toString(16).slice(1)}`;
};

/** A readable text color for a user-chosen category background. */
export const contrastTextColor = (backgroundHex: string): string => {
  const [hue, saturation, lightness] = hexToHsl(backgroundHex);
  return hslToHex((hue + 180) % 360, Math.max(0.6, saturation), lightness > 0.5 ? 0.2 : 0.8);
};

/** True when `name` is empty or already used by another category (case-insensitive). */
export const categoryNameProblem = (
  name: string,
  others: readonly string[],
): "empty" | "duplicate" | null => {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  const lower = trimmed.toLowerCase();
  return others.some((other) => other.trim().toLowerCase() === lower) ? "duplicate" : null;
};
