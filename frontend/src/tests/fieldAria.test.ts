import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, shallowMount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/services/general/ToastService", () => ({
  default: { showSuccess: vi.fn(), showError: vi.fn(), showToastWithAction: vi.fn() },
}));
vi.mock("@/services/general/LocalizationService", () => ({
  default: {
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key} ${JSON.stringify(vars)}` : key,
    getLocale: () => "en",
  },
}));
vi.mock("@/utils/apiUtils", () => ({
  default: { get: vi.fn(), post: vi.fn(), isApiError: () => false },
}));
vi.mock("@/services/RecognitionService", () => ({
  default: { status: vi.fn().mockResolvedValue(true) },
}));

import { syncNativeInvalid } from "@/components/formcomponent/fieldShared";
import InputField from "@/components/formcomponent/fields/InputField.vue";
import Login from "@/views/Login.vue";
import WaterRound from "@/views/water/WaterRound.vue";
import { usePlantsStore } from "@/stores/plants";
import { useWateringStore } from "@/stores/watering";

describe("syncNativeInvalid", () => {
  it("sets aria-invalid on the native input when invalid", async () => {
    const native = document.createElement("input");
    await syncNativeInvalid({ getInputElement: () => Promise.resolve(native) }, true);
    expect(native.getAttribute("aria-invalid")).toBe("true");
  });

  it("removes aria-invalid again when valid", async () => {
    const native = document.createElement("input");
    native.setAttribute("aria-invalid", "true");
    await syncNativeInvalid({ getInputElement: () => Promise.resolve(native) }, false);
    expect(native.hasAttribute("aria-invalid")).toBe(false);
  });

  it("never throws for a missing host, a host without the method or a rejecting host", async () => {
    await expect(syncNativeInvalid(null, true)).resolves.toBeUndefined();
    await expect(syncNativeInvalid({}, true)).resolves.toBeUndefined();
    await expect(
      syncNativeInvalid({ getInputElement: () => Promise.reject(new Error("gone")) }, true),
    ).resolves.toBeUndefined();
  });
});

describe("InputField native aria-invalid", () => {
  it("mirrors the error state onto the native input and clears it", async () => {
    const native = document.createElement("input");
    const IonInputStub = defineComponent({
      props: { modelValue: { type: [String, Number], default: "" } },
      methods: { getInputElement: () => Promise.resolve(native) },
      render() {
        return h("div");
      },
    });
    const wrapper = mount(InputField, {
      props: {
        field: { type: "input", modelKey: "name", label: "Name" } as InputField,
        modelValue: "",
        error: "",
      },
      global: { stubs: { IonInput: IonInputStub } },
    });
    await flushPromises();
    expect(native.hasAttribute("aria-invalid")).toBe(false);

    await wrapper.setProps({ error: "x" });
    await flushPromises();
    expect(native.getAttribute("aria-invalid")).toBe("true");

    await wrapper.setProps({ error: "" });
    await flushPromises();
    expect(native.hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("Login", () => {
  const IonInputStub = defineComponent({
    props: { modelValue: { type: [String, Number], default: "" } },
    emits: ["update:modelValue"],
    render() {
      return h("input", {
        value: this.modelValue,
        onInput: (e: Event) =>
          this.$emit("update:modelValue", (e.target as HTMLInputElement).value),
      });
    },
  });
  const passthrough = (tag = "div") =>
    defineComponent({
      render() {
        return h(tag, this.$slots.default?.());
      },
    });
  const replace = vi.fn();
  let focusSpy: ReturnType<typeof vi.spyOn>;

  const mountLogin = async () => {
    const wrapper = mount(Login, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        mocks: { $route: { query: {} }, $router: { replace } },
        stubs: {
          IonPage: passthrough(),
          IonContent: passthrough(),
          IonSpinner: passthrough("span"),
          IonButton: passthrough("button"),
          IonInput: IonInputStub,
          PlantPlaceholder: true,
        },
      },
    });
    await flushPromises();
    return wrapper;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
  });
  afterEach(() => focusSpy.mockRestore());

  it("moves focus to the username input first when an empty form is submitted", async () => {
    const wrapper = await mountLogin();
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(focusSpy).toHaveBeenCalled();
    const first = focusSpy.mock.contexts[0] as HTMLElement;
    expect(first.getAttribute("autocomplete")).toBe("username");
  });

  it("focuses the password input when only the password is missing", async () => {
    const wrapper = await mountLogin();
    await wrapper.findAll("input")[0].setValue("alice");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    const first = focusSpy.mock.contexts[0] as HTMLElement;
    expect(first.getAttribute("autocomplete")).toBe("current-password");
  });

  it("does not move focus when the form is valid", async () => {
    const wrapper = await mountLogin();
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("alice");
    await inputs[1].setValue("secret");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("does not render a nested main landmark", () => {
    const source = readFileSync(resolve(__dirname, "../views/Login.vue"), "utf8");
    expect(source).not.toContain("<main");
    expect(source).toContain('class="login-shell"');
  });
});

describe("WaterRound round fertilizer segment", () => {
  it("is named by its visible label", async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const plants = usePlantsStore(pinia) as unknown as Record<string, unknown>;
    plants.personalPlants = [{ id: 1, name: "Fine", images: [] }];
    const watering = useWateringStore(pinia);
    watering.byPlantId = { 1: [{ date_millis: Date.now() } as WateringRecord] };
    watering.fertilizerTypes = [{ id: 4, name: "Bloom" } as FertilizerType];
    const wrapper = shallowMount(WaterRound, {
      global: {
        plugins: [pinia],
        renderStubDefaultSlot: true,
        mocks: { $router: { push: vi.fn() } },
      },
    });
    await flushPromises();
    const label = wrapper.find(".round-fertilizer .label");
    const segment = wrapper.findComponent({ name: "IonSegment" });
    expect(label.attributes("id")).toBeTruthy();
    expect(segment.attributes("aria-labelledby")).toBe(label.attributes("id"));
  });
});
