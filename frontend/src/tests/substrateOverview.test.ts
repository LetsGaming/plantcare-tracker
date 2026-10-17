/**
 * The substrates overview on the paged contract: segment labels that follow
 * the locale, an inactive page flag and list key for ItemsOverview, and the
 * query reset when the public segment is opened with a search still set.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import {
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
vi.mock("@/services/general/LocalizationService", async () => {
  const { ref } = await import("vue");
  const locale = ref("en");
  return {
    default: {
      locale,
      getLocale: () => locale.value,
      t: (key: string, _vars?: unknown, fallback?: string) => fallback ?? `${locale.value}:${key}`,
    },
  };
});
vi.mock("@/utils/apiUtils", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    isApiError: () => false,
    configureAuth: vi.fn(),
  },
}));

import ApiUtils from "@/utils/apiUtils";
import localizationService from "@/services/general/LocalizationService";
import { useSessionStore } from "@/stores/session";
import { useSubstratesStore } from "@/stores/substrates";
import SubstrateOverview from "@/views/substrates/SubstrateOverview.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import OverviewHeader from "@/components/overview/OverviewHeader.vue";

const passthrough = (tag = "div") =>
  defineComponent({
    render() {
      return h(tag, this.$slots.default?.());
    },
  });

const stubs = {
  IonPage: passthrough(),
  ItemsOverview: true,
  OverviewHeader: true,
  SubstrateAddingModal: true,
};

const item = (id: number, overrides: Partial<APISubstrateListItem> = {}) =>
  apiSubstrateListItem({ id, name: `Mix ${id}`, user_id: 1, is_public: false, ...overrides });

const page = (items: APISubstrateListItem[], next: string | null = null, total?: number) =>
  envelope(items, next, total).data;

const paths = (): URL[] =>
  vi.mocked(ApiUtils.get).mock.calls.map(([path]) => new URL(path as string, "http://test"));

const mountPage = async () => {
  const pinia = await createInstalledPinia();
  await useSessionStore(pinia).storeToken(fakeJwt({ id: 1, username: "alice", role: "user" }));
  vi.mocked(ApiUtils.get).mockImplementation((async (path: string) => {
    const url = new URL(path, "http://test");
    return page(url.searchParams.get("scope") === "mine" ? [item(1)] : [item(2, { user_id: 7 })]);
  }) as never);
  const wrapper = mount(SubstrateOverview, { global: { plugins: [pinia], stubs } });
  return { wrapper, store: useSubstratesStore(pinia), vm: wrapper.vm as any };
};

const header = (wrapper: ReturnType<typeof mount>) => wrapper.findComponent(OverviewHeader);
const list = (wrapper: ReturnType<typeof mount>) => wrapper.findComponent(ItemsOverview);

const leave = (vm: any) => vm.onIonViewDidLeave.forEach((hook: () => void) => hook());
const enter = (vm: any) => vm.onIonViewWillEnter.forEach((hook: () => void) => hook());

beforeEach(() => {
  (localizationService as any).locale.value = "en";
  resetStore();
  vi.mocked(ApiUtils.get).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SubstrateOverview segments", () => {
  it("labels the segments in the current locale and keeps their identity until it changes", async () => {
    const { wrapper } = await mountPage();
    await flushPromises();
    const before = header(wrapper).props("segments") as { value: string; label: string }[];
    expect(before.map((s) => s.label)).toEqual([
      "en:substrate.public_label",
      "en:substrate.private_label",
    ]);

    await wrapper.setProps({});
    expect(header(wrapper).props("segments")).toBe(before);

    (localizationService as any).locale.value = "de";
    await nextTick();
    const after = header(wrapper).props("segments") as { label: string }[];
    expect(after).not.toBe(before);
    expect(after.map((s) => s.label)).toEqual([
      "de:substrate.public_label",
      "de:substrate.private_label",
    ]);
    wrapper.unmount();
  });
});

describe("SubstrateOverview list wiring", () => {
  it("passes the page activity and the segment as the list key", async () => {
    const { wrapper, vm } = await mountPage();
    await flushPromises();
    expect(list(wrapper).props()).toMatchObject({ active: true, listKey: "private" });

    leave(vm);
    await nextTick();
    expect(list(wrapper).props("active")).toBe(false);
    enter(vm);
    await flushPromises();
    expect(list(wrapper).props("active")).toBe(true);

    vm.handleSegmentChange("public");
    await flushPromises();
    expect(list(wrapper).props()).toMatchObject({ listKey: "public", serverSearch: true });
    wrapper.unmount();
  });

  it("clears a public search that is still set when the public segment opens", async () => {
    const { wrapper, store, vm } = await mountPage();
    await flushPromises();
    vm.handleSegmentChange("public");
    await flushPromises();
    await store.setPublicQuery("moss");
    vm.handleSegmentChange("private");
    await flushPromises();
    vi.mocked(ApiUtils.get).mockClear();

    vm.handleSegmentChange("public");
    await flushPromises();

    const publicCalls = paths().filter((url) => url.searchParams.get("scope") === "public");
    expect(publicCalls).toHaveLength(1);
    expect(publicCalls[0].searchParams.has("q")).toBe(false);
    expect(store.public.query.q).toBe("");
    wrapper.unmount();
  });
});
