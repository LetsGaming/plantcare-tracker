<template>
  <ion-content>
    <div class="image-upload-modal__content">
      <input
        type="file"
        accept="image/*"
        @change="onFileChange"
        ref="fileInput"
        class="image-upload-modal__input"
      />
      <ion-button @click="onUploadClick" expand="block"> Upload </ion-button>
    </div>
  </ion-content>
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
} from "@ionic/vue";
import { closeOutline } from "ionicons/icons";

export default defineComponent({
  components: {
    IonModal,
    IonButton,
    IonIcon,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    onClose: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onUpload: {
      type: Function as PropType<(file: File) => void>,
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
    onFileChange(event: Event) {
      const target = event.target as HTMLInputElement;
      const files = target.files;
      if (files) {
        this.file = files[0];
      }
    },
    onUploadClick() {
      if (this.file) {
        console.log("File: ", this.file);
        this.onUpload(this.file);
        this.$el.remove(); // Remove the modal from the DOM
      }
    },
  },
});
</script>
