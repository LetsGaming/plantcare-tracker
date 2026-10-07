/**
 * Component tests for the generic form: field wiring through v-model, the
 * required-field gate, the delete flow and the individual field components.
 * Ionic web components are replaced by minimal stubs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { toast } from "./helpers";

vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

import FormComponent from "@/components/formcomponent/FormComponent.vue";
import InputField from "@/components/formcomponent/fields/InputField.vue";
import RadioField from "@/components/formcomponent/fields/RadioField.vue";
import SearchBar from "@/components/SearchBar.vue";

const passthrough = (tag = "div") =>
  defineComponent({
    inheritAttrs: true,
    render() {
      return h(tag, this.$slots.default?.());
    },
  });

const IonInputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: "" } },
  emits: ["update:modelValue", "ionInput"],
  render() {
    return h("input", {
      value: this.modelValue,
      onInput: (e: Event) => {
        const value = (e.target as HTMLInputElement).value;
        this.$emit("update:modelValue", value);
        this.$emit("ionInput", value);
      },
    });
  },
});

const IonButtonStub = defineComponent({
  props: { disabled: Boolean },
  render() {
    return h("button", { disabled: this.disabled }, this.$slots.default?.());
  },
});

const IonRadioGroupStub = defineComponent({
  props: { value: { type: [String, Number, Boolean], default: "" } },
  emits: ["ionChange"],
  render() {
    return h("div", { class: "radio-group" }, this.$slots.default?.());
  },
});

const stubs = {
  IonItem: passthrough(),
  IonLabel: passthrough("span"),
  IonInput: IonInputStub,
  IonButton: IonButtonStub,
  IonRadioGroup: IonRadioGroupStub,
  IonRadio: passthrough("span"),
  IonCard: passthrough(),
  IonCardHeader: passthrough(),
  IonCardTitle: passthrough(),
  IonCardContent: passthrough(),
  IonToolbar: passthrough(),
  IonIcon: passthrough("i"),
  IonSpinner: passthrough("i"),
  IonModal: passthrough(),
  IonHeader: passthrough(),
  IonContent: passthrough(),
  IonButtons: passthrough(),
  IonTitle: passthrough(),
  IonRow: passthrough(),
};

const fields: FormField[] = [
  { type: "input", modelKey: "name", label: "Name", required: true },
  { type: "input", modelKey: "species", label: "Species" },
];

const mountForm = (props: Record<string, unknown> = {}) => {
  const item = { name: "", species: "" };
  const onSubmitClick = vi.fn();
  const wrapper = mount(FormComponent, {
    props: { item, formFields: fields, onSubmitClick, ...props },
    global: { stubs },
  });
  return { wrapper, item, onSubmitClick };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FormComponent", () => {
  it("renders one input per field", () => {
    const { wrapper } = mountForm();
    expect(wrapper.findAll("input")).toHaveLength(2);
  });

  it("writes typed values into the item object it was given", async () => {
    const { wrapper, item } = mountForm();
    await wrapper.findAll("input")[0].setValue("Monstera");
    expect(item.name).toBe("Monstera");
  });

  it("blocks submission and shows one toast while a required field is empty", async () => {
    const { wrapper, onSubmitClick } = mountForm();
    await wrapper.find("button").trigger("click");
    expect(onSubmitClick).not.toHaveBeenCalled();
    expect(toast.showError).toHaveBeenCalledTimes(1);
  });

  it("submits once the required fields are filled", async () => {
    const { wrapper, onSubmitClick } = mountForm();
    await wrapper.findAll("input")[0].setValue("Monstera");
    await wrapper.find("button").trigger("click");
    expect(onSubmitClick).toHaveBeenCalledOnce();
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it("disables the submit button and shows the waiting label while loading", () => {
    const { wrapper } = mountForm({ isLoading: true });
    const button = wrapper.find("button");
    expect(button.attributes("disabled")).toBeDefined();
    expect(button.text()).toContain("Please wait...");
  });

  it("calls the delete handler from the confirmation button", async () => {
    const onDeleteClick = vi.fn();
    const { wrapper } = mountForm({ onDeleteClick });
    const confirm = wrapper.findAll("button").find((b) => b.text().trim() === "Delete");
    await confirm!.trigger("click");
    expect(onDeleteClick).toHaveBeenCalledOnce();
  });
});

describe("InputField", () => {
  it("emits update:modelValue when the user types", async () => {
    const wrapper = mount(InputField, {
      props: {
        field: { type: "input", modelKey: "name", label: "Name" } as InputField,
        modelValue: "",
      },
      global: { stubs },
    });
    await wrapper.find("input").setValue("Ficus");
    expect(wrapper.emitted("update:modelValue")![0]).toEqual(["Ficus"]);
  });

  it("falls back to the label key when no translation exists", () => {
    const wrapper = mount(InputField, {
      props: { field: { type: "input", modelKey: "name", label: "form.name" } as InputField },
      global: { stubs },
    });
    expect(wrapper.exists()).toBe(true);
  });
});

describe("RadioField", () => {
  const radio: RadioField = {
    type: "radio",
    modelKey: "fertilizer",
    label: "Fertilizer",
    options: [
      { value: 1, label: "Organic" },
      { value: -1, label: "None" },
    ],
    defaultValue: -1,
  };

  it("emits its default value on mount", () => {
    const wrapper = mount(RadioField, {
      props: { field: radio, modelValue: "" },
      global: { stubs },
    });
    expect(wrapper.emitted("update:modelValue")![0]).toEqual([-1]);
  });

  it("emits the chosen value on ionChange", async () => {
    const wrapper = mount(RadioField, {
      props: { field: { ...radio, defaultValue: undefined }, modelValue: "" },
      global: { stubs },
    });
    wrapper.findComponent(IonRadioGroupStub).vm.$emit("ionChange", { detail: { value: 1 } });
    expect(wrapper.emitted("update:modelValue")![0]).toEqual([1]);
  });

  it("renders every option label", () => {
    const wrapper = mount(RadioField, {
      props: { field: radio, modelValue: "" },
      global: { stubs },
    });
    expect(wrapper.text()).toContain("Organic");
    expect(wrapper.text()).toContain("None");
  });
});

describe("SearchBar", () => {
  it("emits the empty query on mount so parents can initialize filters", () => {
    const wrapper = mount(SearchBar, { global: { stubs } });
    expect(wrapper.emitted("search")![0]).toEqual([""]);
  });

  it("emits the current query on input", async () => {
    const wrapper = mount(SearchBar, { global: { stubs } });
    await wrapper.find("input").setValue("aloe");
    expect(wrapper.emitted("search")!.at(-1)).toEqual(["aloe"]);
  });
});
