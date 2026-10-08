import { describe, it, expect } from "vitest";
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
