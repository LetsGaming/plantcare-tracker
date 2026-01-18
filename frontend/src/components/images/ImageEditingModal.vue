<template>
  <IonModal v-model:isOpen="isOpen" @did-dismiss="$emit('close')">
  <ModalHeader :headerTitle="t('image.edit.title')" @close="$emit('close')" />
    <IonContent>
      <div class="modal-card-container">
        <form-component
          :item="imageEditData"
          :formFields="[
            {
              type: 'file',
              label: t('image.field.file'),
              modelKey: 'image',
            },
            {
              type: 'date',
              label: t('image.field.date'),
              modelKey: 'date',
              required: true,
            },
          ]"
          :cardTitle="t('image.info.title')"
          submitLabel="image.edit.submit"
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
import localizationService from "@/services/general/LocalizationService";

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
      type: Object as PropType<EntityType>,
      required: true,
    },
  },
  data() {
    return {
      imageEditData: {
        file: undefined,
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
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    async submitForm() {
      try {
        if (!this.imageEditData.file && !this.imageEditData.date) {
          ToastService.showError({ key: 'image.edit.min_field', fallback: 'Please fill at least one field' });
          return;
        }
        this.isLoading = true;
        const response = await ImageService.editImage(
          this.image.id,
          this.entityType,
          this.imageEditData.date,
          this.imageEditData.file
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
        const response = await ImageService.deleteImage(this.image.id, this.entityType);
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
