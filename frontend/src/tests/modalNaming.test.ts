/** Every dialog exposes an accessible name and the sheet has no English drag handle button. */

import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { shallowMount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import WateringRecordModal from "@/components/plants/watering/WateringRecordModal.vue";
import SnapMatchSheet from "@/components/water/SnapMatchSheet.vue";
import ImageModal from "@/components/images/ImageModal.vue";
import PlantPickerModal from "@/components/water/PlantPickerModal.vue";
import SalesFilterModal from "@/components/sales/SalesFilterModal.vue";
import CalendarSettingsModal from "@/components/calendar/CalendarSettingsModal.vue";
import SubstrateFormModal from "@/components/substrates/SubstrateFormModal.vue";
import { defaultSalesQuery } from "@/utils/salesQuery";

const IonModalStub = defineComponent({
  inheritAttrs: true,
  props: { handle: { type: Boolean, default: undefined } },
  render() {
    return h("div", { "data-handle": String(this.handle) }, this.$slots.default?.());
  },
});

const mountModal = (component: object, props: Record<string, unknown>) =>
  shallowMount(component, {
    props: { isOpen: true, ...props },
    global: {
      stubs: { IonModal: IonModalStub },
      plugins: [createTestingPinia({ createSpy: vi.fn })],
      renderStubDefaultSlot: true,
    },
    attachTo: document.body,
  });

const dialogLabel = (wrapper: ReturnType<typeof mountModal>) =>
  wrapper.find("[data-handle]").attributes("aria-label");

describe("dialog accessible names", () => {
  it("binds the translated title as the base form modal aria-label", () => {
    const wrapper = mountModal(BaseFormModal, {
      isLoading: false,
      modalTitle: "plantadd.title",
      formTitle: "form",
      submitLabel: "save",
      formData: {},
      formFields: [],
    });
    expect(dialogLabel(wrapper)).toBe("plantadd.title");
  });

  it("binds the title as the watering record modal aria-label", () => {
    const add = mountModal(WateringRecordModal, { mode: "add", fertilizerOptions: [] });
    expect(dialogLabel(add)).toBe("plantdetail.modal_add_title");
    const edit = mountModal(WateringRecordModal, { mode: "edit", fertilizerOptions: [] });
    expect(dialogLabel(edit)).toBe("plantdetail.modal_edit_title");
  });

  it("binds the caption or a localized default as the image modal aria-label", () => {
    const captioned = mountModal(ImageModal, { imageUrl: "/a.png", label: "Monty, May" });
    expect(dialogLabel(captioned)).toBe("Monty, May");
    const plain = mountModal(ImageModal, { imageUrl: "/a.png" });
    expect(dialogLabel(plain)).toBe("a11y.image_dialog");
  });

  it("binds a title aria-label on the plant picker, sales filter, calendar settings and substrate dialogs", () => {
    expect(dialogLabel(mountModal(PlantPickerModal, {}))).toBe("water.picker_title");
    expect(dialogLabel(mountModal(SalesFilterModal, { query: defaultSalesQuery() }))).toBe(
      "sales.filter.title",
    );
    expect(dialogLabel(mountModal(CalendarSettingsModal, {}))).toBe("calendar.settings.title");
    expect(
      dialogLabel(
        mountModal(SubstrateFormModal, {
          title: "substrate.add",
          selectionTitle: "sel",
          availableComponents: [],
        }),
      ),
    ).toBe("substrate.add");
  });
});

describe("SnapMatchSheet dialog", () => {
  const sheet = (state: string, extra: Record<string, unknown> = {}) =>
    mountModal(SnapMatchSheet, {
      state,
      candidates: [{ plantId: 1, name: "Monty", tone: "ok" }],
      confident: true,
      loggedName: "Monty",
      ...extra,
    });

  it("binds one stable label in every state, because Ionic reads it only once", () => {
    const labels = [
      dialogLabel(sheet("matching")),
      dialogLabel(sheet("candidates")),
      dialogLabel(sheet("candidates", { confident: false, candidates: [] })),
      dialogLabel(sheet("logged")),
    ];
    expect(new Set(labels)).toEqual(new Set(["water.snap_dialog_label"]));
  });

  it("drops the built in English handle button for a decorative grabber", () => {
    const wrapper = sheet("candidates");
    expect(wrapper.find("[data-handle]").attributes("data-handle")).toBe("false");
    const grabber = wrapper.find(".grabber");
    expect(grabber.exists()).toBe(true);
    expect(grabber.attributes("aria-hidden")).toBe("true");
  });
});

describe("modal declarations", () => {
  const sources = import.meta.glob("../**/*.vue", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const allowed = ["ConfirmDialog.vue"];

  it("scans the whole component tree", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it("gives every ion-modal an aria-label", () => {
    const missing = Object.entries(sources)
      .filter(([file]) => !allowed.some((name) => file.endsWith(name)))
      .filter(([, source]) => /<(ion-modal|IonModal)\b/.test(source))
      .filter(([, source]) => {
        const tag = /<(ion-modal|IonModal)\b[^>]*>/s.exec(source)?.[0] ?? "";
        return !/aria-label/.test(tag);
      })
      .map(([file]) => file);
    expect(missing).toEqual([]);
  });
});
