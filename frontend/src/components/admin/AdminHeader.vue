<template>
  <ion-header>
    <ion-toolbar class="admin-toolbar">
      <ion-buttons slot="start">
        <ion-back-button :text="t('common.back')" :default-href="backHref" />
      </ion-buttons>
      <ion-title>{{ title }}</ion-title>
      <ion-buttons slot="end">
        <slot name="actions" />
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton } from "@ionic/vue";
import localizationService from "@/services/general/LocalizationService";

/** Header chrome shared by the admin screens. */
export default defineComponent({
  name: "AdminHeader",
  components: { IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton },
  props: {
    title: { type: String, required: true },
    backHref: { type: String, required: true },
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
  },
});
</script>

<style scoped>
.admin-toolbar {
  --background: var(--chrome-bg);
  --color: var(--ion-text-color);
  --border-color: var(--line);
  --border-width: 0 0 1px;
}

.admin-toolbar ion-back-button {
  --min-height: var(--tap-min);
  min-height: var(--tap-min);
}

.admin-toolbar ion-title {
  color: var(--ion-text-color);
}

.admin-toolbar ion-back-button,
.admin-toolbar :deep(.icon-button) {
  color: var(--ion-color-primary);
  --color: var(--ion-color-primary);
}
</style>
