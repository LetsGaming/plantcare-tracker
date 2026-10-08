<template>
  <ion-modal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ title }}</ion-title>
        <ion-buttons slot="end">
          <icon-button :icon="closeOutline" :label="t('a11y.close')" @press="$emit('close')" />
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <form class="record-form" @submit.prevent="submit">
        <div class="field">
          <label class="field-label" :for="dateInputId">{{ t("plantdetail.modal_date") }}</label>
          <input
            :id="dateInputId"
            v-model="dayKey"
            class="date-input"
            type="date"
            required
            :max="todayKey"
            :disabled="pending"
          />
        </div>

        <fieldset class="field" :disabled="pending">
          <legend class="field-label">{{ t("plantdetail.modal_fertilizer") }}</legend>
          <ion-radio-group v-model="fertilizerId">
            <ion-radio
              v-for="option in fertilizerOptions"
              :key="option.value"
              class="fertilizer-option"
              label-placement="end"
              justify="start"
              :value="option.value"
            >
              {{ option.label }}
            </ion-radio>
          </ion-radio-group>
        </fieldset>

        <ion-button type="submit" expand="block" :disabled="pending || !dayKey">
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
          @click="$emit('delete')"
        >
          {{ t("plantdetail.modal_delete") }}
        </ion-button>
      </form>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonContent,
  IonButton,
  IonSpinner,
  IonRadioGroup,
  IonRadio,
} from "@ionic/vue";
import { closeOutline } from "ionicons/icons";
import IconButton from "@/components/ui/IconButton.vue";
import localizationService from "@/services/general/LocalizationService";
import { dayKeyToMillis, toDayKey } from "@/utils/localDate";

export interface WateringDraft {
  date: number;
  fertilizerTypeId: number | undefined;
}

let modalCount = 0;

export default defineComponent({
  name: "WateringRecordModal",
  components: {
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonButton,
    IonSpinner,
    IonRadioGroup,
    IonRadio,
    IconButton,
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
  setup() {
    return { closeOutline };
  },
  data() {
    return {
      dayKey: "",
      fertilizerId: -1,
      dateInputId: `watering-date-${++modalCount}`,
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
  },
  watch: {
    isOpen: {
      immediate: true,
      handler(open: boolean) {
        if (open) this.resetDraft();
      },
    },
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
    resetDraft() {
      if (this.mode === "edit" && this.record) {
        this.dayKey = toDayKey(this.record.date_millis);
        this.fertilizerId = this.record.fertilizerTypeId ?? -1;
      } else {
        this.dayKey = this.initialDay || this.todayKey;
        this.fertilizerId = -1;
      }
    },
    submit() {
      if (!this.dayKey || this.pending) return;
      const unchangedDay =
        this.mode === "edit" && this.record && toDayKey(this.record.date_millis) === this.dayKey;
      const draft: WateringDraft = {
        date: unchangedDay ? this.record!.date_millis : dayKeyToMillis(this.dayKey),
        fertilizerTypeId: this.fertilizerId === -1 ? undefined : this.fertilizerId,
      };
      this.$emit("submit", draft);
    },
  },
});
</script>

<style scoped>
.record-form {
  display: grid;
  gap: var(--space-4);
  max-width: 520px;
  margin: 0 auto;
  padding: var(--space-4);
  box-sizing: border-box;
}

.field {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.field-label {
  padding: 0;
  font-weight: 600;
  font-size: var(--text-sm);
}

.date-input {
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  box-sizing: border-box;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--ion-text-color);
  font: inherit;
}

.fertilizer-option {
  min-height: var(--tap-min);
}
</style>
