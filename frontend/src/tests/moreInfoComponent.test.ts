/**
 * Tests for the care guide section: the stop control, the persistent status
 * line, the busy flag, the single disclaimer and the renderer output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

vi.mock("@/services/general/ToastService", () => ({
  default: { showSuccess: vi.fn(), showError: vi.fn(), showToastWithAction: vi.fn() },
}));
vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (key: string) => key, getLocale: () => "en" },
}));

import MoreInfo from "@/components/plants/MoreInfo.vue";
import { useMoreInfoStore } from "@/stores/moreInfo";
import { renderMarkdown } from "@/utils/markdown";

const passthrough = (tag = "div") =>
  defineComponent({
    render() {
      return h(tag, this.$slots.default?.());
    },
  });

const settle = async () => {
  for (let i = 0; i < 6; i++) await nextTick();
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

const mountGuide = (setup?: (store: ReturnType<typeof useMoreInfoStore>) => void) => {
  const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true });
  const store = useMoreInfoStore(pinia);
  const pending = deferred();
  vi.mocked(store.ensureInfo).mockImplementation(() => pending.promise);
  setup?.(store);
  const wrapper = mount(MoreInfo, {
    props: { plantName: "Monty" },
    global: {
      plugins: [pinia],
      stubs: {
        IonButton: passthrough("button"),
        IonSpinner: passthrough("span"),
        IonIcon: passthrough("span"),
      },
    },
  });
  return { wrapper, store, pending };
};

const statusText = (wrapper: ReturnType<typeof mountGuide>["wrapper"]) =>
  wrapper.find('p[role="status"]').text();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MoreInfo stop control", () => {
  it("shows a Stop button while loading and stops the stream for this plant", async () => {
    const { wrapper, store } = mountGuide();
    await settle();

    const stop = wrapper.findAll("button").find((b) => b.text() === "moreinfo2.stop");
    expect(stop).toBeDefined();
    await stop!.trigger("click");
    expect(store.stopInfo).toHaveBeenCalledWith("Monty");
    wrapper.unmount();
  });

  it("shows the stopped note and a Retry that forces a new load", async () => {
    const { wrapper, store, pending } = mountGuide();
    await settle();
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "moreinfo2.stop")!
      .trigger("click");
    pending.resolve();
    await settle();

    expect(statusText(wrapper)).toBe("moreinfo2.stopped");
    expect(wrapper.findAll("button").some((b) => b.text() === "moreinfo2.stop")).toBe(false);

    vi.mocked(store.ensureInfo).mockClear();
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "state.retry")!
      .trigger("click");
    expect(store.ensureInfo).toHaveBeenCalledWith("Monty", { force: true });
    wrapper.unmount();
  });
});

describe("MoreInfo busy flag", () => {
  it("marks the guide text busy while loading and not the section", async () => {
    const { wrapper } = mountGuide((store) => {
      store.drafts = { "en:Monty": [{ links: [], ai: renderMarkdown("partial") } as MoreInfo] };
    });
    await settle();

    expect(wrapper.find("section").attributes("aria-busy")).toBeUndefined();
    expect(wrapper.find(".guide-text").attributes("aria-busy")).toBe("true");
    wrapper.unmount();
  });

  it("clears the busy flag once loading finished", async () => {
    const { wrapper, pending } = mountGuide((store) => {
      store.drafts = { "en:Monty": [{ links: [], ai: renderMarkdown("done") } as MoreInfo] };
    });
    pending.resolve();
    await settle();
    expect(wrapper.find(".guide-text").attributes("aria-busy")).toBe("false");
    wrapper.unmount();
  });
});

describe("MoreInfo completion announcement", () => {
  it("announces completion after a stream and clears it after four seconds", async () => {
    const { wrapper, pending } = mountGuide((store) => {
      store.streaming = { "en:Monty": true };
    });
    await settle();
    expect(statusText(wrapper)).toBe("moreinfo2.writing");

    pending.resolve();
    await settle();
    expect(statusText(wrapper)).toBe("moreinfo2.done");

    vi.advanceTimersByTime(3900);
    await settle();
    expect(statusText(wrapper)).toBe("moreinfo2.done");

    vi.advanceTimersByTime(200);
    await settle();
    expect(statusText(wrapper)).toBe("");
    wrapper.unmount();
  });

  it("announces when the stream starts after mount", async () => {
    const { wrapper, store, pending } = mountGuide();
    await settle();
    store.streaming = { "en:Monty": true };
    await settle();
    pending.resolve();
    await settle();
    expect(statusText(wrapper)).toBe("moreinfo2.done");
    wrapper.unmount();
  });

  it("does not announce a guide served from the cache", async () => {
    const { wrapper, pending } = mountGuide();
    pending.resolve();
    await settle();
    expect(statusText(wrapper)).toBe("");
    wrapper.unmount();
  });

  it("keeps the live region in the DOM while idle", async () => {
    const { wrapper, pending } = mountGuide();
    pending.resolve();
    await settle();
    expect(wrapper.find('p[role="status"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("cancels the notice timer when unmounted", async () => {
    const { wrapper, pending } = mountGuide((store) => {
      store.streaming = { "en:Monty": true };
    });
    await settle();
    pending.resolve();
    await settle();
    expect(vi.getTimerCount()).toBe(1);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("MoreInfo content", () => {
  it("renders one merged disclaimer with both sentences", async () => {
    const { wrapper, pending } = mountGuide((store) => {
      const ai = renderMarkdown("Water often.");
      store.byKey = { "en:Monty": [{ links: ["https://a.example"], ai } as MoreInfo] };
    });
    pending.resolve();
    await settle();

    const notes = wrapper.findAll(".note");
    expect(notes).toHaveLength(1);
    expect(notes[0].text()).toBe("moreinfo2.disclaimer_ai moreinfo2.disclaimer_links");
    wrapper.unmount();
  });

  it("renders the renderer output with the strong class and no post-processing", async () => {
    const { wrapper, pending } = mountGuide((store) => {
      store.byKey = { "en:Monty": [{ links: [], ai: renderMarkdown("**fett**") } as MoreInfo] };
    });
    pending.resolve();
    await settle();

    const html = wrapper.find(".guide-text").html();
    expect(html).toContain('class="info-strong"');
    expect(html).toContain('<p class="info-text-paragraph">');
    wrapper.unmount();
  });
});
