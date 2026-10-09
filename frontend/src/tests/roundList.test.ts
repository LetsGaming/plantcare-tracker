import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";

vi.mock("@/services/general/LocalizationService", () => ({
  default: {
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key} ${JSON.stringify(vars)}` : key,
    getLocale: () => "en",
  },
}));

import RoundList from "@/components/water/RoundList.vue";

describe("RoundList", () => {
  it("names the fertilizer options in the app language", () => {
    const wrapper = shallowMount(RoundList, {
      props: {
        rows: [
          {
            plantId: 1,
            name: "Monty",
            checked: false,
            tone: "ok",
            rank: 0,
            fertilizerTypeId: undefined,
          },
        ],
        fertilizerTypes: [
          { id: 1, name: "organic" },
          { id: 2, name: "synthetic" },
        ],
      },
      global: { renderStubDefaultSlot: true },
    });
    const options = wrapper.findAll("ion-select-option-stub").map((o) => o.text());
    expect(options).toContain("copy2.fertilizer.organic");
    expect(options).toContain("copy2.fertilizer.synthetic");
  });
});
