<template>
  <ion-modal :is-open="isOpen" @did-dismiss="closeModal">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="closeModal()">Zurück</ion-button>
        </ion-buttons>
        <ion-icon
          v-if="showEditButton"
          :icon="create"
          style="width: 32px; height: 32px"
          slot="end"
          @click="onEditClick"
        />
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div class="enlarged-image-container">
        <ion-img :src="imageUrl" class="enlarged-image" />
        <IonLabel class="enlarged-image-label">{{ label }}</IonLabel>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import {
  IonModal,
  IonContent,
  IonImg,
  IonIcon,
  IonLabel,
  IonItem,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
} from "@ionic/vue";
import { defineComponent, PropType } from "vue";
import { create } from "ionicons/icons";

export default defineComponent({
  name: "ImageModal",
  emits: ["close"],
  components: {
    IonModal,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonContent,
    IonItem,
    IonImg,
    IonIcon,
    IonLabel,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      default: "Image",
    },
    showEditButton: {
      type: Boolean,
      default: false,
    },
    onEditClick: {
      type: Function as PropType<() => void>,
      required: false,
    },
  },
  setup() {
    return { create };
  },
  methods: {
    closeModal() {
      this.$emit("close");
    },
  },
});
</script>

<style scoped>
.enlarged-image-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.enlarged-image {
  width: 90%;
}

.enlarged-image::part(image) {
  max-height: 500px; /* Adjust as needed */
}

.enlarged-image-label {
  position: absolute;
  top: 35dvh;
  left: 2dvw;
  font-size: 24px;
}

@media (max-width: 768px) {
  .enlarged-image-label {
    position: absolute;
    top: 70dvh;
    left: 5dvw;
    font-size: 24px;
  }
}
</style>
