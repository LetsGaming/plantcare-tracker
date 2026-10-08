<template>
  <IonModal
    :is-open="isOpen"
    :can-dismiss="!loading"
    class="confirm-modal"
    @didDismiss="onDismiss"
    @didPresent="typed = ''"
  >
    <div class="confirm" role="alertdialog" :aria-label="title">
      <h2 class="confirm-title">{{ title }}</h2>
      <p v-if="message" class="confirm-message">{{ message }}</p>
      <slot />

      <IonItem v-if="requireText" class="confirm-guard" lines="none">
        <IonInput
          v-model="typed"
          :label="requireLabel"
          label-placement="stacked"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          enterkeyhint="done"
          @keyup.enter="confirm"
        />
      </IonItem>

      <div class="confirm-actions">
        <IonButton fill="outline" color="medium" :disabled="loading" @click="cancel">
          {{ cancelText }}
        </IonButton>
        <IonButton
          :color="danger ? 'danger' : 'primary'"
          :disabled="loading || !guardPassed"
          @click="confirm"
        >
          <IonSpinner v-if="loading" name="crescent" />
          <span v-else>{{ confirmLabel }}</span>
        </IonButton>
      </div>
    </div>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonModal, IonButton, IonItem, IonInput, IonSpinner } from "@ionic/vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "ConfirmDialog",
  components: { IonModal, IonButton, IonItem, IonInput, IonSpinner },
  props: {
    isOpen: { type: Boolean, required: true },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    confirmLabel: { type: String, required: true },
    cancelLabel: { type: String, default: "" },
    danger: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    /** When set, the confirm button stays disabled until the user types exactly this text. */
    requireText: { type: String, default: "" },
    requireLabel: { type: String, default: "" },
  },
  emits: ["confirm", "cancel"],
  data() {
    return { typed: "" };
  },
  computed: {
    cancelText(): string {
      return this.cancelLabel || localizationService.t("modal.cancel", undefined, "Cancel");
    },
    guardPassed(): boolean {
      if (!this.requireText) return true;
      return this.typed.trim().toLowerCase() === this.requireText.trim().toLowerCase();
    },
  },
  methods: {
    confirm() {
      if (this.loading || !this.guardPassed) return;
      this.$emit("confirm");
    },
    cancel() {
      if (!this.loading) this.$emit("cancel");
    },
    onDismiss() {
      if (this.isOpen) this.$emit("cancel");
    },
  },
});
</script>

<style scoped>
.confirm-modal {
  --width: min(92vw, 440px);
  --height: auto;
  --border-radius: var(--radius-lg);
  --background: var(--surface-raised);
}

.confirm {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
}

.confirm-title {
  font-size: var(--text-lg);
}

.confirm-message {
  margin: 0;
  color: var(--ink-soft);
  white-space: pre-line;
}

.confirm-guard {
  --padding-start: 0;
}

.confirm-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.confirm-actions ion-button {
  flex: 1 1 140px;
}
</style>
