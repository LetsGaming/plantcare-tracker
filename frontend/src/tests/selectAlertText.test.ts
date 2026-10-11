import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(__dirname, "../components", file), "utf8");

describe("select alert buttons", () => {
  it.each(["SideMenu.vue", "calendar/CalendarSettingsModal.vue"])(
    "translates cancel and ok in %s",
    (file) => {
      const select = source(file).match(/<ion-select\b[^>]*>/s)?.[0] ?? "";
      expect(select).toContain(':cancel-text="t(\'common.cancel\')"');
      expect(select).toContain(':ok-text="t(\'copy2.select.ok\')"');
    },
  );
});
