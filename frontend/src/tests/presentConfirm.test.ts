import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";

vi.mock("@/components/modal/ConfirmDialog.vue", () => ({
  default: defineComponent({
    props: { isOpen: Boolean, title: { type: String, default: "" } },
    emits: ["confirm", "cancel", "closed"],
    render() {
      if (!this.isOpen) {
        queueMicrotask(() => this.$emit("closed"));
        return h("div", { class: "closed" });
      }
      return h("div", { class: "dialog" }, [
        h("h2", this.title),
        h("button", { class: "yes", onClick: () => this.$emit("confirm") }, "yes"),
        h("button", { class: "no", onClick: () => this.$emit("cancel") }, "no"),
      ]);
    },
  }),
}));

import { presentConfirm } from "@/utils/presentConfirm";

const click = async (selector: string) => {
  (document.body.querySelector(selector) as HTMLElement).click();
  await nextTick();
};

describe("presentConfirm", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("shows the dialog and resolves true on confirm, then removes its host", async () => {
    const result = presentConfirm({ title: "Log out?", confirmLabel: "Log out" });
    await nextTick();
    expect(document.body.querySelector(".dialog h2")?.textContent).toBe("Log out?");
    await click(".yes");
    await expect(result).resolves.toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.body.children).toHaveLength(0);
  });

  it("resolves false on cancel", async () => {
    const result = presentConfirm({ title: "Log out?", confirmLabel: "Log out" });
    await nextTick();
    await click(".no");
    await expect(result).resolves.toBe(false);
  });
});
