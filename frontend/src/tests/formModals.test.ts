/** Component tests for the dialog and field pieces behind the form modals. */

import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

import ConfirmDialog from "@/components/modal/ConfirmDialog.vue";
import UploadField from "@/components/formcomponent/fields/UploadField.vue";
import ComponentSelection from "@/components/substrates/ComponentSelection.vue";

const passthrough = (tag = "div") =>
  defineComponent({
    inheritAttrs: true,
    render() {
      return h(tag, this.$slots.default?.());
    },
  });

const IonInputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: "" }, value: { type: [String, Number] } },
  emits: ["update:modelValue", "ionInput", "ionBlur"],
  render() {
    return h("input", {
      value: this.modelValue ?? this.value,
      onInput: (e: Event) => {
        const value = (e.target as HTMLInputElement).value;
        this.$emit("update:modelValue", value);
        this.$emit("ionInput", { detail: { value } });
      },
      onBlur: () => this.$emit("ionBlur"),
    });
  },
});

const IonButtonStub = defineComponent({
  props: { disabled: Boolean },
  emits: ["click"],
  render() {
    return h(
      "button",
      { disabled: this.disabled, onClick: () => this.$emit("click") },
      this.$slots.default?.(),
    );
  },
});

const stubs = {
  IonModal: passthrough(),
  IonItem: passthrough(),
  IonInput: IonInputStub,
  IonButton: IonButtonStub,
  IonSpinner: passthrough("i"),
  IonCheckbox: passthrough("label"),
  IonIcon: passthrough("i"),
  SearchBar: passthrough(),
};

describe("ConfirmDialog", () => {
  const mountDialog = (props: Record<string, unknown> = {}) =>
    mount(ConfirmDialog, {
      props: {
        isOpen: true,
        title: "Delete account?",
        confirmLabel: "Delete account",
        danger: true,
        ...props,
      },
      global: { stubs },
    });

  const confirmButton = (wrapper: ReturnType<typeof mountDialog>) =>
    wrapper.findAll("button").find((b) => b.text() === "Delete account")!;

  it("emits confirm and cancel from its buttons", async () => {
    const wrapper = mountDialog();
    await confirmButton(wrapper).trigger("click");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "Cancel")!
      .trigger("click");
    expect(wrapper.emitted("confirm")).toHaveLength(1);
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  it("keeps the confirm button disabled until the required text is typed", async () => {
    const wrapper = mountDialog({ requireText: "grower", requireLabel: "Type grower" });
    expect(confirmButton(wrapper).attributes("disabled")).toBeDefined();
    await wrapper.find("input").setValue("Grow");
    expect(confirmButton(wrapper).attributes("disabled")).toBeDefined();
    await wrapper.find("input").setValue("Grower");
    expect(confirmButton(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("ignores confirm and cancel while a request is running", async () => {
    const wrapper = mountDialog({ loading: true });
    await wrapper.findAll("button").forEach((b) => b.trigger("click"));
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.emitted("cancel")).toBeUndefined();
  });
});

describe("UploadField", () => {
  const field: UploadField = { type: "file", modelKey: "image", label: "Image", required: true };

  it("rejects a non-image file with an inline message and emits nothing usable", async () => {
    const wrapper = mount(UploadField, { props: { field }, global: { stubs } });
    const input = wrapper.find("input[type=file]");
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(input.element, "files", { value: [file], configurable: true });
    await input.trigger("change");
    expect(wrapper.find(".field-error").text()).toBe("Please choose a JPEG or PNG image.");
    expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([undefined]);
  });

  it("accepts a valid image", async () => {
    const wrapper = mount(UploadField, { props: { field }, global: { stubs } });
    const input = wrapper.find("input[type=file]");
    const file = new File(["x"], "fern.png", { type: "image/png" });
    Object.defineProperty(input.element, "files", { value: [file], configurable: true });
    await input.trigger("change");
    expect(wrapper.find(".field-error").exists()).toBe(false);
    expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([file]);
  });
});

describe("ComponentSelection", () => {
  const components = [
    { id: 1, name: "Perlite", fineness: "coarse" },
    { id: 2, name: "Peat", fineness: "fine" },
  ] as unknown as SubstrateComponent[];

  it("never coerces a missing amount: it shows an error for a selected component", async () => {
    const wrapper = mount(ComponentSelection, {
      props: {
        title: "Select",
        components,
        selectedComponentIds: [1],
        componentParts: {},
        showErrors: true,
      },
      global: { stubs },
    });
    expect(wrapper.findAll(".part-error")).toHaveLength(1);
  });

  it("shows no error for a valid amount or an unselected component", () => {
    const wrapper = mount(ComponentSelection, {
      props: {
        title: "Select",
        components,
        selectedComponentIds: [1],
        componentParts: { 1: "2,5" },
        showErrors: true,
      },
      global: { stubs },
    });
    expect(wrapper.findAll(".part-error")).toHaveLength(0);
  });

  it("reports typed amounts upward", async () => {
    const wrapper = mount(ComponentSelection, {
      props: { title: "Select", components, selectedComponentIds: [1], componentParts: {} },
      global: { stubs },
    });
    await wrapper.find("input").setValue("3");
    expect(wrapper.emitted("update-part")![0]).toEqual([1, "3"]);
  });
});
