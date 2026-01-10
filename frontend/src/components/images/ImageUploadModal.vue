<template>
  <IonModal v-model:isOpen="isOpen" @did-dismiss="onClose">
    <IonHeader>
      <IonToolbar>
        <IonTitle>{{ cardTitle }}</IonTitle>
        <IonButtons slot="end">
          <IonButton @click="onClose">
            <IonIcon :icon="closeOutline" />
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent>
      <div class="modal-card-container">
        <form-component
          :item="fileItem"
          :formFields="[
            {
              type: 'file',
              label: 'image.label',
              modelKey: 'file',
              required: true,
            },
            {
              type: 'date',
              label: 'image.date_label',
              modelKey: 'date',
            },
          ]"
          cardTitle="image.upload.title"
          submitLabel="image.upload.submit"
          :isLoading="isLoading"
          :onSubmitClick="submitForm"
        />
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
import FormComponent from "@/components/formcomponent/FormComponent.vue";
import { closeOutline } from "ionicons/icons";
import ToastService from "@/services/general/ToastService";

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
    FormComponent,
  },
  props: {
    isLoading: {
      type: Boolean,
      required: true,
    },
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
      fileItem: {
        date: undefined,
        file: undefined as File | undefined,
      } as AddImage,
    };
  },
  methods: {
    submitForm() {
      if (!this.fileItem.file) {
        ToastService.showError({ key: 'image.select_error', fallback: 'Please select an image.' });
      } else {
        this.$emit("submit", this.fileItem);
      }
    },
  },
});
</script>
