/**
 * Tests for the care guide section: start on request, abort on leave, the stop control, the persistent status
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

type GuideStore = ReturnType<typeof useMoreInfoStore>;

const guideOf = (ai: string) => [{ links: [], ai } as MoreInfo];

const mountGuide = (
  setup?: (store: GuideStore) => void,
  { cached = false, plantName = "Monty" }: { cached?: boolean; plantName?: string } = {},
) => {
  const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true });
  const store = useMoreInfoStore(pinia);
  const pending = deferred();
  vi.mocked(store.ensureInfo).mockImplementation(() => pending.promise);
  vi.mocked(store.loadCached).mockResolvedValue(cached);
  setup?.(store);
  const wrapper = mount(MoreInfo, {
    props: { plantName },
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

const buttonByText = (wrapper: ReturnType<typeof mountGuide>["wrapper"], text: string) =>
  wrapper.findAll("button").find((b) => b.text() === text);

const startGuide = async (wrapper: ReturnType<typeof mountGuide>["wrapper"]) => {
  await buttonByText(wrapper, "careGuide.show")!.trigger("click");
  await settle();
};

const statusText = (wrapper: ReturnType<typeof mountGuide>["wrapper"]) =>
  wrapper.find('p[role="status"]').text();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MoreInfo start on request", () => {
  it("opens no stream on entry and offers the show button", async () => {
    const { wrapper, store } = mountGuide();
    await settle();

    expect(store.ensureInfo).not.toHaveBeenCalled();
    expect(buttonByText(wrapper, "careGuide.show")).toBeDefined();
    expect(wrapper.find("span").exists()).toBe(false);
    wrapper.unmount();
  });

  it("starts exactly one stream on tap", async () => {
    const { wrapper, store } = mountGuide();
    await settle();
    await startGuide(wrapper);

    expect(store.ensureInfo).toHaveBeenCalledTimes(1);
    expect(store.ensureInfo).toHaveBeenCalledWith("Monty", { force: false });
    expect(buttonByText(wrapper, "careGuide.show")).toBeUndefined();
    expect(buttonByText(wrapper, "moreinfo2.stop")).toBeDefined();
    wrapper.unmount();
  });

  it("renders a cached guide at once without a request or a show button", async () => {
    const { wrapper, store } = mountGuide(
      (s) => {
        s.byKey = { "en:Monty": guideOf(renderMarkdown("Cached words.")) };
      },
      { cached: true },
    );
    await settle();

    expect(store.ensureInfo).not.toHaveBeenCalled();
    expect(wrapper.find(".guide-text").text()).toContain("Cached words.");
    expect(buttonByText(wrapper, "careGuide.show")).toBeUndefined();
    wrapper.unmount();
  });

  it("hides a stale stored guide behind the show button", async () => {
    const { wrapper } = mountGuide((s) => {
      s.byKey = { "en:Monty": guideOf(renderMarkdown("Old words.")) };
    });
    await settle();

    expect(wrapper.find(".guide-text").exists()).toBe(false);
    expect(buttonByText(wrapper, "careGuide.show")).toBeDefined();
    wrapper.unmount();
  });
});

describe("MoreInfo abort on leave", () => {
  it("aborts the running stream when unmounted", async () => {
    const { wrapper, store } = mountGuide();
    await settle();
    await startGuide(wrapper);

    wrapper.unmount();
    expect(store.stopInfo).toHaveBeenCalledWith("Monty");
  });

  it("does not stop anything when unmounted without a running stream", async () => {
    const { wrapper, store } = mountGuide();
    await settle();
    wrapper.unmount();
    expect(store.stopInfo).not.toHaveBeenCalled();
  });

  it("aborts when the page becomes inactive and returns to the start state", async () => {
    const { wrapper, store } = mountGuide();
    await settle();
    await startGuide(wrapper);
    expect(statusText(wrapper)).toBe("moreinfo2.writing");

    await wrapper.setProps({ active: false });
    await settle();
    expect(store.stopInfo).toHaveBeenCalledWith("Monty");
    expect(statusText(wrapper)).toBe("");
    expect(buttonByText(wrapper, "careGuide.show")).toBeDefined();
    wrapper.unmount();
  });

  it("never stays loading when the stream was aborted without storing a guide", async () => {
    const { wrapper, pending } = mountGuide();
    await settle();
    await startGuide(wrapper);

    pending.resolve();
    await settle();
    expect(statusText(wrapper)).toBe("");
    expect(buttonByText(wrapper, "moreinfo2.stop")).toBeUndefined();
    expect(buttonByText(wrapper, "careGuide.show")).toBeDefined();
    wrapper.unmount();
  });

  it("aborts the old plant's stream when the plant changes", async () => {
    const { wrapper, store } = mountGuide();
    await settle();
    await startGuide(wrapper);

    await wrapper.setProps({ plantName: "Spike" });
    await settle();
    expect(store.stopInfo).toHaveBeenCalledWith("Monty");
    expect(buttonByText(wrapper, "careGuide.show")).toBeDefined();
    wrapper.unmount();
  });
});

describe("MoreInfo error", () => {
  it("shows the error state with a retry that forces a new stream", async () => {
    const { wrapper, store } = mountGuide(undefined, { plantName: "Failing Fern" });
    vi.mocked(store.ensureInfo).mockRejectedValueOnce(new Error("stream failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await settle();
    await startGuide(wrapper);

    expect(wrapper.find('[role="alert"]').text()).toContain("moreinfo2.error");
    vi.mocked(store.ensureInfo).mockClear();
    await buttonByText(wrapper, "state.retry")!.trigger("click");
    expect(store.ensureInfo).toHaveBeenCalledWith("Failing Fern", { force: true });
    wrapper.unmount();
  });
});

describe("MoreInfo stop control", () => {
  it("shows a Stop button while loading and stops the stream for this plant", async () => {
    const { wrapper, store } = mountGuide();
    await settle();
    await startGuide(wrapper);

    const stop = wrapper.findAll("button").find((b) => b.text() === "moreinfo2.stop");
    expect(stop).toBeDefined();
    await stop!.trigger("click");
    expect(store.stopInfo).toHaveBeenCalledWith("Monty");
    wrapper.unmount();
  });

  it("shows the stopped note and a Retry that forces a new load", async () => {
    const { wrapper, store, pending } = mountGuide();
    await settle();
    await startGuide(wrapper);
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
      store.drafts = { "en:Monty": guideOf(renderMarkdown("partial")) };
    });
    await settle();
    await startGuide(wrapper);

    expect(wrapper.find("section").attributes("aria-busy")).toBeUndefined();
    expect(wrapper.find(".guide-text").attributes("aria-busy")).toBe("true");
    wrapper.unmount();
  });

  it("clears the busy flag once loading finished", async () => {
    const { wrapper, pending } = mountGuide((store) => {
      store.drafts = { "en:Monty": guideOf(renderMarkdown("done")) };
      store.byKey = { "en:Monty": guideOf(renderMarkdown("done")) };
    });
    await settle();
    await startGuide(wrapper);
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
      store.byKey = { "en:Monty": guideOf(renderMarkdown("done")) };
    });
    await settle();
    await startGuide(wrapper);
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
    store.byKey = { "en:Monty": guideOf(renderMarkdown("done")) };
    await startGuide(wrapper);
    store.streaming = { "en:Monty": true };
    await settle();
    pending.resolve();
    await settle();
    expect(statusText(wrapper)).toBe("moreinfo2.done");
    wrapper.unmount();
  });

  it("does not announce a guide served from the cache", async () => {
    const { wrapper, pending } = mountGuide((store) => {
      store.byKey = { "en:Monty": guideOf(renderMarkdown("done")) };
    });
    await settle();
    await startGuide(wrapper);
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
      store.byKey = { "en:Monty": guideOf(renderMarkdown("done")) };
    });
    await settle();
    await startGuide(wrapper);
    pending.resolve();
    await settle();
    expect(vi.getTimerCount()).toBe(1);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("MoreInfo content", () => {
  it("renders one merged disclaimer with both sentences", async () => {
    const { wrapper } = mountGuide(
      (store) => {
        const ai = renderMarkdown("Water often.");
        store.byKey = { "en:Monty": [{ links: ["https://a.example"], ai } as MoreInfo] };
      },
      { cached: true },
    );
    await settle();

    const notes = wrapper.findAll(".note");
    expect(notes).toHaveLength(1);
    expect(notes[0].text()).toBe("moreinfo2.disclaimer_ai moreinfo2.disclaimer_links");
    wrapper.unmount();
  });

  it("renders the renderer output with the strong class and no post-processing", async () => {
    const { wrapper } = mountGuide(
      (store) => {
        store.byKey = { "en:Monty": guideOf(renderMarkdown("**fett**")) };
      },
      { cached: true },
    );
    await settle();

    const html = wrapper.find(".guide-text").html();
    expect(html).toContain('class="info-strong"');
    expect(html).toContain('<p class="info-text-paragraph">');
    wrapper.unmount();
  });
});
