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
import Utils from "@/utils/utils";
import router from "@/router";

beforeEach(async () => {
  vi.spyOn(Utils, "closeAllOpenModals").mockResolvedValue(undefined);
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

  it("sends signed-in non-admins away from admin routes to the plant overview", async () => {
    session.isAdmin = false;
    await router.push("/tabs/admin");
    expect(router.currentRoute.value.name).toBe("plant-overview");
  });

  it("sends a failing authentication check to the login page", async () => {
    session.ensureAuthenticated.mockRejectedValue(new Error("storage unavailable"));
    await router.push("/tabs/plants");
    expect(router.currentRoute.value.name).toBe("login");
  });
});
