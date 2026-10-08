<template>
  <ion-modal v-if="mounted" :is-open="isOpen" @did-dismiss="onDismiss">
    <modal-header :header-title="title" @close="$emit('close')" />

    <ion-content>
      <form class="record-form" novalidate @submit.prevent="submit">
        <date-field v-model="dateMillis" :field="dateField" />

        <radio-field v-model="fertilizerId" :field="fertilizerField" />

        <ion-button type="submit" expand="block" :disabled="pending || !dateMillis">
          <ion-spinner v-if="pending" name="crescent" slot="start" />
          {{ pending ? t("plantdetail.modal_saving") : t("plantdetail.modal_save") }}
        </ion-button>

        <ion-button
          v-if="mode === 'edit'"
          type="button"
          expand="block"
          fill="outline"
          color="danger"
          :disabled="pending"
          @click="showDelete = true"
        >
          {{ t("plantdetail.modal_delete") }}
        </ion-button>
      </form>
    </ion-content>
  </ion-modal>

  <confirm-dialog
    :is-open="showDelete"
    :title="t('modal2.watering_delete_title', { date: recordDateText })"
    :message="t('modal2.watering_delete_message')"
    :confirm-label="t('plantdetail.modal_delete')"
    :loading="pending"
    danger
    @confirm="confirmDelete"
    @cancel="showDelete = false"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonModal, IonContent, IonButton, IonSpinner } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import ConfirmDialog from "@/components/modal/ConfirmDialog.vue";
import DateField from "@/components/formcomponent/fields/DateField.vue";
import RadioField from "@/components/formcomponent/fields/RadioField.vue";
import { useMountWhileOpen } from "@/components/modal/useMountWhileOpen";
import localizationService from "@/services/general/LocalizationService";
import { dayKeyToMillis, formatLongDate, toDayKey } from "@/utils/localDate";

export interface WateringDraft {
  date: number;
  fertilizerTypeId: number | undefined;
}

export default defineComponent({
  name: "WateringRecordModal",
  components: {
    IonModal,
    IonContent,
    IonButton,
    IonSpinner,
    ModalHeader,
    ConfirmDialog,
    DateField,
    RadioField,
  },
  props: {
    isOpen: { type: Boolean, required: true },
    mode: { type: String as PropType<"add" | "edit">, default: "add" },
    /** Day (YYYY-MM-DD) preselected when adding. */
    initialDay: { type: String, default: "" },
    /** The record being edited. */
    record: { type: Object as PropType<WateringRecord | null>, default: null },
    fertilizerOptions: {
      type: Array as PropType<{ label: string; value: number }[]>,
      required: true,
    },
    pending: { type: Boolean, default: false },
  },
  emits: ["close", "submit", "delete"],
  setup(props) {
    return useMountWhileOpen(() => props.isOpen);
  },
  data() {
    return {
      dateMillis: undefined as number | undefined,
      fertilizerId: -1,
      showDelete: false,
    };
  },
  computed: {
    todayKey(): string {
      return toDayKey(Date.now());
    },
    title(): string {
      return this.t(
        this.mode === "edit" ? "plantdetail.modal_edit_title" : "plantdetail.modal_add_title",
      );
    },
    dateField(): DateField {
      return {
        type: "date",
        modelKey: "date",
        label: "plantdetail.modal_date",
        mode: "date",
        required: true,
        max: this.todayKey,
      };
    },
    fertilizerField(): RadioField {
      return {
        type: "radio",
        modelKey: "fertilizer",
        label: "plantdetail.modal_fertilizer",
        options: this.fertilizerOptions,
      };
    },
    recordDateText(): string {
      const millis = this.record?.date_millis ?? this.dateMillis ?? Date.now();
      return formatLongDate(millis, localizationService.getLocale());
    },
  },
  watch: {
    isOpen: {
      immediate: true,
      handler(open: boolean) {
        if (open) this.resetDraft();
        else this.showDelete = false;
      },
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string>) {
      return localizationService.t(key, vars, key);
    },
    resetDraft() {
      this.showDelete = false;
      if (this.mode === "edit" && this.record) {
        this.dateMillis = this.record.date_millis;
        this.fertilizerId = this.record.fertilizerTypeId ?? -1;
      } else {
        this.dateMillis = dayKeyToMillis(this.initialDay || this.todayKey);
        this.fertilizerId = -1;
      }
    },
    onDismiss() {
      this.$emit("close");
      this.release();
    },
    submit() {
      if (this.dateMillis === undefined || this.pending) return;
      const dayKey = toDayKey(this.dateMillis);
      const unchangedDay =
        this.mode === "edit" && this.record && toDayKey(this.record.date_millis) === dayKey;
      const draft: WateringDraft = {
        date: unchangedDay ? this.record!.date_millis : dayKeyToMillis(dayKey),
        fertilizerTypeId: this.fertilizerId === -1 ? undefined : this.fertilizerId,
      };
      this.$emit("submit", draft);
    },
    confirmDelete() {
      this.showDelete = false;
      this.$emit("delete");
    },
  },
});
</script>

<style scoped>
.record-form {
  display: grid;
  gap: var(--space-2);
  max-width: 520px;
  margin: 0 auto;
  padding: var(--space-4);
  box-sizing: border-box;
}
</style>
