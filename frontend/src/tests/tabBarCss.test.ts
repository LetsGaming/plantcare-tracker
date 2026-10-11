import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import de from "@/locales/de";
import en from "@/locales/en";

const css = readFileSync(resolve(__dirname, "../theme/custom.css"), "utf8").replaceAll(
  "\r\n",
  "\n",
);

function rulesFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "gm");
  return [...css.matchAll(pattern)].map((m) => m[1]).join("\n");
}

describe("tab bar styles", () => {
  it("reads a non-empty stylesheet", () => {
    expect(css.length).toBeGreaterThan(0);
  });

  it("lets tab buttons shrink and share the width equally", () => {
    const body = rulesFor("ion-tab-button");
    expect(body).toContain("min-width: 0");
    expect(body).toContain("flex: 1 1 0");
  });

  it("keeps the idle and selected colors", () => {
    const body = rulesFor("ion-tab-button");
    expect(body).toContain("--color: var(--nav-idle)");
    expect(body).toContain("--color-selected: var(--ion-color-primary)");
  });

  it("keeps each label on one line without mid word breaks", () => {
    const body = rulesFor("ion-tab-button ion-label");
    expect(body).toContain("font-size: clamp(0.5625rem, 2.6vw, var(--text-xs))");
    expect(body).toContain("white-space: nowrap");
    expect(body).toContain("overflow-wrap: normal");
    expect(body).toContain("hyphens: none");
    expect(body).toContain("text-overflow: ellipsis");
    expect(body).not.toContain("anywhere");
    expect(body).toContain("text-align: center");
  });
});

describe("searchbar focus", () => {
  it("draws the shared 3px focus ring with an offset", () => {
    const body = rulesFor("ion-searchbar.searchbar-has-focus,\nion-searchbar:focus-within");
    expect(body).toContain("outline: 3px solid var(--focus-ring)");
    expect(body).toContain("outline-offset: 2px");
  });
});

describe("tab labels", () => {
  it("uses a short German label for components", () => {
    expect(de["tabs.components"]).toBe("Zutaten");
    expect(en["tabs.components"]).toBe("Components");
  });

  it("keeps every German tab label short enough for five tabs", () => {
    for (const key of [
      "tabs.plants",
      "tabs.water",
      "tabs.substrates",
      "tabs.components",
      "tabs.sales",
    ] as const) {
      expect(de[key].length).toBeLessThanOrEqual(9);
    }
  });
});
