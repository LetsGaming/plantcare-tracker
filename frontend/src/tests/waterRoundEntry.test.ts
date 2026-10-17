import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import PlantOverview from "@/views/plants/PlantOverview.vue";
import de from "@/locales/de";
import en from "@/locales/en";
import { navIcons } from "@/theme/icons";

const source = (path: string): string =>
  readFileSync(resolve(__dirname, "..", path), "utf8").replaceAll("\r\n", "\n");

const showRoundButton = (state: {
  isPublic: boolean;
  isGuest: boolean;
  personalPlants: unknown[];
}) =>
  (PlantOverview as any).computed.showRoundButton.call({
    isPublic: state.isPublic,
    isGuest: state.isGuest,
    mineList: { items: state.personalPlants },
  });

describe("watering round entry on the plant overview", () => {
  it("shows the button in the private segment for a signed-in user with plants", () => {
    expect(showRoundButton({ isPublic: false, isGuest: false, personalPlants: [{}] })).toBe(true);
  });

  it("hides the button in the public segment", () => {
    expect(showRoundButton({ isPublic: true, isGuest: false, personalPlants: [{}] })).toBe(false);
  });

  it("hides the button for guests", () => {
    expect(showRoundButton({ isPublic: false, isGuest: true, personalPlants: [{}] })).toBe(false);
  });

  it("hides the button when there are no plants to water", () => {
    expect(showRoundButton({ isPublic: false, isGuest: false, personalPlants: [] })).toBe(false);
  });

  it("opens the round route", () => {
    const push = vi.fn();
    (PlantOverview as any).methods.openRound.call({ $router: { push } });
    expect(push).toHaveBeenCalledWith("/tabs/plants/water");
  });

  it("labels the button in both languages", () => {
    expect(en["plants.water_round"]).toBe("Watering round");
    expect(de["plants.water_round"]).toBe("Gießrunde");
  });
});

describe("watering round is not a tab", () => {
  it("has no tab button in the tab bar", () => {
    const tabs = source("views/TabsPage.vue");
    expect(tabs).not.toContain('tab="water"');
    expect(tabs).not.toContain("tabs.water");
  });

  it("has no side menu destination", () => {
    expect(source("components/SideMenu.vue")).not.toContain("tabs.water");
  });

  it("has no tab icon or tab label", () => {
    expect(Object.keys(navIcons)).not.toContain("water");
    expect("tabs.water" in en).toBe(false);
    expect("tabs.water" in de).toBe(false);
  });

  it("gives the round page a back button to the plants", () => {
    const view = source("views/water/WaterRound.vue");
    expect(view).toContain('back-href="/tabs/plants"');
  });
});
