/**
 * Characterization tests for the router table and its global guard:
 * authentication and admin gating, and which routes exist in production
 * builds. Views are lazy-loaded, so only redirecting navigations are driven.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const session = vi.hoisted(() => ({
  ensureAuthenticated: vi.fn(async () => true),
  isAdmin: false,
}));

vi.mock("@/stores/session", () => ({ useSessionStore: () => session }));
import { modalController } from "@ionic/vue";
import Utils from "@/utils/utils";
import ToastService from "@/services/general/ToastService";
import router from "@/router";

beforeEach(async () => {
  vi.spyOn(Utils, "closeAllOpenModals").mockResolvedValue(undefined);
  vi.spyOn(ToastService, "showWarning").mockImplementation(() => undefined);
  session.ensureAuthenticated.mockResolvedValue(true);
  session.isAdmin = false;
  await router.replace("/login").catch(() => undefined);
});

describe("route table", () => {
  const byName = (name: string) => router.getRoutes().find((r) => r.name === name);

  it("requires authentication on every app route", () => {
    for (const name of [
      "profile",
      "plant-overview",
      "plant-details",
      "substrate-overview",
      "substrate-details",
      "component-overview",
      "component-details",
      "sales",
      "sales-details",
      "admin-dashboard",
      "admin-scrapers",
    ]) {
      expect(byName(name)?.meta.requiresAuth, name).toBe(true);
    }
  });

  it("marks only the admin routes as admin-only", () => {
    const adminRoutes = router
      .getRoutes()
      .filter((r) => r.meta.requiresAdmin)
      .map((r) => r.name);
    expect(adminRoutes.sort()).toEqual(["admin-dashboard", "admin-scrapers"]);
  });

  it("leaves login and the not-found catch-all public", () => {
    expect(byName("login")?.meta.requiresAuth).toBe(false);
    expect(byName("not-found")?.meta.requiresAuth).toBe(false);
  });

  it("registers the debug view only in development builds (SEC-10)", () => {
    expect(import.meta.env.MODE).not.toBe("development");
    expect(byName("debug")).toBeUndefined();
  });

  it("redirects the root path to the login page", async () => {
    await router.push("/tabs/plants").catch(() => undefined);
    await router.push("/");
    expect(router.currentRoute.value.name).toBe("login");
  });
});

describe("global guard", () => {
  it("sends unauthenticated visitors of protected routes to the login page", async () => {
    session.ensureAuthenticated.mockResolvedValue(false);
    await router.push("/tabs/plants");
    expect(router.currentRoute.value.name).toBe("login");
  });

  it("remembers the requested url so the login can return to it", async () => {
    session.ensureAuthenticated.mockResolvedValue(false);
    await router.push("/tabs/plants/details/4/0");
    expect(router.currentRoute.value.name).toBe("login");
    expect(router.currentRoute.value.query.redirect).toBe("/tabs/plants/details/4/0");
  });

  it("sends signed-in non-admins away from admin routes to the plant overview with a notice", async () => {
    session.isAdmin = false;
    await router.push("/tabs/admin");
    expect(router.currentRoute.value.name).toBe("plant-overview");
    expect(ToastService.showWarning).toHaveBeenCalledWith({ key: "admin.no_access" });
  });

  it("keeps unknown tab urls inside the shell instead of the top-level 404", async () => {
    await router.push("/tabs/nothing/here");
    expect(router.currentRoute.value.name).toBe("tabs-not-found");
    await router.push("/nothing");
    expect(router.currentRoute.value.name).toBe("not-found");
  });

  it("sends a failing authentication check to the login page", async () => {
    session.ensureAuthenticated.mockRejectedValue(new Error("storage unavailable"));
    await router.push("/tabs/plants");
    expect(router.currentRoute.value.name).toBe("login");
  });

  it("still navigates when dismissing an open modal throws", async () => {
    vi.mocked(Utils.closeAllOpenModals).mockRestore();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(modalController, "getTop").mockResolvedValue({} as HTMLIonModalElement);
    vi.spyOn(modalController, "dismiss").mockRejectedValue(
      new TypeError("Cannot read properties of null (reading 'insertBefore')"),
    );
    await router.push("/tabs/plants/details/13/0").catch(() => undefined);
    await router.push("/tabs/plants");
    expect(router.currentRoute.value.name).toBe("plant-overview");
  });
});

describe("watering round route", () => {
  it("lives under the plants tab", () => {
    const route = router.getRoutes().find((r) => r.name === "water-round");
    expect(route?.path).toBe("/tabs/plants/water");
    expect(route?.meta.titleKey).toBe("water.title");
  });

  it.each(["/tabs/water", "/water"])("redirects %s to the round", async (legacy) => {
    await router.push(legacy);
    expect(router.currentRoute.value.path).toBe("/tabs/plants/water");
    expect(router.currentRoute.value.name).toBe("water-round");
  });
});
