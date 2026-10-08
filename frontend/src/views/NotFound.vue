<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t("pageNotFound.title") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <StateBlock
        kind="not-found"
        :title="t('pageNotFound.title')"
        :message="t('pageNotFound.message')"
        :action-label="t('pageNotFound.goHome')"
        @action="navigateHome"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent } from "@ionic/vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "NotFound",
  components: {
    IonPage,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    StateBlock,
  },
  methods: {
    t(value: string) {
      return localizationService.t(value, undefined, value);
    },
    navigateHome() {
      this.$router.replace({ name: "plant-overview" });
    },
  },
});
</script>
