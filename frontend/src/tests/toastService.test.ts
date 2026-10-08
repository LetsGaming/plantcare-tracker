import { describe, it, expect, vi, beforeEach } from "vitest";

const created: Array<Record<string, any>> = [];
const dismissCallbacks: Array<() => void> = [];

vi.mock("@ionic/vue", () => ({
  toastController: {
    create: vi.fn(async (options: Record<string, any>) => {
      created.push(options);
      return {
        present: vi.fn(async () => undefined),
        onDidDismiss: () => new Promise<void>((resolve) => dismissCallbacks.push(resolve)),
      };
    }),
    dismiss: vi.fn(async () => undefined),
  },
}));
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

import ToastService, { toastDurationFor } from "@/services/general/ToastService";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  created.length = 0;
  dismissCallbacks.length = 0;
  await ToastService.dismissAllToasts();
});

describe("ToastService", () => {
  it("drops an identical message that is already showing or queued", async () => {
    ToastService.showSuccess("Saved");
    ToastService.showSuccess("Saved");
    await flush();
    ToastService.showSuccess("Saved");
    ToastService.showSuccess("Other");
    ToastService.showSuccess("Other");
    await flush();
    dismissCallbacks[0]();
    await flush();
    expect(created.map((c) => c.message)).toEqual(["Saved", "Other"]);
  });

  it("gives error toasts a close button and an optional retry action", async () => {
    const handler = vi.fn();
    ToastService.showError("Failed", undefined, undefined, undefined, { text: "Retry", handler });
    await flush();
    const buttons = created[0].buttons as Array<{ text: string; role?: string }>;
    expect(buttons.map((b) => b.text)).toEqual(["Retry", "Dismiss"]);
    expect(buttons[1].role).toBe("cancel");
  });

  it("scales the duration with the message length within bounds", () => {
    expect(toastDurationFor("ok")).toBe(3000);
    expect(toastDurationFor("x".repeat(60))).toBeGreaterThan(toastDurationFor("x".repeat(20)));
    expect(toastDurationFor("x".repeat(500))).toBe(9000);
    expect(toastDurationFor("x".repeat(40), true)).toBeGreaterThan(
      toastDurationFor("x".repeat(40)),
    );
  });
});
