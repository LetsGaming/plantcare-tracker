import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { useMountWhileOpen } from "@/components/modal/useMountWhileOpen";

const Probe = defineComponent({
  props: { isOpen: Boolean },
  setup(props) {
    return useMountWhileOpen(() => props.isOpen);
  },
  render() {
    return h("div", { class: this.mounted ? "on" : "off" });
  },
});

describe("useMountWhileOpen", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts unmounted and mounts when opened", async () => {
    const wrapper = mount(Probe, { props: { isOpen: false } });
    expect(wrapper.classes()).toContain("off");
    await wrapper.setProps({ isOpen: true });
    expect(wrapper.classes()).toContain("on");
  });

  it("unmounts after dismissal once the parent closed it, in either order", async () => {
    vi.useFakeTimers();
    const wrapper = mount(Probe, { props: { isOpen: true } });
    const release = (wrapper.vm as unknown as { release: () => void }).release;

    await wrapper.setProps({ isOpen: false });
    expect(wrapper.classes()).toContain("on");
    release();
    vi.advanceTimersByTime(100);
    await nextTick();
    expect(wrapper.classes()).toContain("off");

    await wrapper.setProps({ isOpen: true });
    release();
    await wrapper.setProps({ isOpen: false });
    vi.advanceTimersByTime(100);
    await nextTick();
    expect(wrapper.classes()).toContain("off");
  });
});
