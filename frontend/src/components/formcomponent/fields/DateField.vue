<template>
  <FieldShell
    :label="translatedLabel"
    :required="field.required"
    :error="error"
    :hint="translatedHint"
    :message-id="messageId"
    :label-id="labelId"
    @label-click="focusControl"
  >
    <IonInput
      ref="control"
      v-model="localValue"
      :type="isDateOnly ? 'date' : 'datetime-local'"
      :required="field.required"
      :max="field.max"
      :aria-labelledby="labelId"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error || translatedHint ? messageId : undefined"
      @ionBlur="$emit('blur')"
    />
  </FieldShell>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonInput } from "@ionic/vue";
import FieldShell from "@/components/formcomponent/FieldShell.vue";
import {
  fieldErrorProp,
  focusControlRef,
  nextFieldId,
} from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "DateFieldComponent",
  emits: ["update:modelValue", "blur"],
  components: { IonInput, FieldShell },
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
    return { messageId: nextFieldId("field-msg"), labelId: nextFieldId("field-label") };
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
    translatedLabel(): string {
      return localizationService.t(this.field.label, undefined, this.field.label);
    },
    translatedHint(): string {
      return this.field.hint
        ? localizationService.t(this.field.hint, undefined, this.field.hint)
        : "";
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
    focusControl() {
      focusControlRef(this.$refs.control);
    },
  },
});
</script>
