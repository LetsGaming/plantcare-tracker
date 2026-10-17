/**
 * The searchable substrate picker of the plant forms: lists load when the
 * picker opens (not with the form), the owner's list is filtered on the client,
 * the public list is searched on the server once per typing pause, and the
 * chosen substrate leaves as an id (or null for "not set").
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import {
  apiSubstrateDetail,
  apiSubstrateListItem,
  createInstalledPinia,
  envelope,
  fakeJwt,
  resetStore,
} from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);
vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  isApiError: () => false,
  configureAuth: vi.fn(),
}));
vi.mock("@/utils/apiUtils", () => ({ default: api }));

import SubstratePickerField, {
  PICKER_WINDOW_STEP,
} from "@/components/formcomponent/fields/SubstratePickerField.vue";
import { useSessionStore } from "@/stores/session";
import { useSubstratesStore } from "@/stores/substrates";

const passthrough = (tag = "div") =>
  defineComponent({
    render() {
      return h(tag, this.$slots.default?.());
    },
  });

const IonSearchbarStub = defineComponent({
  emits: ["ionInput"],
  render() {
    return h("input", {
      class: "searchbar",
      onInput: (event: Event) =>
        this.$emit("ionInput", { detail: { value: (event.target as HTMLInputElement).value } }),
    });
  },
});

const InfiniteStub = defineComponent({
  props: { disabled: Boolean },
  emits: ["ionInfinite"],
  render() {
    return h("div", { class: "infinite" }, this.$slots.default?.());
  },
});

const IonModalStub = defineComponent({
  props: { isOpen: Boolean },
  emits: ["didDismiss"],
  render() {
    return this.isOpen ? h("div", { class: "modal" }, this.$slots.default?.()) : null;
  },
});

const stubs = {
  IonModal: IonModalStub,
  IonContent: passthrough(),
  IonIcon: true,
  IonInfiniteScroll: InfiniteStub,
  IonInfiniteScrollContent: true,
  IonSearchbar: IonSearchbarStub,
  ModalHeader: true,
};

const item = (id: number, overrides: Partial<APISubstrateListItem> = {}) =>
  apiSubstrateListItem({ id, name: `Mix ${String(id).padStart(3, "0")}`, ...overrides });

const mineItems = (count: number) =>
  Array.from({ length: count }, (_, i) => item(i + 1, { user_id: 1, is_public: false }));

const page = (items: APISubstrateListItem[], next: string | null = null) =>
  envelope(items, next).data;

const scopeOf = (url: string) => new URL(url, "http://test").searchParams;
const urls = (): string[] => api.get.mock.calls.map(([url]) => String(url));
const listUrls = (scope: "mine" | "public"): string[] =>
  urls().filter((url) => scopeOf(url).get("scope") === scope);

const routeLists = (mine: APISubstrateListItem[], publicItems: APISubstrateListItem[] = []) => {
  api.get.mockImplementation(async (url: string) => {
    const params = scopeOf(url);
    if (params.get("scope") === "mine") return page(mine);
    const q = (params.get("q") ?? "").toLowerCase();
    return page(publicItems.filter((s) => s.name.toLowerCase().includes(q)));
  });
};

const field = (overrides: Partial<SubstratePickerField> = {}): SubstratePickerField => ({
  type: "substrate-picker",
  modelKey: "substrateId",
  label: "plant.field.substrate",
  placeholder: "plant.field.substrate_placeholder",
  ...overrides,
});

const mountPicker = async (
  props: { modelValue?: number | null; field?: SubstratePickerField } = {},
) => {
  const pinia = await createInstalledPinia();
  await useSessionStore().storeToken(fakeJwt({ id: 1, username: "alice", role: "user" }));
  return mount(SubstratePickerField, {
    props: { field: field(), modelValue: null, ...props },
    global: { plugins: [pinia], stubs },
  });
};

const settle = () => vi.advanceTimersByTimeAsync(0);

const open = async (wrapper: Awaited<ReturnType<typeof mountPicker>>) => {
  await wrapper.find(".picker-button").trigger("click");
  await settle();
};

const type = async (wrapper: Awaited<ReturnType<typeof mountPicker>>, value: string) => {
  const input = wrapper.find(".searchbar");
  (input.element as HTMLInputElement).value = value;
  await input.trigger("input");
};

const optionNames = (wrapper: Awaited<ReturnType<typeof mountPicker>>): string[] =>
  wrapper.findAll(".option:not(.none)").map((node) => node.text());

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("loading", () => {
  it("requests nothing while the form is only mounted and loads both lists on open", async () => {
    routeLists(mineItems(2), [item(50, { user_id: 7 })]);
    const wrapper = await mountPicker();
    await settle();
    expect(api.get).not.toHaveBeenCalled();

    await open(wrapper);
    expect(listUrls("mine")).toHaveLength(1);
    expect(listUrls("public")).toHaveLength(1);
    expect(optionNames(wrapper)).toEqual(["Mix 001", "Mix 002", "Mix 050"]);
  });

  it("does not refetch fresh lists when opened again", async () => {
    routeLists(mineItems(2));
    const wrapper = await mountPicker();
    await open(wrapper);
    await wrapper.find(".none").trigger("click");
    await settle();
    await open(wrapper);
    expect(listUrls("mine")).toHaveLength(1);
  });
});

describe("search", () => {
  it("filters the owner's list on the client without a request for it", async () => {
    routeLists([item(1, { name: "Aroid Mix" }), item(2, { name: "Bark Chips" })]);
    const wrapper = await mountPicker();
    await open(wrapper);
    await type(wrapper, "aroid");
    await vi.advanceTimersByTimeAsync(200);

    expect(optionNames(wrapper)).toEqual(["Aroid Mix"]);
    expect(listUrls("mine")).toHaveLength(1);
  });

  it("sends one public search per typing pause", async () => {
    routeLists(mineItems(1), [item(50, { name: "Perlite Blend", user_id: 7 })]);
    const wrapper = await mountPicker();
    await open(wrapper);
    const before = listUrls("public").length;

    await type(wrapper, "p");
    await vi.advanceTimersByTimeAsync(50);
    await type(wrapper, "pe");
    await vi.advanceTimersByTimeAsync(50);
    await type(wrapper, "perl");
    await vi.advanceTimersByTimeAsync(300);

    const searches = listUrls("public").slice(before);
    expect(searches).toHaveLength(1);
    expect(scopeOf(searches[0]).get("q")).toBe("perl");
    expect(optionNames(wrapper)).toEqual(["Perlite Blend"]);
  });

  it("resets the shared public query when the picker closes", async () => {
    routeLists(mineItems(1), [item(50, { name: "Perlite Blend", user_id: 7 })]);
    const wrapper = await mountPicker();
    await open(wrapper);
    await type(wrapper, "perl");
    await vi.advanceTimersByTimeAsync(300);
    expect(useSubstratesStore().public.query.q).toBe("perl");

    wrapper.findComponent(IonModalStub).vm.$emit("didDismiss");
    await settle();
    expect(useSubstratesStore().public.query.q).toBe("");
  });

  it("lists a public substrate once when it is also the user's own", async () => {
    const own = item(3, { user_id: 1, is_public: true });
    routeLists([own], [own, item(50, { user_id: 7 })]);
    const wrapper = await mountPicker();
    await open(wrapper);
    expect(optionNames(wrapper)).toEqual(["Mix 003", "Mix 050"]);
  });
});

describe("choosing", () => {
  it("emits the substrate id and closes", async () => {
    routeLists(mineItems(3));
    const wrapper = await mountPicker();
    await open(wrapper);
    await wrapper.findAll(".option:not(.none)")[1].trigger("click");
    await settle();

    expect(wrapper.emitted("update:modelValue")).toEqual([[2]]);
    expect(wrapper.find(".modal").exists()).toBe(false);
  });

  it("clears the choice with the not-set option", async () => {
    routeLists(mineItems(3));
    const wrapper = await mountPicker({ modelValue: 2, field: field({ selectedName: "Mix 002" }) });
    await open(wrapper);
    expect(wrapper.find(".none").text()).toBe("plant.field.substrate_none");
    await wrapper.find(".none").trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([[null]]);
  });

  it("marks the current substrate as pressed", async () => {
    routeLists(mineItems(3));
    const wrapper = await mountPicker({ modelValue: 2, field: field({ selectedName: "Mix 002" }) });
    await open(wrapper);
    const pressed = wrapper.findAll("[aria-pressed='true']").map((node) => node.text());
    expect(pressed).toEqual(["Mix 002"]);
  });
});

describe("windowing", () => {
  it("mounts 40 rows of a long list and grows by 40 per scroll event", async () => {
    routeLists(mineItems(100));
    const wrapper = await mountPicker();
    await open(wrapper);
    expect(optionNames(wrapper)).toHaveLength(PICKER_WINDOW_STEP);

    const complete = vi.fn();
    wrapper.findComponent(InfiniteStub).vm.$emit("ionInfinite", { target: { complete } });
    await settle();
    expect(optionNames(wrapper)).toHaveLength(PICKER_WINDOW_STEP * 2);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("asks for the next public page once the loaded rows are all shown", async () => {
    api.get.mockImplementation(async (url: string) => {
      const params = scopeOf(url);
      if (params.get("scope") === "mine") return page([]);
      return params.get("cursor")
        ? page([item(60, { user_id: 7 })])
        : page([item(50, { user_id: 7 })], "c1");
    });
    const wrapper = await mountPicker();
    await open(wrapper);
    const before = listUrls("public").length;

    const complete = vi.fn();
    wrapper.findComponent(InfiniteStub).vm.$emit("ionInfinite", { target: { complete } });
    await settle();

    const more = listUrls("public").slice(before);
    expect(more).toHaveLength(1);
    expect(scopeOf(more[0]).get("cursor")).toBe("c1");
    expect(optionNames(wrapper)).toEqual(["Mix 050", "Mix 060"]);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

describe("selected substrate before the lists load", () => {
  it("shows the plant's own substrate name without any request", async () => {
    const wrapper = await mountPicker({
      modelValue: 7,
      field: field({ selectedName: "Perlite Blend" }),
    });
    await settle();

    expect(wrapper.find(".picker-button").text()).toBe("Perlite Blend");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("fetches the substrate by id when nothing can name it, never a list", async () => {
    api.get.mockResolvedValue(
      apiSubstrateDetail({ substrate_id: 9, substrate_name: "Orchid Bark", substrate_user_id: 7 }),
    );
    const wrapper = await mountPicker({ modelValue: 9 });
    await settle();

    expect(urls()).toEqual(["/substrates/9"]);
    expect(wrapper.find(".picker-button").text()).toBe("Orchid Bark");
  });

  it("shows the placeholder when nothing is chosen", async () => {
    const wrapper = await mountPicker();
    expect(wrapper.find(".picker-button").text()).toBe("plant.field.substrate_placeholder");
    expect(wrapper.find(".picker-button").classes()).toContain("is-empty");
  });
});

describe("accessibility", () => {
  it("names the button by label and value and announces the dialog", async () => {
    const wrapper = await mountPicker({ field: field({ selectedName: "x" }), modelValue: 1 });
    const button = wrapper.find(".picker-button");
    expect(button.attributes("aria-haspopup")).toBe("dialog");
    const ids = button.attributes("aria-labelledby")!.split(" ");
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(wrapper.find(`#${id}`).exists()).toBe(true);
  });
});
