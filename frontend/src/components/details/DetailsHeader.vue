<template>
  <ion-header>
    <ion-toolbar class="header-toolbar">
      <ion-buttons slot="start">
        <ion-back-button
          :text="t('common.back')"
          :default-href="defaultBackHref || undefined"
        ></ion-back-button>
      </ion-buttons>
      <ion-buttons v-if="!isGuest && (showUploadButton || showEditButton)" slot="end">
        <icon-button
          v-if="showUploadButton"
          :icon="icons.upload"
          :label="t('a11y.upload_image')"
          @press="handleUpload"
        />
        <icon-button
          v-if="showEditButton"
          :icon="icons.edit"
          :label="t('a11y.edit')"
          @press="handleEdit"
        />
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonHeader, IonToolbar, IonButtons, IonBackButton } from "@ionic/vue";
import { icons } from "@/theme/icons";
import { mapState } from "pinia";
import { useSessionStore } from "@/stores/session";
import localizationService from "@/services/general/LocalizationService";
import IconButton from "@/components/ui/IconButton.vue";

export default defineComponent({
  name: "DetailsHeader",
  components: {
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IconButton,
  },
  props: {
    defaultBackHref: {
      type: String,
      required: false,
    },
    showEditButton: {
      type: Boolean,
      default: true,
    },
    showUploadButton: {
      type: Boolean,
      default: false,
    },
    onEditClick: {
      type: Function as PropType<() => void>,
      required: false,
    },
    onUploadClick: {
      type: Function as PropType<() => void>,
      required: false,
    },
  },
  setup() {
    return { icons };
  },
  computed: {
    ...mapState(useSessionStore, ["isGuest"]),
  },
  methods: {
    t(value: string) {
      return localizationService.t(value, undefined, value);
    },
    handleEdit() {
      this.onEditClick?.();
    },
    handleUpload() {
      this.onUploadClick?.();
    },
  },
});
</script>

<style scoped>
.header-toolbar {
  --background: var(--ion-color-primary);
  --color: var(--ion-color-primary-contrast);
  --border-width: 0;
}

.header-toolbar ion-back-button {
  --min-height: var(--tap-min);
  min-height: var(--tap-min);
}

.header-toolbar ion-back-button,
.header-toolbar :deep(.icon-button) {
  --color: var(--ion-color-primary-contrast);
  color: var(--ion-color-primary-contrast);
}
</style>
