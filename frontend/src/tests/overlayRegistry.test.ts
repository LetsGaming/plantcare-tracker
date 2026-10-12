import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@ionic/vue", () => ({
  modalController: {
    getTop: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn().mockResolvedValue(true),
  },
}));

import { modalController } from "@ionic/vue";
import Utils from "@/utils/utils";
import { openOverlayCount, resetOverlayRegistry } from "@/utils/overlayRegistry";

const present = (): HTMLElement => {
  const host = document.createElement("ion-modal");
  document.body.appendChild(host);
  host.dispatchEvent(new CustomEvent("ionModalDidPresent", { bubbles: true }));
  return host;
};

afterEach(() => {
  resetOverlayRegistry();
  document.body.innerHTML = "";
  vi.mocked(modalController.getTop).mockClear();
  vi.mocked(modalController.dismiss).mockClear();
});

describe("overlay registry", () => {
  it("counts presented modals and forgets dismissed ones", () => {
    const first = present();
    present();
    expect(openOverlayCount()).toBe(2);
    first.dispatchEvent(new CustomEvent("ionModalDidDismiss", { bubbles: true }));
    expect(openOverlayCount()).toBe(1);
  });

  it("ignores a modal host removed without a dismiss event", () => {
    present().remove();
    expect(openOverlayCount()).toBe(0);
  });

  it("does not query the modal controller while nothing is open", async () => {
    await Utils.closeAllOpenModals();
    expect(modalController.getTop).not.toHaveBeenCalled();
    expect(modalController.dismiss).not.toHaveBeenCalled();
  });

  it("queries the modal controller once a modal is open", async () => {
    present();
    await Utils.closeAllOpenModals();
    expect(modalController.getTop).toHaveBeenCalled();
  });
});
