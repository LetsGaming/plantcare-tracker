<template>
  <IonModal
    v-if="mounted"
    :is-open="isOpen"
    :can-dismiss="!loading"
    class="confirm-modal"
    @didDismiss="onDismiss"
    @didPresent="onPresent"
  >
    <div
      class="confirm"
      role="alertdialog"
      :aria-labelledby="titleId"
      :aria-describedby="message ? messageId : undefined"
    >
      <h2 :id="titleId" class="confirm-title">{{ title }}</h2>
      <p v-if="message" :id="messageId" class="confirm-message">{{ message }}</p>
      <slot />

      <FieldShell
        v-if="requireText"
        class="confirm-guard"
        :label="requireLabel"
        :error="mismatch ? mismatchText : ''"
        :message-id="guardMessageId"
        :label-id="guardLabelId"
        @label-click="focusGuard"
      >
        <IonInput
          ref="guard"
          v-model="typed"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          enterkeyhint="done"
          :aria-labelledby="guardLabelId"
          :aria-describedby="mismatch ? guardMessageId : undefined"
          :aria-invalid="mismatch ? 'true' : undefined"
          @ionBlur="guardTouched = true"
          @keyup.enter="confirm"
        />
      </FieldShell>

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
import { IonModal, IonButton, IonInput, IonSpinner } from "@ionic/vue";
import FieldShell from "@/components/formcomponent/FieldShell.vue";
import { focusControlRef, nextFieldId } from "@/components/formcomponent/fieldShared";
import { useMountWhileOpen } from "@/components/modal/useMountWhileOpen";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "ConfirmDialog",
  components: { IonModal, IonButton, IonInput, IonSpinner, FieldShell },
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
  emits: ["confirm", "cancel", "closed"],
  setup(props) {
    return useMountWhileOpen(() => props.isOpen);
  },
  data() {
    return {
      typed: "",
      guardTouched: false,
      titleId: nextFieldId("confirm-title"),
      messageId: nextFieldId("confirm-message"),
      guardMessageId: nextFieldId("field-msg"),
      guardLabelId: nextFieldId("field-label"),
    };
  },
  computed: {
    cancelText(): string {
      return this.cancelLabel || localizationService.t("modal.cancel", undefined, "Cancel");
    },
    guardPassed(): boolean {
      if (!this.requireText) return true;
      return this.typed.trim().toLowerCase() === this.requireText.trim().toLowerCase();
    },
    mismatch(): boolean {
      return this.guardTouched && this.typed.trim() !== "" && !this.guardPassed;
    },
    mismatchText(): string {
      return localizationService.t(
        "modal2.confirm_mismatch",
        { text: this.requireText },
        `That does not match yet. Type "${this.requireText}" exactly.`,
      );
    },
  },
  methods: {
    onPresent() {
      this.typed = "";
      this.guardTouched = false;
      if (this.requireText) focusControlRef(this.$refs.guard);
    },
    focusGuard() {
      focusControlRef(this.$refs.guard);
    },
    confirm() {
      if (this.loading || !this.guardPassed) return;
      this.$emit("confirm");
    },
    cancel() {
      if (!this.loading) this.$emit("cancel");
    },
    onDismiss() {
      if (this.isOpen) this.$emit("cancel");
      this.release();
      this.$emit("closed");
    },
  },
});
</script>

<style scoped>
.confirm-modal {
  --width: min(92vw, 440px);
  --max-width: calc(100vw - var(--space-6));
  --height: auto;
  --max-height: calc(100dvh - var(--space-6));
  --border-radius: var(--radius-lg);
  --background: var(--surface-raised);
  --box-shadow: var(--shadow-lift);
}

.confirm {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
}

.confirm-title {
  font-size: var(--text-lg);
  overflow-wrap: anywhere;
}

.confirm-message {
  margin: 0;
  color: var(--ink-soft);
  white-space: pre-line;
}

.confirm-guard {
  margin: 0;
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
  margin: 0;
}

@media (max-width: 480px) {
  .confirm-actions {
    flex-direction: column;
  }

  .confirm-actions ion-button {
    flex: none;
  }
}
</style>

<style>
ion-modal.confirm-modal.confirm-modal.modal-default.modal-default {
  --backdrop-opacity: 0.5;
}
</style>
