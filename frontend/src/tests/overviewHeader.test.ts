import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

const menuClose = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@ionic/vue", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, menuController: { close: menuClose } };
});

import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import SideMenu from "@/components/SideMenu.vue";
import en from "@/locales/en";
import de from "@/locales/de";

const passthrough = (tag = "div") =>
  defineComponent({
    render() {
      return h(tag, this.$slots.default?.());
    },
  });

const IconButtonStub = defineComponent({
  props: { label: { type: String, default: "" } },
  render() {
    return h("button", { "data-label": this.label });
  },
});

const stubs = {
  IonHeader: passthrough(),
  IonToolbar: passthrough(),
  IonTitle: passthrough("ion-title"),
  IonButtons: passthrough(),
  IonMenuButton: passthrough(),
  IonSegment: passthrough(),
  IonSegmentButton: passthrough(),
  IonLabel: passthrough(),
  IonIcon: passthrough(),
  IconButton: IconButtonStub,
};

const vueFiles = import.meta.glob("../**/*.vue", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sourceOf = (name: string): string => {
  const entry = Object.entries(vueFiles).find(([file]) => file.endsWith("/" + name));
  expect(entry).toBeDefined();
  return entry![1];
};

describe("overview header chrome", () => {
  it("scans the component sources", () => {
    expect(Object.keys(vueFiles).length).toBeGreaterThan(20);
  });

  it("renders no logout button in the toolbar", () => {
    const wrapper = mount(OverviewHeader, {
      props: { title: "plants.title", addIcon: "add-icon", onAddClick: () => undefined },
      global: { stubs },
    });
    const labels = wrapper.findAll("button").map((b) => b.attributes("data-label"));
    expect(labels).not.toContain("a11y.logout");
    expect(labels).not.toContain(en["a11y.logout"]);
  });

  it("keeps no logout wiring in its source", () => {
    const source = sourceOf("OverviewHeader.vue");
    expect(source).not.toContain("confirmLogout");
    expect(source).not.toContain("a11y.logout");
    expect(source).not.toContain("icons.logout");
  });

  it("caps the segment at 360px from 992px up and spreads the row", () => {
    const source = sourceOf("OverviewHeader.vue");
    const start = source.indexOf("@media (min-width: 992px)");
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start);
    expect(block).toMatch(/\.segment\s*\{[^}]*max-width:\s*360px/);
    expect(block).toMatch(/\.segment-row\s*\{[^}]*justify-content:\s*space-between/);
    const base = source.slice(0, start);
    expect(base).not.toContain("360px");
  });
});

describe("side menu reminders and logout", () => {
  const source = sourceOf("SideMenu.vue");

  it("embeds menu-calendar only inside the reminders modal", () => {
    const tag = "<menu-calendar";
    expect(source.split(tag).length - 1).toBe(1);
    const modalStart = source.indexOf("<ion-modal");
    const modalEnd = source.indexOf("</ion-modal>");
    expect(modalStart).toBeGreaterThan(-1);
    expect(source.indexOf(tag)).toBeGreaterThan(modalStart);
    expect(source.indexOf(tag)).toBeLessThan(modalEnd);
  });

  it("labels the reminders modal and opens it from a menu item", () => {
    const modalStart = source.indexOf("<ion-modal");
    const modalTag = source.slice(modalStart, source.indexOf(">", modalStart));
    expect(modalTag).toContain(`:aria-label="t('shell.reminders')"`);
    expect(source).toContain('@click="openReminders"');
  });

  it("still offers logout in the footer", () => {
    const footer = source.slice(source.indexOf("<ion-footer>"), source.indexOf("</ion-footer>"));
    expect(footer).toContain('@click="logout"');
    expect(footer).toContain("shell.logout");
  });

  it("has the reminders title in both locales", () => {
    expect(en["shell.reminders"]).toBe("Reminders");
    expect(de["shell.reminders"]).toBe("Erinnerungen");
  });

  it("opens the reminders modal after closing the menu", async () => {
    const ctx = { showReminders: false };
    await (SideMenu as any).methods.openReminders.call(ctx);
    expect(menuClose).toHaveBeenCalled();
    expect(ctx.showReminders).toBe(true);
  });

  it("swaps the reminders modal for the settings modal", () => {
    const ctx = { showReminders: true, showDateSettings: false };
    (SideMenu as any).methods.openDateSettings.call(ctx);
    expect(ctx.showReminders).toBe(false);
    expect(ctx.showDateSettings).toBe(true);
  });

  it("closes the reminders state and releases the mount on dismiss", () => {
    const releaseReminders = vi.fn();
    const ctx = { showReminders: true, releaseReminders };
    (SideMenu as any).methods.onRemindersDismiss.call(ctx);
    expect(ctx.showReminders).toBe(false);
    expect(releaseReminders).toHaveBeenCalledTimes(1);
  });
});
