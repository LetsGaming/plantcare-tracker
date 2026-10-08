/** Tests for the shared dialog and field pieces: mount-while-open, presentConfirm, delete wording. */

import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

import ConfirmDialog from "@/components/modal/ConfirmDialog.vue";
import FormComponent from "@/components/formcomponent/FormComponent.vue";

const passthrough = (tag = "div") =>
  defineComponent({
    inheritAttrs: true,
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
      onBlur: () => this.$emit("ionBlur"),
    });
  },
});

const IonButtonStub = defineComponent({
  props: { disabled: Boolean },
  render() {
    return h("button", { disabled: this.disabled }, this.$slots.default?.());
  },
});

const stubs = {
  IonModal: passthrough(),
  IonInput: IonInputStub,
  IonButton: IonButtonStub,
  IonSpinner: passthrough("i"),
  IonCard: passthrough(),
  IonCardHeader: passthrough(),
  IonCardContent: passthrough(),
  IonIcon: passthrough("i"),
};

describe("ConfirmDialog mounting", () => {
  it("renders nothing while closed and mounts when opened", async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { isOpen: false, title: "Sure?", confirmLabel: "Yes" },
      global: { stubs },
    });
    expect(wrapper.find(".confirm").exists()).toBe(false);
    await wrapper.setProps({ isOpen: true });
    expect(wrapper.find(".confirm").exists()).toBe(true);
  });

  it("labels the alertdialog with its title and names the typed field", () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        isOpen: true,
        title: "Delete account?",
        message: "All data goes.",
        confirmLabel: "Delete",
        requireText: "grower",
        requireLabel: "Type grower",
      },
      global: { stubs },
    });
    const dialog = wrapper.find("[role=alertdialog]");
    const titleId = dialog.attributes("aria-labelledby")!;
    expect(wrapper.find(`#${titleId}`).text()).toBe("Delete account?");
    expect(dialog.attributes("aria-describedby")).toBeTruthy();
    expect(wrapper.text()).toContain("Type grower");
  });

  it("explains a typed mismatch only after the field was left", async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { isOpen: true, title: "T", confirmLabel: "Go", requireText: "grower" },
      global: { stubs },
    });
    await wrapper.find("input").setValue("grow");
    expect(wrapper.find(".field-error").exists()).toBe(false);
    await wrapper.find("input").trigger("blur");
    expect(wrapper.find(".field-error").text()).toContain("grower");
  });
});

describe("FormComponent delete wording", () => {
  const open = async (props: Record<string, unknown>) => {
    const wrapper = mount(FormComponent, {
      props: {
        item: { name: "Monty" },
        formFields: [{ type: "input", modelKey: "name", label: "Name" }] as FormField[],
        onSubmitClick: vi.fn(),
        onDeleteClick: vi.fn(),
        ...props,
      },
      global: { stubs },
    });
    await wrapper.find("button[aria-label='Delete']").trigger("click");
    return wrapper;
  };

  it("names the item and states the consequence it was given", async () => {
    const wrapper = await open({ deleteConsequence: "All photos are lost." });
    expect(wrapper.find(".confirm-title").text()).toBe('Delete "Monty"?');
    expect(wrapper.find(".confirm-message").text()).toBe("All photos are lost.");
  });

  it("falls back to the plain irreversible warning", async () => {
    const wrapper = await open({});
    expect(wrapper.find(".confirm-message").text()).toBe("This cannot be undone.");
  });
});
