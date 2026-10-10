/**
 * Adding a plant needs only a name: species and substrate are optional, the
 * substrate picker offers an explicit "not set" choice and a way to create a
 * substrate, and a plant without species shows a localized label wherever
 * the species is printed. Texts come from the real German locale.
 */

import { describe, it, expect, vi } from "vitest";
import { mount, shallowMount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

vi.mock("@/stores/session", () => ({
  useSessionStore: () => ({ isGuest: false, userId: 1 }),
}));

vi.mock("@/services/general/ToastService", () => ({
  default: {
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showWarning: vi.fn(),
    showToastWithAction: vi.fn(),
  },
}));

vi.mock("@/services/general/LocalizationService", async () => {
  const de = (await import("@/locales/de")).default as Record<string, string>;
  return {
    default: {
      t: (key: string, _vars?: unknown, fallback?: string) => de[key] ?? fallback ?? key,
      getLocale: () => "de",
      locale: { value: "de" },
    },
  };
});

import ToastService from "@/services/general/ToastService";
import PlantAddingModal from "@/components/plants/PlantAddingModal.vue";
import PlantEditingModal from "@/components/plants/PlantEditingModal.vue";
import PlantTag from "@/components/plants/PlantTag.vue";
import FormComponent from "@/components/formcomponent/FormComponent.vue";
import PlantOverview from "@/views/plants/PlantOverview.vue";
import { usePlantsStore } from "@/stores/plants";

const substrates = [{ id: 5, name: "Aroid Mix" }] as Substrate[];

const fieldFor = (fields: FormField[], key: string) => fields.find((f) => f.modelKey === key)!;

describe("PlantAddingModal", () => {
  const mountModal = () => {
    const push = vi.fn();
    const wrapper = shallowMount(PlantAddingModal, {
      props: { isOpen: true, substrates },
      global: { mocks: { $router: { push } } },
    });
    return { wrapper, push };
  };

  it("requires only the name", () => {
    const { wrapper } = mountModal();
    const fields = (wrapper.vm as any).plantFormFields as FormField[];
    expect(fieldFor(fields, "name").required).toBe(true);
    expect(fieldFor(fields, "species").required).toBeFalsy();
    expect(fieldFor(fields, "substrateId").required).toBeFalsy();
  });

  it("starts without a substrate and offers an explicit not-set choice first", () => {
    const { wrapper } = mountModal();
    expect((wrapper.vm as any).plant.substrateId).toBeNull();
    const select = fieldFor((wrapper.vm as any).plantFormFields, "substrateId") as SelectField;
    expect(select.options[0]).toEqual({ value: null, label: "plant.field.substrate_none" });
    expect(select.options.slice(1)).toEqual([{ value: 5, label: "Aroid Mix" }]);
  });

  it("submits a name-only plant without a validation error", async () => {
    const wrapper = mount(FormComponent, {
      props: {
        item: { name: "Erste Pflanze", species: "", substrateId: null },
        formFields: (
          shallowMount(PlantAddingModal, { props: { isOpen: true, substrates } }).vm as any
        ).plantFormFields,
        onSubmitClick: vi.fn(),
      },
      global: { stubs: { UploadField: true, RadioField: true } },
    });
    await wrapper.find("form").trigger("submit");
    expect(wrapper.props("onSubmitClick")).toHaveBeenCalledTimes(1);
  });

  it("closes and opens the substrates tab to create a substrate", () => {
    const { wrapper, push } = mountModal();
    (wrapper.vm as any).openNewSubstrate();
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(push).toHaveBeenCalledWith("/tabs/substrates");
  });

  it("labels the new substrate button and the none option in German", () => {
    const { wrapper } = mountModal();
    expect((wrapper.vm as any).t("plant.add.new_substrate")).toBe("Neues Substrat anlegen");
    expect((wrapper.vm as any).t("plant.field.substrate_none")).toBe("Nicht festgelegt");
  });
});

describe("FormComponent after-field slot", () => {
  it("renders content right after the named field", () => {
    const wrapper = mount(FormComponent, {
      props: {
        item: { a: "", b: "" },
        formFields: [
          { type: "input", modelKey: "a", label: "A" },
          { type: "input", modelKey: "b", label: "B" },
        ] as FormField[],
        onSubmitClick: vi.fn(),
      },
      slots: {
        "after-field": `<template #after-field="{ modelKey }"><i v-if="modelKey === 'a'" class="extra">x</i></template>`,
      },
    });
    const host = wrapper.find('[data-field="a"]');
    expect(host.find(".extra").exists()).toBe(true);
    expect(wrapper.find('[data-field="b"] .extra').exists()).toBe(false);
  });
});

describe("PlantEditingModal", () => {
  const plant = {
    id: 1,
    userId: 1,
    name: "Monty",
    species: null,
    description: "",
    isPublic: false,
    created_at: "",
    substrate: null,
    images: [],
  } as unknown as Plant;

  it("lets species and substrate be cleared", () => {
    const wrapper = shallowMount(PlantEditingModal, {
      props: { isOpen: true, plant, substrates },
    });
    const fields = (wrapper.vm as any).formFields as FormField[];
    expect(fieldFor(fields, "species").required).toBeFalsy();
    const select = fieldFor(fields, "substrateId") as SelectField;
    expect(select.required).toBeFalsy();
    expect(select.options[0]).toEqual({ value: null, label: "plant.field.substrate_none" });
    expect((wrapper.vm as any).editPlantData).toMatchObject({ species: "", substrateId: null });
  });
});

describe("species fallback", () => {
  it("PlantTag shows the localized unknown species label", () => {
    const wrapper = mount(PlantTag, {
      props: { name: "Monty", species: null },
      global: { stubs: { IonIcon: true } },
    });
    expect(wrapper.find(".tag-species").text()).toBe("Unbekannte Art");
  });

  it("PlantTag shows a real species unchanged", () => {
    const wrapper = mount(PlantTag, {
      props: { name: "Monty", species: "Monstera deliciosa" },
      global: { stubs: { IonIcon: true } },
    });
    expect(wrapper.find(".tag-species").text()).toBe("Monstera deliciosa");
  });

  it("the overview labels a plant without species in both segments", async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const wrapper = shallowMount(PlantOverview, { global: { plugins: [pinia] } });
    const store = usePlantsStore(pinia);
    store.items = [
      { id: 1, userId: 1, name: "Bare", species: null, description: "", isPublic: true },
      { id: 2, userId: 1, name: "Named", species: "Ficus", description: "Ficus", isPublic: true },
    ] as unknown as Plant[];
    await flushPromises();
    const descriptions = () =>
      (wrapper.vm as any).overviewItems.map((item: { description?: string }) => item.description);
    expect(descriptions()).toEqual(["Unbekannte Art", "Ficus"]);
    (wrapper.vm as any).handleSegmentChange("public");
    await flushPromises();
    expect(descriptions()).toEqual(["Unbekannte Art", "Ficus"]);
    wrapper.unmount();
  });
});

describe("PlantOverview.addPlant", () => {
  it("adds a plant that has only a name", async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const wrapper = shallowMount(PlantOverview, { global: { plugins: [pinia] } });
    const store = usePlantsStore(pinia);
    vi.mocked(store.addPlant).mockResolvedValue({ id: 9, name: "Solo" } as Plant);
    await (wrapper.vm as any).addPlant({ name: "Solo", substrateId: null });
    expect(store.addPlant).toHaveBeenCalledWith({ name: "Solo", substrateId: null });
    expect(ToastService.showError).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("still refuses a blank name", async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const wrapper = shallowMount(PlantOverview, { global: { plugins: [pinia] } });
    const store = usePlantsStore(pinia);
    await (wrapper.vm as any).addPlant({ name: "  ", substrateId: null });
    expect(store.addPlant).not.toHaveBeenCalled();
    expect(ToastService.showError).toHaveBeenCalled();
    wrapper.unmount();
  });
});
