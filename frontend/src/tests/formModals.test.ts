/** Component tests for the dialog and field pieces behind the form modals. */

import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

const resize = vi.hoisted(() => ({ downscaleImage: vi.fn(async (file: File) => file) }));
vi.mock("@/utils/imageResize", async (original) => ({
  ...(await original<typeof import("@/utils/imageResize")>()),
  downscaleImage: resize.downscaleImage,
}));
vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

import ConfirmDialog from "@/components/modal/ConfirmDialog.vue";
import UploadField from "@/components/formcomponent/fields/UploadField.vue";
import ComponentSelection from "@/components/substrates/ComponentSelection.vue";
import SubstrateFormModal from "@/components/substrates/SubstrateFormModal.vue";

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
    await flushPromises();
    expect(wrapper.find(".field-error").exists()).toBe(false);
    expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([file]);
  });

  const pick = async (wrapper: ReturnType<typeof mount>, file: File) => {
    const input = wrapper.find("input[type=file]");
    Object.defineProperty(input.element, "files", { value: [file], configurable: true });
    await input.trigger("change");
    await flushPromises();
  };

  it("downscales to the upload width and emits the resized file", async () => {
    const resized = new File(["y"], "fern.webp", { type: "image/webp" });
    resize.downscaleImage.mockResolvedValueOnce(resized);
    const wrapper = mount(UploadField, { props: { field }, global: { stubs } });
    const original = new File(["x"], "fern.png", { type: "image/png" });
    await pick(wrapper, original);
    expect(resize.downscaleImage).toHaveBeenCalledWith(original, 1600);
    expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([resized]);
  });

  it("drops a result that arrives after the file was removed", async () => {
    let finish: (file: File) => void = () => {};
    resize.downscaleImage.mockReturnValueOnce(new Promise<File>((resolve) => (finish = resolve)));
    const wrapper = mount(UploadField, { props: { field }, global: { stubs } });
    const original = new File(["x"], "fern.png", { type: "image/png" });
    const input = wrapper.find("input[type=file]");
    Object.defineProperty(input.element, "files", { value: [original], configurable: true });
    await input.trigger("change");
    (wrapper.vm as unknown as { clearFile: () => void }).clearFile();
    finish(original);
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([undefined]);
  });

  it("previews the given file and revokes the object URL on replace and unmount", async () => {
    const urls = ["blob:one", "blob:two"];
    const create = vi.fn(() => urls.shift()!);
    const revoke = vi.fn();
    const saved = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    const first = new File(["a"], "a.webp", { type: "image/webp" });
    const second = new File(["b"], "b.webp", { type: "image/webp" });
    const wrapper = mount(UploadField, {
      props: { field, modelValue: first },
      global: { stubs },
    });
    expect(wrapper.find("img").attributes("src")).toBe("blob:one");
    await wrapper.setProps({ modelValue: second });
    expect(revoke).toHaveBeenCalledWith("blob:one");
    expect(wrapper.find("img").attributes("src")).toBe("blob:two");
    wrapper.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:two");
    URL.createObjectURL = saved.create;
    URL.revokeObjectURL = saved.revoke;
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

describe("SubstrateFormModal", () => {
  const substrate = {
    id: 7,
    name: "Aroid Mix",
    isPublic: false,
    components: [
      { id: 1, name: "Perlite", fineness: "coarse", parts: 1 },
      { id: 2, name: "Peat", fineness: "fine", parts: 2 },
      { id: 3, name: "Bark", fineness: "coarse", parts: 3 },
    ],
  } as unknown as Substrate;

  it("saves the full remaining selection with parts after a component is unticked", async () => {
    const wrapper = mount(SubstrateFormModal, {
      props: {
        isOpen: true,
        title: "Edit",
        selectionTitle: "Select",
        availableComponents: substrate.components,
        substrate,
      },
      global: {
        stubs: {
          ...stubs,
          IonContent: passthrough(),
          IonFooter: passthrough(),
          ModalHeader: true,
          ConfirmDialog: true,
          FormComponent: true,
          ComponentSelection: true,
        },
      },
    });
    const vm = wrapper.vm as unknown as { toggleComponent(id: number): void; submit(): void };
    vm.toggleComponent(2);
    vm.submit();

    expect(wrapper.emitted("save")).toHaveLength(1);
    expect(wrapper.emitted("save")![0][0]).toMatchObject({
      componentIds: [1, 3],
      parts: { 1: 1, 3: 3 },
    });
  });
});
