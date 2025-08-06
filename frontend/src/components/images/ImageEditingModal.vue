<template>
  <IonModal v-model:isOpen="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader headerTitle="Bild bearbeiten" @close="$emit('close')" />
    <IonContent>
      <div class="modal-card-container">
        <form-component
          :item="imageEditData"
          :formFields="[
            {
              type: 'file',
              label: 'Bild',
              modelKey: 'image',
            },
            {
              type: 'date',
              label: 'Datum',
              modelKey: 'date',
              required: true,
            },
          ]"
          cardTitle="Bild Informationen"
          submitLabel="Bearbeiten"
          :onSubmitClick="submitForm"
          :onDeleteClick="deleteImage"
          :isLoading="isLoading"
        />
      </div>
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
} from "@ionic/vue";
import { closeOutline } from "ionicons/icons";

import FormComponent from "../formcomponent/FormComponent.vue";
import ModalHeader from "../modal/ModalHeader.vue";
import ImageService from "../../services/ImageService";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  name: "ImageEditingModal",
  emits: ["close", "edited"],
  components: {
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    ModalHeader,
    FormComponent,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    image: {
      type: Object as PropType<Image>,
      required: true,
    },
    entityType: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      imageEditData: {
        image: undefined,
        date: undefined,
      } as EditImage,
      isLoading: false,
    };
  },
  setup() {
    return {
      closeOutline,
    };
  },
  mounted() {
    this.imageEditData.date = this.image.date_millis;
  },
  methods: {
    async submitForm() {
      try {
        if (!this.imageEditData.image && !this.imageEditData.date) {
          ToastService.showError("Bitte fülle mindestens ein Feld aus.");
          return;
        }
        this.isLoading = true;
        const response = await ImageService.editImage(
          this.image.id,
          this.entityType,
          this.imageEditData.date,
          this.imageEditData.image
        );
        if (response) {
          this.isLoading = false;
          this.$emit("edited");
        }
      } catch (error) {
        console.error(error);
      }
    },
    async deleteImage() {
      try {
        this.isLoading = true;
        const response = await ImageService.deleteImage(this.image.id);
        if (response) {
          this.isLoading = false;
          this.$emit("edited");
        }
      } catch (error) {
        console.error(error);
      }
    },
  },
});
</script>
