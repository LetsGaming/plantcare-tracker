<template>
  <IonModal v-model:isOpen="isOpen">
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
              label: 'Bild',
              modelKey: 'file',
              required: true,
            },
            {
              type: 'date',
              label: 'Datum',
              modelKey: 'date',
            }
          ]"
          submitLabel="Hochladen"
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
        file: null as File | null,
        date: null as Date | null,
      },
    };
  },
  methods: {
    submitForm() {
      if (!this.fileItem.file) {
        ToastService.showError("Bitte wählen Sie ein Bild aus.");
      } else {
        this.$emit("submit", this.fileItem);
      }
    },
  },
});
</script>
