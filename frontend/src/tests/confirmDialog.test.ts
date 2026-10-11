import { describe, it, expect } from "vitest";
import { shallowMount } from "@vue/test-utils";
import ConfirmDialog from "@/components/modal/ConfirmDialog.vue";

type CanDismiss = (this: { loading: boolean }, data?: unknown, role?: string) => Promise<boolean>;
const canDismiss = (ConfirmDialog as unknown as { methods: { canDismiss: CanDismiss } }).methods
  .canDismiss;

describe("ConfirmDialog dismissal", () => {
  it("refuses the user's own gestures while loading", async () => {
    expect(await canDismiss.call({ loading: true }, undefined, "backdrop")).toBe(false);
    expect(await canDismiss.call({ loading: true }, undefined, "gesture")).toBe(false);
  });

  it("always lets code and parent modals close it", async () => {
    expect(await canDismiss.call({ loading: true })).toBe(true);
    expect(await canDismiss.call({ loading: true }, undefined, "parent-removed")).toBe(true);
    expect(await canDismiss.call({ loading: false }, undefined, "backdrop")).toBe(true);
  });
});

describe("ConfirmDialog accessible name", () => {
  it("names the modal after its title", () => {
    const wrapper = shallowMount(ConfirmDialog, {
      props: { isOpen: true, title: "Sign out?", confirmLabel: "Sign out" },
    });
    expect(wrapper.findComponent({ name: "IonModal" }).attributes("aria-label")).toBe("Sign out?");
  });
});
