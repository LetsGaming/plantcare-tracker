import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

const session = vi.hoisted(() => ({
  ensureAuthenticated: vi.fn(async () => true),
  isAdmin: false,
}));

vi.mock("@/stores/session", () => ({ useSessionStore: () => session }));
import Utils from "@/utils/utils";
import router from "@/router";
import de from "@/locales/de";
import en from "@/locales/en";
import localizationService from "@/services/general/LocalizationService";
import { pageTitleFor, updateDocumentTitle } from "@/utils/pageTitle";
import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import AdminHeader from "@/components/admin/AdminHeader.vue";

const passthrough = (tag = "div") =>
  defineComponent({
    render() {
      return h(tag, this.$slots.default?.());
    },
  });

const stubs = {
  IonHeader: passthrough(),
  IonToolbar: passthrough(),
  IonTitle: passthrough("ion-title"),
  IonButtons: passthrough(),
  IonMenuButton: passthrough(),
  IonBackButton: passthrough(),
  IonSegment: passthrough(),
  IonSegmentButton: passthrough(),
  IonLabel: passthrough(),
  IonIcon: passthrough(),
  IconButton: passthrough(),
};

const appTitle = Utils.getAppTitle();

localizationService.registerTranslations("en", en as Record<string, string>);
localizationService.registerTranslations("de", de as Record<string, string>);

beforeEach(async () => {
  vi.spyOn(Utils, "closeAllOpenModals").mockResolvedValue(undefined);
  session.ensureAuthenticated.mockResolvedValue(true);
  await localizationService.setLocale("en");
  await router.replace("/login").catch(() => undefined);
});

describe("route titles", () => {
  const pageRoutes = router.getRoutes().filter((r) => r.name && r.name !== "tabs");

  it("finds the page routes", () => {
    expect(pageRoutes.length).toBeGreaterThanOrEqual(15);
  });

  it.each(pageRoutes.map((r) => [String(r.name), r.meta.titleKey] as const))(
    "%s has a title key present in both locales",
    (_name, key) => {
      expect(typeof key).toBe("string");
      expect((de as Record<string, string>)[key as string]).toBeTruthy();
      expect((en as Record<string, string>)[key as string]).toBeTruthy();
    },
  );
});

describe("page title", () => {
  it("composes the page and the app title", () => {
    expect(pageTitleFor({ meta: { titleKey: "plants.title" } })).toBe(
      `${en["plants.title"]} · ${appTitle}`,
    );
  });

  it("falls back to the app title without a key", () => {
    expect(pageTitleFor({ meta: {} })).toBe(appTitle);
    expect(pageTitleFor({})).toBe(appTitle);
  });

  it("writes document.title and follows the language", async () => {
    updateDocumentTitle({ meta: { titleKey: "plants.title" } });
    expect(document.title).toBe(`${en["plants.title"]} · ${appTitle}`);

    await localizationService.setLocale("de");
    updateDocumentTitle({ meta: { titleKey: "plants.title" } });
    expect(document.title).toBe(`${de["plants.title"]} · ${appTitle}`);
  });

  it("is set after a navigation", async () => {
    document.title = "stale";
    await router.push("/login");
    await router.replace("/nowhere-at-all");
    expect(document.title).toBe(`${en["state.not_found_title"]} · ${appTitle}`);
    await router.replace("/login");
    expect(document.title).toBe(`${en["login2.heading_login"]} · ${appTitle}`);
  });
});

describe("toolbar headings", () => {
  it("OverviewHeader renders the title as the only h1 inside ion-title", () => {
    const wrapper = mount(OverviewHeader, {
      props: { title: "plants.title" },
      global: { stubs },
    });
    expect(wrapper.findAll("h1")).toHaveLength(1);
    expect(wrapper.find("ion-title h1").text()).toBe(en["plants.title"]);
  });

  it("AdminHeader renders the title as the only h1 inside ion-title", () => {
    const wrapper = mount(AdminHeader, {
      props: { title: "Admin", backHref: "/tabs/plants" },
      global: { stubs },
    });
    expect(wrapper.findAll("h1")).toHaveLength(1);
    expect(wrapper.find("ion-title h1").text()).toBe("Admin");
  });
});
