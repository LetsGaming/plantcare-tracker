import { defineComponent } from "vue";
import { onIonViewDidLeave, onIonViewWillEnter } from "@ionic/vue";

/**
 * Tracks whether an Ionic page is the visible one. Ionic keeps tab pages mounted while hidden, so
 * list pages hand `pageActive` to `ItemsOverview :active` to stop recomputing behind the scenes.
 *
 * Ionic reads option-based `ionViewWillEnter` hooks from the page definition only, never from
 * mixins, so the mixin registers composition hooks instead. They run after the page's own
 * `ionViewWillEnter`/`ionViewDidLeave` options.
 */
export const pageActive = defineComponent({
  data() {
    return { pageActive: true };
  },
  created() {
    onIonViewWillEnter(() => {
      this.pageActive = true;
    }, this.$);
    onIonViewDidLeave(() => {
      this.pageActive = false;
    }, this.$);
  },
});

/** For computeds and watchers: `if (!isActive(this)) return cached;`. */
export const isActive = (vm: { pageActive?: boolean }): boolean => vm.pageActive !== false;
