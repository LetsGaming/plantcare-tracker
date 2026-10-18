import { describe, it, expect, vi } from "vitest";

vi.mock("@ionic/vue", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ionic/vue");
  return { ...actual, menuController: { close: vi.fn().mockResolvedValue(true) } };
});

import SideMenu from "@/components/SideMenu.vue";

type NavigateContext = {
  navManager: { handleNavigate: ReturnType<typeof vi.fn> } | null;
  $router: { push: ReturnType<typeof vi.fn> };
};

const navigate = (ctx: NavigateContext, to: unknown) =>
  (
    SideMenu as unknown as {
      methods: { navigate: (this: NavigateContext, to: unknown) => Promise<void> };
    }
  ).methods.navigate.call(ctx, to);

describe("side menu navigation", () => {
  it("pushes with direction none through the Ionic navigation manager", async () => {
    const ctx: NavigateContext = {
      navManager: { handleNavigate: vi.fn() },
      $router: { push: vi.fn() },
    };
    await navigate(ctx, "/tabs/substrates");
    expect(ctx.navManager!.handleNavigate).toHaveBeenCalledWith("/tabs/substrates", "push", "none");
    expect(ctx.$router.push).not.toHaveBeenCalled();
  });

  it("falls back to the router without an Ionic navigation manager", async () => {
    const ctx: NavigateContext = { navManager: null, $router: { push: vi.fn() } };
    await navigate(ctx, { name: "profile" });
    expect(ctx.$router.push).toHaveBeenCalledWith({ name: "profile" });
  });

  it("injects the navigation manager the tab bar uses", () => {
    const inject = (SideMenu as unknown as { inject: Record<string, { from: string }> }).inject;
    expect(inject.navManager.from).toBe("navManager");
  });
});
