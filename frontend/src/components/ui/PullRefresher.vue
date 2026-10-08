<template>
  <ion-refresher slot="fixed" @ionRefresh="onRefresh">
    <ion-refresher-content
      :pulling-icon="chevronDown"
      :pulling-text="t('pullToRefresh.pull')"
      refreshing-spinner="circles"
      :refreshing-text="t('pullToRefresh.refreshing')"
    />
  </ion-refresher>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonRefresher, IonRefresherContent } from "@ionic/vue";
import { chevronDown } from "ionicons/icons";
import localizationService from "@/services/general/LocalizationService";

/** Pull to refresh for detail screens; the handler's promise decides when the spinner stops. */
export default defineComponent({
  name: "PullRefresher",
  components: { IonRefresher, IonRefresherContent },
  props: {
    handler: { type: Function as PropType<() => Promise<unknown>>, required: true },
  },
  setup() {
    return { chevronDown };
  },
  methods: {
    t(key: string) {
      return localizationService.t(key);
    },
    async onRefresh(event: CustomEvent) {
      const refresher = event.target as HTMLIonRefresherElement;
      try {
        await this.handler();
      } finally {
        await refresher.complete();
      }
    },
  },
});
</script>
