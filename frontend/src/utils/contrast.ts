const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const parse = (hex: string): [number, number, number] | null => {
  const m = hex.trim().replace("#", "");
  const full = m.length === 3 ? [...m].map((c) => c + c).join("") : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
};

const luminance = ([r, g, b]: [number, number, number]): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

export const contrastRatio = (a: string, b: string): number => {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 1;
  const [hi, lo] = [luminance(pa), luminance(pb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

export const readableInk = (background: string, dark = "#0e1812", light = "#ffffff"): string =>
  contrastRatio(dark, background) >= contrastRatio(light, background) ? dark : light;

const toHex = (rgb: number[]): string =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

export const ensureContrast = (color: string, background: string, minRatio: number): string => {
  const rgb = parse(color);
  const bg = parse(background);
  if (!rgb || !bg || contrastRatio(color, background) >= minRatio) return color;
  const target = luminance(bg) > 0.5 ? 0 : 255;
  for (let step = 1; step <= 25; step++) {
    const mixed = rgb.map((v) => v + (target - v) * (step * 0.04));
    const candidate = toHex(mixed);
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
  }
  return toHex([target, target, target]);
};
