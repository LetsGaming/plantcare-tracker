<template>
  <IonModal
    v-if="mounted"
    :is-open="isOpen"
    :can-dismiss="canDismissModal"
    @didPresent="captureBaseline"
    @didDismiss="onDidDismiss"
  >
    <ModalHeader :headerTitle="title" @close="requestClose" />

    <div class="steps-bar">
      <p class="steps-label">{{ t("modal2.step_of", { current: step, total: 2 }) }}</p>
      <ol class="steps" :aria-label="t('modal2.steps_label')">
        <li
          v-for="(name, index) in stepNames"
          :key="name"
          class="step"
          :class="{ done: step > index + 1, current: step === index + 1 }"
          :aria-current="step === index + 1 ? 'step' : undefined"
        >
          <span class="step-bar" aria-hidden="true" />
          <span class="step-name">{{ name }}</span>
        </li>
      </ol>
    </div>

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
        :delete-consequence="deleteConsequence"
      />

      <ComponentSelection
        v-else
        :title="selectionTitle"
        :components="availableComponents"
        :selectedComponentIds="selectedComponentIds"
        :componentParts="componentParts"
        :show-errors="showPartErrors"
        @toggle-component="toggleComponent"
        @update-part="setPart"
      />
    </IonContent>

    <IonFooter v-if="step === 2" class="ion-no-border">
      <div class="step-footer">
        <p v-if="!selectionValid" class="selection-hint" role="status">
          {{ selectionHint }}
        </p>
        <div class="action-buttons">
          <IonButton fill="outline" color="medium" :disabled="isLoading" @click="step = 1">
            {{ t("action.back") }}
          </IonButton>

          <IonButton
            class="save-button"
            color="primary"
            :disabled="isLoading || !selectionValid"
            @click="submit"
          >
            <IonSpinner v-if="isLoading" name="crescent" />
            <span v-else>{{ t("substrate.save") }}</span>
          </IonButton>
        </div>
      </div>
    </IonFooter>
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
import { IonModal, IonContent, IonFooter, IonButton, IonSpinner } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import ConfirmDialog from "@/components/modal/ConfirmDialog.vue";
import FormComponent from "@/components/formcomponent/FormComponent.vue";
import ComponentSelection from "@/components/substrates/ComponentSelection.vue";
import localizationService from "@/services/general/LocalizationService";
import { useMountWhileOpen } from "@/components/modal/useMountWhileOpen";
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
    IonFooter,
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
  setup(props) {
    return useMountWhileOpen(() => props.isOpen);
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
    stepNames(): string[] {
      return [this.t("modal2.step_details"), this.t("modal2.step_components")];
    },
    deleteConsequence(): string {
      return this.t("modal2.substrate_delete_consequence");
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
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
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
      this.release();
    },
  },
});
</script>

<style scoped>
.steps-bar {
  padding: var(--space-3) var(--space-4) var(--space-2);
  background: var(--ion-toolbar-background);
}

.steps-label {
  margin: 0 0 var(--space-2);
  color: var(--ink-soft);
  font-size: var(--text-sm);
  font-weight: 600;
}

.steps {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: grid;
  gap: var(--space-1);
  color: var(--ink-soft);
  font-size: var(--text-xs);
}

.step-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--line);
}

.step.done .step-bar,
.step.current .step-bar {
  background: var(--ion-color-primary);
}

.step.current {
  color: var(--ion-text-color);
  font-weight: 700;
}

.step-footer {
  display: grid;
  gap: var(--space-2);
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-3) var(--space-4);
  box-sizing: border-box;
  border-top: 1px solid var(--line);
  background: var(--ion-toolbar-background);
}

.selection-hint {
  margin: 0;
  color: var(--ion-text-color);
  font-size: var(--text-sm);
  font-weight: 600;
}

.action-buttons {
  display: flex;
  gap: var(--space-3);
}

.action-buttons ion-button {
  flex: 1;
  margin: 0;
}
</style>
