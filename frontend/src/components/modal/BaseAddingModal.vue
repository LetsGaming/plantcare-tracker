<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader :headerTitle="modalTitle" @close="$emit('close')" />
    <IonContent>
      <FormComponent
        :item="formData"
        :formFields="formFields"
        :cardTitle="formTitle"
        :submitLabel="submitLabel"
        :extra-content-component="extraContentComponent"
        :extra-content-data="extraContentData"
        @submitClick="submitHandler"
      />
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonModal, IonContent } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import FormComponent from "@/components/FormComponent.vue";

export default defineComponent({
  name: "BaseModal",
  components: {
    IonModal,
    IonContent,
    ModalHeader,
    FormComponent,
  },
  props: {
    isOpen: { type: Boolean, required: true },
    modalTitle: { type: String, required: true },
    formTitle: { type: String, required: true },
    submitLabel: { type: String, required: true },
    formData: { type: Object, required: true },
    formFields: { type: Array as PropType<FormField[]>, required: true },
    extraContentComponent: { type: Object as PropType<any> },
    extraContentData: { type: Object as PropType<Record<string, any>> },
  },
  emits: ["close", "submit"],
  methods: {
    submitHandler() {
      this.$emit("submit", this.formData);
    },
  },
});
</script>
