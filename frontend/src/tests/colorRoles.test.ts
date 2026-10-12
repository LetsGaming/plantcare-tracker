/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const vueFiles = import.meta.glob("../**/*.vue", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const read = (rel: string): string => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");

const vue = (suffix: string): string => {
  const key = Object.keys(vueFiles).find((k) => k.endsWith(suffix));
  const source = key ? vueFiles[key] : "";
  expect(source.length, `${suffix} readable`).toBeGreaterThan(0);
  return source;
};

/** Body of the first rule whose selector list is exactly `selector`. */
const rule = (source: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[}>])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  expect(match, `rule ${selector}`).not.toBeNull();
  return match ? match[1] : "";
};

describe("clay means overdue only", () => {
  const allowed = [
    "theme/custom.css",
    "theme/variables.css",
    "components/overview/ItemsOverview.vue",
    "components/ui/PlantPlaceholder.vue",
  ];
  const clay = /--ion-color-secondary|color="secondary"|--clay-wash/;

  it("appears only in the allow-listed files", () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const [file, source] of Object.entries(vueFiles)) {
      scanned++;
      const rel = file.replace("../", "");
      if (clay.test(source) && !allowed.includes(rel)) offenders.push(rel);
    }
    expect(scanned).toBeGreaterThan(20);
    for (const css of ["theme/custom.css"]) expect(read(css).length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("keeps the overdue chip in custom.css on clay", () => {
    expect(rule(read("theme/custom.css"), ".tone-chip.tone-overdue")).toContain(
      "--ion-color-secondary",
    );
  });
});

describe("NEW markers use the new token", () => {
  const overview = vue("overview/ItemsOverview.vue");
  const card = vue("overview/OverviewCard.vue");
  for (const [selector, source] of [
    [".new-pill", card],
    [".count-new", overview],
  ]) {
    it(`${selector} uses --new and --new-ink`, () => {
      const body = rule(source, selector);
      expect(body).toMatch(/var\(--new\)/);
      expect(body).toMatch(/var\(--new-ink\)/);
    });
  }

  for (const file of ["views/TabsPage.vue", "components/SideMenu.vue"]) {
    it(`${file} sales badge is not clay`, () => {
      const source = vue(file);
      expect(source).not.toContain('color="secondary"');
      expect(source).toMatch(/--background:\s*var\(--new\)/);
      expect(source).toMatch(/--color:\s*var\(--new-ink\)/);
    });
  }

  it("discount chip is neutral with an icon", () => {
    const body = rule(card, ".discount-chip");
    expect(body).toContain("var(--surface-sunken)");
    expect(body).toContain("var(--ion-text-color)");
    expect(card).toMatch(/<ion-icon[^>]*icons\.discount/);
  });

  it("pills use the shared pill sizing, not literals", () => {
    const body = rule(card, ".new-pill");
    expect(body).not.toMatch(/999px|2px 10px/);
    expect(body).toContain("var(--radius-pill)");
    expect(rule(card, ".status-chip")).not.toMatch(/999px|2px 10px/);
    expect(card).toMatch(/class="status-chip tone-chip"|status-chip[^>]*tone-chip/);
  });
});

describe("status line", () => {
  const card = vue("overview/OverviewCard.vue");
  it("overdue uses the overdue ink and due stays tertiary", () => {
    expect(rule(card, ".status-line.tone-overdue")).toContain("var(--overdue-ink)");
    expect(rule(card, ".status-line.tone-due")).toContain("--ion-color-tertiary-shade");
  });
});

describe("error and offline states", () => {
  it("care guide error uses the danger wash", () => {
    expect(rule(vue("plants/MoreInfo.vue"), ".guide-error")).toContain("var(--danger-wash)");
  });
  it("refresh error banner uses the danger wash", () => {
    expect(rule(vue("admin/RefreshErrorBanner.vue"), ".banner")).toContain("var(--danger-wash)");
  });
  it("offline banner uses the offline background and online keeps leaf", () => {
    const banner = vue("ui/OfflineBanner.vue");
    expect(rule(banner, ".offline-banner.is-offline")).toContain("var(--offline-bg)");
    expect(rule(banner, ".offline-banner.is-online")).toContain("var(--leaf-wash)");
  });
});

describe("public chip and care guide headings", () => {
  for (const file of ["plants/PlantTag.vue", "ui/DetailHero.vue"]) {
    it(`${file} public chip is neutral`, () => {
      const body = rule(vue(file), ".chip-public");
      expect(body).toContain("var(--surface-sunken)");
      expect(body).toContain("var(--ink-soft)");
      expect(body).not.toContain("water-wash");
    });
  }

  it("guide headings use ink and the display font", () => {
    const body = rule(vue("plants/MoreInfo.vue"), ".guide-text .info-header");
    expect(body).toContain("var(--ion-text-color)");
    expect(body).toContain("var(--font-display)");
  });
});

describe("admin source status", () => {
  it("renders ok quietly", () => {
    const strip = vue("admin/SourceStatusStrip.vue");
    const body = rule(strip, ".tone-success");
    expect(body).toContain("var(--leaf-wash)");
    expect(body).toContain("var(--ion-text-color)");
    expect(rule(strip, ".chip.empty")).toContain("var(--control-border)");
    const row = vue("admin/SourceRow.vue");
    expect(row).toMatch(/status-ok/);
    expect(rule(row, ".status-ok")).toContain("var(--leaf-wash)");
  });
});

describe("chart series tokens", () => {
  for (const file of ["charts/PieChart.vue", "substrates/SubstrateContainer.vue"]) {
    it(`${file} reads --series-1..5 only`, () => {
      const source = vue(file);
      expect(source).toContain("@/utils/seriesColors");
      expect(source).toMatch(/--series-/);
      expect(source).not.toMatch(/--chart-\d|--chart-\$\{/);
      expect(source).not.toContain("swatch-6");
    });
  }

  it("line chart keeps its own tokens", () => {
    expect(vue("charts/LineChart.vue")).toContain("--chart-line-color");
  });

  it("substrate bar and pie are mutually exclusive by viewport", () => {
    const source = vue("substrates/SubstrateContainer.vue");
    expect(source).toMatch(/class="composition-bar"[^>]*role="img"|role="img"[^>]*composition-bar/);
    expect(source).toMatch(/@media \(max-width: 575px\)/);
    expect(rule(source, ".composition-bar")).toContain("display: none");
    expect(source).toMatch(
      /@media \(max-width: 575px\)[\s\S]*\.composition-pie\s*\{\s*display: none/,
    );
    expect(rule(source, ".composition-bar")).toContain("height: 24px");
  });
});

describe("sales saving", () => {
  it("is not clay", () => {
    expect(rule(vue("views/sales/SalesDetails.vue"), ".saving")).not.toContain("secondary");
  });
});

describe("fertilizer kinds", () => {
  it.each([
    ["organic", "--feed-organic"],
    ["mineral", "--feed-mineral"],
  ])("checks the %s round segment in its feed token", (kind, token) => {
    expect(rule(read("theme/custom.css"), `ion-segment-button[data-kind="${kind}"]`)).toContain(
      `--color-checked: var(${token})`,
    );
  });

  it("keeps the calendar free of clay", () => {
    for (const file of ["calendar/Calendar.vue", "calendar/CalendarLegend.vue"]) {
      expect(vue(file)).not.toMatch(/--ion-color-secondary|color="secondary"|--clay/);
    }
  });
});
