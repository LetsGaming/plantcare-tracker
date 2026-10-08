/** Disabled danger confirm, date and relative time formatting. */

import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

import ConfirmDialog from "@/components/modal/ConfirmDialog.vue";
import { formatDisplayDate, formatLongDate } from "@/utils/localDate";
import { relativePhrase } from "@/utils/relativeTime";

const passthrough = (tag = "div") =>
  defineComponent({
    render() {
      return h(tag, this.$slots.default?.());
    },
  });

const IonInputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: "" } },
  emits: ["update:modelValue", "ionBlur"],
  render() {
    return h("input", {
      value: this.modelValue,
      onInput: (e: Event) => this.$emit("update:modelValue", (e.target as HTMLInputElement).value),
    });
  },
});

const IonButtonStub = defineComponent({
  props: { disabled: Boolean, color: { type: String, default: "" } },
  render() {
    return h(
      "button",
      { disabled: this.disabled, "data-color": this.color },
      this.$slots.default?.(),
    );
  },
});

const stubs = {
  IonModal: passthrough(),
  IonInput: IonInputStub,
  IonButton: IonButtonStub,
  IonSpinner: passthrough("i"),
};

const mountDanger = () =>
  mount(ConfirmDialog, {
    props: {
      isOpen: true,
      title: "Delete account?",
      confirmLabel: "Delete account",
      danger: true,
      requireText: "grower",
    },
    global: { stubs },
  });

const confirmButton = (wrapper: ReturnType<typeof mountDanger>) =>
  wrapper.findAll("button").find((button) => button.text() === "Delete account")!;

describe("disabled danger confirm button", () => {
  it("is disabled while the field is empty or does not match", async () => {
    const wrapper = mountDanger();
    expect(confirmButton(wrapper).attributes("disabled")).toBeDefined();
    await wrapper.find("input").setValue("grow");
    expect(confirmButton(wrapper).attributes("disabled")).toBeDefined();
  });

  it("is enabled and stays the danger color once the text matches", async () => {
    const wrapper = mountDanger();
    await wrapper.find("input").setValue("Grower");
    const button = confirmButton(wrapper);
    expect(button.attributes("disabled")).toBeUndefined();
    expect(button.attributes("data-color")).toBe("danger");
  });
});

describe("date formatting", () => {
  it("pads day and month in the given locale", () => {
    const millis = new Date(2026, 8, 4, 12).getTime();
    expect(formatDisplayDate(millis, "de-DE")).toBe("04.09.2026");
    expect(formatDisplayDate(millis, "en-GB")).toBe("04/09/2026");
  });

  it("formats a day key the same way as the timestamp of that day", () => {
    expect(formatDisplayDate("2026-10-08", "de-DE")).toBe("08.10.2026");
  });

  it("falls back to the input for something that is not a date", () => {
    expect(formatDisplayDate("nope", "de-DE")).toBe("nope");
  });

  it("spells the long form out", () => {
    expect(formatLongDate("2026-09-04", "de-DE")).toBe("4. September 2026");
  });
});

describe("relativePhrase", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");

  it("is null under ten seconds", () => {
    expect(relativePhrase("2026-10-08T11:59:55Z", "de", now)).toBeNull();
    expect(relativePhrase("2026-10-08T12:00:00Z", "en", now)).toBeNull();
  });

  it("is a phrase from ten seconds on", () => {
    expect(relativePhrase("2026-10-08T11:59:30Z", "en", now)).toBe("30 seconds ago");
    expect(relativePhrase("2026-10-08T11:00:00Z", "de", now)).toBe("vor 1 Stunde");
  });
});
