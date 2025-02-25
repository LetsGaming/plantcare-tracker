<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader headerTitle="Komponente bearbeiten" @close="$emit('close')" />
    <IonContent>
      <form-component
        :item="editComponentData"
        :formFields="[
          { type: 'input', modelKey: 'name', label: 'Name', required: false },
          {
            type: 'input',
            modelKey: 'fineness',
            label: 'Feinheit',
            required: false,
          },
        ]"
        cardTitle="Komponenten Informationen"
        submitLabel="Komponente editieren"
        @submitClick="editComponent"
      />
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonModal, IonContent } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import FormComponent from "@/components/adding/FormComponent.vue";

import ComponentService from "@/services/ComponentService";

export default defineComponent({
  name: "ComponentEditingModal",
  emits: ["close"],
  components: {
    IonModal,
    IonContent,
    ModalHeader,
    FormComponent,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    component: {
      type: Object as PropType<Component>,
      required: true,
    },
  },
  data() {
    return {
      editComponentData: {
        name: undefined,
        fineness: undefined,
      } as EditComponent,
    };
  },
  methods: {
    async editComponent() {
      try {
        if (this.editComponentData.name === undefined) {
          this.editComponentData.name = this.component.name;
        }
        if (this.editComponentData.fineness === undefined) {
          this.editComponentData.fineness = this.component.fineness;
        }
        await ComponentService.editComponent(
          this.component.id,
          this.editComponentData
        );
        this.$emit("close");
        this.$router.push({name: "component-overview"});
      } catch (error) {
        console.error(error);
      }
    },
  },
});
</script>
