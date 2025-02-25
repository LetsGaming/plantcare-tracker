<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader headerTitle="Komponente hinzufügen" @close="$emit('close')" />
    <IonContent>
      <FormComponent
        :item="component"
        :formFields="[
          { type: 'input', modelKey: 'name', label: 'Name', required: true },
          {
            type: 'input',
            modelKey: 'fineness',
            label: 'Feinheit',
            required: true,
          },
          {
            type: 'file',
            modelKey: 'image',
            label: 'Bild hochladen',
          },
        ]"
        cardTitle="Komponenten Informationen"
        submitLabel="Komponente hinzufügen"
        @submitClick="addComponent"
      />
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonModal, IonContent } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import FormComponent from "@/components/adding/FormComponent.vue";

import ComponentService from "@/services/ComponentService";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  name: "ComponentAddingModal",
  components: {
    IonModal,
    IonContent,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
  },
  data() {
    return {
      component: {
        name: "",
        fineness: "",
      } as AddComponent,
    };
  },
  methods: {
    async addComponent() {
      if (!this.component.name || !this.component.fineness) {
        ToastService.showWarning("All fields are required!");
        return;
      }
      try {
        const response = await ComponentService.addComponent(this.component);
        if (response) {
          const componentId = response.componentId;
          if (!this.component.image) {
            this.$emit("close");
            this.$router.push({ name: "component-overview" });
          } else {
            await this.imageUpload(componentId, this.component.image);
          }
        }
      } catch (error) {
        console.error("Error adding component:", error);
      }
    },
    async imageUpload(componentId: number, image: File) {
      try {
        await ComponentService.uploadComponentImage(componentId, image);
        this.$emit("close");
        this.$router.push({ name: "component-overview" });
      } catch (error) {
        console.error("Error uploading image:", error);
      }
    },
  },
});
</script>
