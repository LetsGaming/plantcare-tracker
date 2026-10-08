<template>
  <div class="field-wrapper">
    <IonItem :class="{ 'field-invalid': !!error }">
      <IonInput
        v-model="localValue"
        :type="isDateOnly ? 'date' : 'datetime-local'"
        label-placement="stacked"
        :required="field.required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? messageId : undefined"
        @ionBlur="$emit('blur')"
      >
        <div slot="label">
          {{ translateFieldLabel() }}
          <RequiredMark v-if="field.required" />
        </div>
      </IonInput>
    </IonItem>
    <FieldError :id="messageId" :message="error" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonInput } from "@ionic/vue";
import FieldError from "@/components/formcomponent/FieldError.vue";
import RequiredMark from "@/components/formcomponent/RequiredMark.vue";
import { fieldErrorProp, nextFieldId } from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "DateFieldComponent",
  emits: ["update:modelValue", "blur"],
  components: { IonItem, IonInput, FieldError, RequiredMark },
  props: {
    field: {
      type: Object as () => DateField,
      required: true,
    },
    modelValue: {
      type: Number,
      default: undefined,
    },
    ...fieldErrorProp,
  },
  data() {
    return { messageId: nextFieldId("field-msg") };
  },
  mounted() {
    if (this.field.defaultValue !== undefined) {
      this.localValue = this.field.defaultValue;
    } else if (this.modelValue === undefined) {
      this.$emit("update:modelValue", Date.now());
    }
  },
  computed: {
    isDateOnly(): boolean {
      return this.field.mode === "date";
    },
    localValue: {
      get() {
        const value = this.modelValue;
        return this.formatDateForInput(value !== undefined ? value : Date.now());
      },
      set(val: string) {
        if (!val) return;
        this.$emit("update:modelValue", this.convertToMillis(val));
      },
    },
  },
  methods: {
    /** Format for the input element: yyyy-MM-dd or yyyy-MM-ddThh:mm in local time. */
    formatDateForInput(date: number): string {
      const parsedDate = new Date(date);

      const year = parsedDate.getFullYear();
      const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
      const day = String(parsedDate.getDate()).padStart(2, "0");
      if (this.isDateOnly) return `${year}-${month}-${day}`;
      const hours = String(parsedDate.getHours()).padStart(2, "0");
      const minutes = String(parsedDate.getMinutes()).padStart(2, "0");

      return `${year}-${month}-${day}T${hours}:${minutes}`;
    },

    convertToMillis(date: string): number {
      if (this.isDateOnly) {
        const [year, month, day] = date.split("-").map(Number);
        return new Date(year, month - 1, day).getTime();
      }
      return new Date(date).getTime();
    },
    translateFieldLabel(): string {
      return localizationService.t(this.field.label, undefined, this.field.label);
    },
  },
});
</script>

<style scoped>
.field-wrapper {
  margin-bottom: var(--space-3);
}

.field-invalid {
  --border-color: var(--ion-color-danger);
}
</style>
