<template>
  <IonModal v-model:isOpen="isOpen">
    <IonHeader>
      <IonToolbar>
        <IonTitle>Bild hochladen</IonTitle>
        <IonButtons slot="end">
          <IonButton @click="onClose">
            <IonIcon :icon="closeOutline" />
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent>
      <div class="modal-card-container">
        <IonCard>
          <IonCardHeader>
            <IonCardTitle>{{ cardTitle }}</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <IonItem>
              <IonLabel>Bild hochladen</IonLabel>
              <input
                type="file"
                accept="image/*"
                @change="onFileChange"
                ref="fileInput"
                class="file-input"
              />
            </IonItem>

            <!-- Submit Button -->
            <IonButton expand="full" color="primary" @click="submitForm">
              Bild hochladen
            </IonButton>
          </IonCardContent>
        </IonCard>
      </div>
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
  IonModal,
  IonButton,
  IonIcon,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonLabel,
  IonItem,
} from "@ionic/vue";
import { closeOutline } from "ionicons/icons";

export default defineComponent({
  name: "ImageUploadModal",
  emits: ["submit"],
  components: {
    IonModal,
    IonButton,
    IonIcon,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonLabel,
    IonItem,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    cardTitle: {
      type: String,
      required: true,
    },
    onClose: {
      type: Function as PropType<() => void>,
      required: true,
    },
  },
  setup() {
    return {
      closeOutline,
    };
  },
  data() {
    return {
      file: null as File | null,
    };
  },
  methods: {
    onFileChange(e: Event) {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        this.file = file;
      }
    },
    submitForm() {
      if (this.file) {
        this.$emit("submit", this.file);
      }
    },
  },
});
</script>
