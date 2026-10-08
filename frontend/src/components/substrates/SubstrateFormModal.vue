<template>
  <IonModal
    :is-open="isOpen"
    :can-dismiss="canDismissModal"
    @didPresent="captureBaseline"
    @didDismiss="onDidDismiss"
  >
    <ModalHeader :headerTitle="title" @close="requestClose" />

    <IonContent>
      <FormComponent
        v-if="step === 1"
        :item="form"
        :formFields="formFields"
        :cardTitle="t('substrate.info.title')"
        submitLabel="form.next"
        :is-loading="isLoading"
        :onSubmitClick="goToComponents"
        :onDeleteClick="deletable ? emitDelete : undefined"
        :delete-label="form.name"
      />

      <div v-else class="step-components">
        <ComponentSelection
          :title="selectionTitle"
          :components="availableComponents"
          :selectedComponentIds="selectedComponentIds"
          :componentParts="componentParts"
          :show-errors="showPartErrors"
          @toggle-component="toggleComponent"
          @update-part="setPart"
        />

        <p v-if="!selectionValid" class="selection-hint">
          {{ selectionHint }}
        </p>

        <div class="action-buttons">
          <IonButton fill="outline" color="medium" :disabled="isLoading" @click="step = 1">
            {{ t("action.back") }}
          </IonButton>

          <IonButton color="primary" :disabled="isLoading || !selectionValid" @click="submit">
            <IonSpinner v-if="isLoading" name="crescent" />
            <span v-else>{{ t("substrate.save") }}</span>
          </IonButton>
        </div>
      </div>
    </IonContent>
  </IonModal>

  <ConfirmDialog
    :is-open="showDiscard"
    :title="t('form2.discard_title')"
    :message="t('form2.discard_message')"
    :confirm-label="t('form2.discard_confirm')"
    :cancel-label="t('form2.keep_editing')"
    danger
    @confirm="discard"
    @cancel="showDiscard = false"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonModal, IonContent, IonButton, IonSpinner } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import ConfirmDialog from "@/components/modal/ConfirmDialog.vue";
import FormComponent from "@/components/formcomponent/FormComponent.vue";
import ComponentSelection from "@/components/substrates/ComponentSelection.vue";
import localizationService from "@/services/general/LocalizationService";
import { formSnapshot } from "@/utils/formState";
import { parsePart, selectionIsValid } from "@/utils/substrateParts";

interface SubstrateDraft {
  name: string;
  isPublic: boolean;
  image: File | null;
}

const blankForm = (): SubstrateDraft => ({ name: "", isPublic: false, image: null });

/** Two-step substrate editor shared by the add and edit modals: details, then components with parts. */
export default defineComponent({
  name: "SubstrateFormModal",
  emits: ["close", "save", "delete"],
  components: {
    IonModal,
    IonContent,
    IonButton,
    IonSpinner,
    ModalHeader,
    ConfirmDialog,
    FormComponent,
    ComponentSelection,
  },
  props: {
    isOpen: { type: Boolean, required: true },
    isLoading: { type: Boolean, default: false },
    title: { type: String, required: true },
    selectionTitle: { type: String, required: true },
    availableComponents: { type: Array as PropType<SubstrateComponent[]>, required: true },
    /** Existing substrate to edit; null starts an empty draft. */
    substrate: { type: Object as PropType<Substrate | null>, default: null },
    /** Offer the picture field (new substrates only; existing ones change pictures on the detail page). */
    allowImage: { type: Boolean, default: false },
    deletable: { type: Boolean, default: false },
  },
  data() {
    return {
      step: 1,
      form: blankForm(),
      selectedComponentIds: [] as number[],
      componentParts: {} as Record<number, number | string>,
      showPartErrors: false,
      baseline: null as string | null,
      showDiscard: false,
    };
  },
  created() {
    this.resetDraft();
  },
  computed: {
    formFields(): FormField[] {
      const fields: FormField[] = [
        {
          type: "input",
          modelKey: "name",
          label: this.t("substrate.field.name"),
          required: true,
          autocapitalize: "words",
          enterkeyhint: "done",
        },
        {
          type: "radio",
          modelKey: "isPublic",
          label: this.t("substrate.field.visibility"),
          options: [
            { value: true, label: this.t("substrate.visibility.public") },
            { value: false, label: this.t("substrate.visibility.private") },
          ],
          defaultValue: Boolean(this.substrate?.isPublic),
        },
      ];
      if (this.allowImage) {
        fields.push({ type: "file", modelKey: "image", label: this.t("plant.image.upload") });
      }
      return fields;
    },
    selectionValid(): boolean {
      return selectionIsValid(this.selectedComponentIds, this.componentParts);
    },
    selectionHint(): string {
      return this.selectedComponentIds.length === 0
        ? this.t("substrate.select_component_required")
        : this.t("component.selection.error_positive");
    },
    isDirty(): boolean {
      return this.baseline !== null && this.currentSnapshot() !== this.baseline;
    },
  },
  watch: {
    isOpen(open: boolean) {
      this.baseline = null;
      if (open) this.resetDraft();
      else this.showDiscard = false;
    },
    "substrate.id"() {
      this.resetDraft();
    },
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
    currentSnapshot(): string {
      return `${formSnapshot(this.form)}|${JSON.stringify([
        [...this.selectedComponentIds].sort(),
        this.selectedComponentIds.map((id) => [id, String(this.componentParts[id] ?? "")]),
      ])}`;
    },
    captureBaseline() {
      this.baseline = this.currentSnapshot();
    },
    resetDraft() {
      this.step = 1;
      this.showPartErrors = false;
      const source = this.substrate;
      this.form = source
        ? { name: source.name, isPublic: source.isPublic, image: null }
        : blankForm();
      this.selectedComponentIds = source ? source.components.map((c) => c.id) : [];
      this.componentParts = source
        ? Object.fromEntries(source.components.map((c) => [c.id, c.parts]))
        : {};
    },
    goToComponents() {
      this.step = 2;
    },
    setPart(id: number, value: number | string) {
      this.componentParts[id] = value;
    },
    toggleComponent(id: number) {
      const index = this.selectedComponentIds.indexOf(id);
      if (index > -1) {
        this.selectedComponentIds.splice(index, 1);
        delete this.componentParts[id];
      } else {
        this.selectedComponentIds.push(id);
      }
    },
    submit() {
      if (!this.selectionValid) {
        this.showPartErrors = true;
        return;
      }
      const parts: Record<number, number> = {};
      for (const id of this.selectedComponentIds) {
        parts[id] = parsePart(this.componentParts[id]) as number;
      }
      this.$emit("save", {
        meta: { ...this.form },
        componentIds: [...this.selectedComponentIds],
        parts,
      });
    },
    emitDelete() {
      this.$emit("delete", this.substrate?.id);
    },
    requestClose() {
      if (this.isLoading) return;
      if (this.isDirty) {
        this.showDiscard = true;
        return;
      }
      this.$emit("close");
    },
    discard() {
      this.showDiscard = false;
      this.$emit("close");
    },
    canDismissModal(): Promise<boolean> {
      if (!this.isOpen) return Promise.resolve(true);
      if (this.isLoading) return Promise.resolve(false);
      if (this.isDirty) {
        this.showDiscard = true;
        return Promise.resolve(false);
      }
      return Promise.resolve(true);
    },
    onDidDismiss() {
      this.$emit("close");
    },
  },
});
</script>

<style scoped>
.step-components {
  display: grid;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
}

.selection-hint {
  margin: 0 auto;
  padding: 0 var(--space-4);
  max-width: 720px;
  width: 100%;
  box-sizing: border-box;
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

.action-buttons {
  display: flex;
  gap: var(--space-3);
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 0 var(--space-4);
  box-sizing: border-box;
}

.action-buttons ion-button {
  flex: 1;
}
</style>
