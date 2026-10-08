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
  --background: var(--ion-color-primary);
  --color: var(--ion-color-primary-contrast);
  --border-width: 0;
}

.admin-toolbar ion-title,
.admin-toolbar ion-back-button,
.admin-toolbar :deep(.icon-button) {
  color: var(--ion-color-primary-contrast);
  --color: var(--ion-color-primary-contrast);
}
</style>
