import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";

vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (key: string) => key },
}));

import SnapButton from "@/components/water/SnapButton.vue";

const pick = async (file: File) => {
  const wrapper = shallowMount(SnapButton);
  const input = wrapper.find("input[type=file]");
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  return { wrapper, input };
};

describe("SnapButton", () => {
  it("opens the camera input on the environment camera", () => {
    const wrapper = shallowMount(SnapButton);
    const input = wrapper.find("input[type=file]");
    expect(input.attributes("capture")).toBe("environment");
    expect(input.attributes("accept")).toBe("image/*");
  });

  it("emits a valid photo", async () => {
    const file = new File(["x"], "p.jpg", { type: "image/jpeg" });
    const { wrapper } = await pick(file);
    expect(wrapper.emitted("photo")).toEqual([[file]]);
  });

  it("rejects an unsupported type with a clear reason", async () => {
    const { wrapper } = await pick(new File(["x"], "p.heic", { type: "image/heic" }));
    expect(wrapper.emitted("invalid")).toEqual([["type"]]);
    expect(wrapper.emitted("photo")).toBeUndefined();
  });

  it("rejects an oversized photo", async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "p.jpg", { type: "image/jpeg" });
    const { wrapper } = await pick(big);
    expect(wrapper.emitted("invalid")).toEqual([["size"]]);
  });
});
