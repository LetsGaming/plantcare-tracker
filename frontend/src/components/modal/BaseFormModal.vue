<template>
  <IonModal
    v-if="mounted"
    :is-open="isOpen"
    :can-dismiss="canDismissModal"
    @didPresent="captureBaseline"
    @didDismiss="onDidDismiss"
  >
    <ModalHeader :headerTitle="modalTitle" @close="requestClose" />
    <IonContent>
      <FormComponent
        :item="formData"
        :formFields="formFields"
        :cardTitle="formTitle"
        :submitLabel="submitLabel"
        :extra-content-component="extraContentComponent"
        :extra-content-data="extraContentData"
        :is-loading="isLoading"
        :delete-label="deleteLabel"
        :delete-consequence="deleteConsequence"
        :field-errors="fieldErrors"
        :onSubmitClick="submitHandler"
        :onDeleteClick="deleteHandler"
      />
      <slot />
    </IonContent>
  </IonModal>

  <ConfirmDialog
    :is-open="showDiscard"
    :title="t('form2.discard_title', 'Discard your changes?')"
    :message="t('form2.discard_message', 'What you entered has not been saved yet.')"
    :confirm-label="t('form2.discard_confirm', 'Discard')"
    :cancel-label="t('form2.keep_editing', 'Keep editing')"
    danger
    @confirm="discard"
    @cancel="showDiscard = false"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonModal, IonContent } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import ConfirmDialog from "@/components/modal/ConfirmDialog.vue";
import FormComponent from "@/components/formcomponent/FormComponent.vue";
import localizationService from "@/services/general/LocalizationService";
import { useMountWhileOpen } from "@/components/modal/useMountWhileOpen";
import { formSnapshot } from "@/utils/formState";

export default defineComponent({
  name: "BaseFormModal",
  components: {
    IonModal,
    IonContent,
    ModalHeader,
    ConfirmDialog,
    FormComponent,
  },
  props: {
    isLoading: { type: Boolean, required: true },
    isOpen: { type: Boolean, required: true },
    modalTitle: { type: String, required: true },
    formTitle: { type: String, required: true },
    submitLabel: { type: String, required: true },
    formData: { type: Object, required: true },
    formFields: { type: Array as PropType<FormField[]>, required: true },
    extraContentComponent: { type: Object as PropType<any> },
    extraContentData: { type: Object as PropType<Record<string, any>> },
    deleteHandler: { type: Function as PropType<() => void | Promise<void>> },
    deleteLabel: { type: String, default: "" },
    deleteConsequence: { type: String, default: "" },
    fieldErrors: { type: Object as PropType<Record<string, string>>, default: () => ({}) },
    /** Ask before closing while the form holds unsaved input. */
    guardUnsaved: { type: Boolean, default: true },
  },
  emits: ["close", "submit"],
  setup(props) {
    return useMountWhileOpen(() => props.isOpen);
  },
  data() {
    return {
      baseline: null as string | null,
      showDiscard: false,
    };
  },
  computed: {
    isDirty(): boolean {
      return this.baseline !== null && formSnapshot(this.formData) !== this.baseline;
    },
  },
  watch: {
    isOpen(open: boolean) {
      this.baseline = null;
      if (!open) this.showDiscard = false;
    },
  },
  methods: {
    t(key: string, fallback: string) {
      return localizationService.t(key, undefined, fallback);
    },
    captureBaseline() {
      this.baseline = formSnapshot(this.formData);
    },
    submitHandler() {
      this.$emit("submit", this.formData);
    },
    canDismissModal(): Promise<boolean> {
      if (!this.isOpen) return Promise.resolve(true);
      if (this.isLoading) return Promise.resolve(false);
      if (this.guardUnsaved && this.isDirty) {
        this.showDiscard = true;
        return Promise.resolve(false);
      }
      return Promise.resolve(true);
    },
    requestClose() {
      if (this.isLoading) return;
      if (this.guardUnsaved && this.isDirty) {
        this.showDiscard = true;
        return;
      }
      this.$emit("close");
    },
    discard() {
      this.showDiscard = false;
      this.$emit("close");
    },
    onDidDismiss() {
      this.$emit("close");
      this.release();
    },
  },
});
</script>
