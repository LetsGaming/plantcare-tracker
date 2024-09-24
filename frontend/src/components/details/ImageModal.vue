<template>
  <ion-modal :is-open="isOpen" @did-dismiss="closeModal">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="closeModal()">Zurück</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div class="enlarged-image-container">
        <ion-img :src="imageUrl" class="enlarged-image" />
        <IonLabel
          :class="
            isPlatform('mobile')
              ? 'enlarged-image-label-mobile'
              : 'enlarged-image-label'
          "
          >{{ label }}</IonLabel
        >
      </div>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import {
  IonModal,
  IonContent,
  IonImg,
  IonLabel,
  IonItem,
  IonHeader,
  IonToolbar,
  IonButtons,
  isPlatform,
  IonButton,
} from "@ionic/vue";
import { defineComponent } from "vue";

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
  },
  methods: {
    closeModal() {
      this.$emit("close");
    },
    isPlatform(platform: any) {
      return isPlatform(platform);
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
  max-height: 500px; /* Adjust as needed */
}

.enlarged-image-label {
  position: absolute;
  top: 35dvh;
  left: 2dvw;
  font-size: 24px;
}

.enlarged-image-label-mobile {
  position: absolute;
  top: 70dvh;
  left: 5dvw;
  font-size: 24px;
}
</style>
