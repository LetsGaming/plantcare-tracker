<template>
  <BaseFormModal
    :isOpen="isOpen"
    modalTitle="profile.edit.title"
    formTitle="profile.edit.form_title"
    submitLabel="profile.edit.submit"
    :formData="profileData"
    :formFields="formFields"
    :field-errors="fieldErrors"
    :is-loading="isLoading"
    @submit="submit"
    @close="$emit('close')"
  >
    <p class="signout-note">{{ t("account.signout_note") }}</p>

    <section v-if="showDelete" class="danger-zone" aria-labelledby="danger-zone-title">
      <h3 id="danger-zone-title" class="danger-title">{{ t("account.delete_heading") }}</h3>
      <p class="danger-text">{{ t("account.delete_summary") }}</p>
      <IonButton
        class="danger-button"
        color="danger"
        fill="outline"
        :disabled="isLoading"
        @click="showConfirm = true"
      >
        {{ t("account.delete_button") }}
      </IonButton>
    </section>
  </BaseFormModal>

  <ConfirmDialog
    :is-open="showConfirm"
    :title="t('account.delete_title', { name: accountName })"
    :message="t('account.delete_message', { name: accountName })"
    :confirm-label="t('account.delete_confirm')"
    :require-text="accountName"
    :require-label="t('account.delete_type_label', { name: accountName })"
    :loading="isLoading"
    danger
    @confirm="$emit('delete')"
    @cancel="showConfirm = false"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonButton } from "@ionic/vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import ConfirmDialog from "@/components/modal/ConfirmDialog.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "ProfileEditingModal",
  components: { BaseFormModal, ConfirmDialog, IonButton },
  props: {
    isOpen: { type: Boolean, required: true },
    isLoading: { type: Boolean, default: false },
    profileData: {
      type: Object as PropType<EditProfile>,
      required: true,
    },
    formFields: {
      type: Array as PropType<FormField[]>,
      required: true,
    },
    showDelete: { type: Boolean, default: false },
    /** The signed-in username; the user types it to confirm deleting the account. */
    accountName: { type: String, default: "" },
    fieldErrors: { type: Object as PropType<Record<string, string>>, default: () => ({}) },
  },
  emits: ["close", "save", "delete"],
  data() {
    return { showConfirm: false };
  },
  watch: {
    isOpen(open: boolean) {
      if (!open) this.showConfirm = false;
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string>) {
      return localizationService.t(key, vars, key);
    },
    submit() {
      this.$emit("save", { ...this.profileData });
    },
  },
});
</script>

<style scoped>
.signout-note {
  margin: 0 auto var(--space-4);
  padding: 0 var(--space-4);
  max-width: 560px;
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

.danger-zone {
  max-width: 560px;
  margin: 0 auto var(--space-6);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-2);
  border-top: 1px solid var(--line);
}

.danger-title {
  font-size: var(--text-md);
  color: var(--ion-color-danger);
}

.danger-text {
  margin: 0;
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

.danger-button {
  justify-self: start;
}
</style>
