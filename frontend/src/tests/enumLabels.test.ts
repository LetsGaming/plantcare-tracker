import { describe, it, expect, vi } from "vitest";

const dictionary: Record<string, string> = {
  "copy2.fertilizer.organic": "Organisch",
  "copy2.fertilizer.synthetic": "Mineralisch",
  "copy2.fineness.fine": "Fein",
  "copy2.fineness.medium": "Mittel",
  "copy2.fineness.coarse": "Grob",
  "copy2.parts.one": "{count} Teil",
  "copy2.parts.other": "{count} Teile",
};

vi.mock("@/services/general/LocalizationService", () => ({
  default: {
    getLocale: () => "de",
    t: (key: string, vars?: Record<string, string>, fallback?: string) => {
      const text = dictionary[key] ?? fallback ?? key;
      return text.replace(/\{(\w+)\}/g, (match, name) => vars?.[name] ?? match);
    },
  },
}));

import { fertilizerLabel, finenessLabel, formatNumber, partsLabel } from "@/utils/enumLabels";

describe("enum labels", () => {
  it("translates fertilizer types", () => {
    expect(fertilizerLabel("organic")).toBe("Organisch");
    expect(fertilizerLabel("Synthetic")).toBe("Mineralisch");
  });

  it("translates fineness levels", () => {
    expect(finenessLabel("fine")).toBe("Fein");
    expect(finenessLabel("medium")).toBe("Mittel");
    expect(finenessLabel("coarse")).toBe("Grob");
  });

  it("passes unknown names through and tolerates empty values", () => {
    expect(fertilizerLabel("guano")).toBe("guano");
    expect(finenessLabel("extra fine")).toBe("extra fine");
    expect(finenessLabel(undefined)).toBe("");
    expect(fertilizerLabel(null)).toBe("");
  });
});

describe("number and plural formatting", () => {
  it("uses the locale decimal separator", () => {
    expect(formatNumber(0.5, "de")).toBe("0,5");
    expect(formatNumber(0.5, "en")).toBe("0.5");
  });

  it("picks the singular for exactly one", () => {
    expect(partsLabel(1, "de")).toBe("1 Teil");
  });

  it("picks the plural for other counts, including fractions and zero", () => {
    expect(partsLabel(2, "de")).toBe("2 Teile");
    expect(partsLabel(0.5, "de")).toBe("0,5 Teile");
    expect(partsLabel(0, "de")).toBe("0 Teile");
  });
});
