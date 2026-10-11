import { describe, it, expect } from "vitest";
import IconButton from "@/components/ui/IconButton.vue";

type Ctx = { $el: unknown; $attrs: Record<string, unknown> };
const sync = (IconButton as unknown as { methods: { syncNativeAria: (this: Ctx) => void } })
  .methods.syncNativeAria;

const native = () => document.createElement("button");
const host = (button: HTMLButtonElement | null) => ({
  shadowRoot: { querySelector: () => button },
});

describe("IconButton native aria-disabled", () => {
  it("copies aria-disabled to the inner button", () => {
    const button = native();
    sync.call({ $el: host(button), $attrs: { "aria-disabled": "true" } });
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("removes it again when the attribute goes away", () => {
    const button = native();
    button.setAttribute("aria-disabled", "true");
    sync.call({ $el: host(button), $attrs: {} });
    expect(button.hasAttribute("aria-disabled")).toBe(false);
  });

  it("does nothing before the inner button exists", () => {
    expect(() => sync.call({ $el: host(null), $attrs: { "aria-disabled": "true" } })).not.toThrow();
  });
});
