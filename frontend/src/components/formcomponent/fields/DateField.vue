<template>
  <div class="field-wrapper">
    <IonItem>
      <IonLabel class="date-label">{{ translateFieldLabel() }}</IonLabel>
      <IonInput
        v-model="localValue"
        type="datetime-local"
        class="custom-datetime"
      />
      <RequiredNote v-if="field.required" />
    </IonItem>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonLabel, IonInput } from "@ionic/vue";
import RequiredNote from "@/components/formcomponent/RequiredNote.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "DateFieldComponent",
  components: { IonItem, IonLabel, IonInput, RequiredNote },
  props: {
    field: {
      type: Object as () => DateField,
      required: true,
    },
    modelValue: {
      type: Number,
      default: undefined,
    },
  },
  mounted() {
    // Set default value if provided
    if (this.field.defaultValue !== undefined) {
      this.localValue = this.field.defaultValue;
    }
  },
  computed: {
    localValue: {
      get() {
        let value = this.modelValue;
        return this.formatDateForInput(
          value !== undefined ? value : Date.now()
        );
      },
      set(val: string) {
        // Convert the local input back to the user's local timezone
        const localDate = this.convertToMillis(val);
        this.$emit("update:modelValue", localDate);
      },
    },
  },
  methods: {
    // Format the date for the input element in the correct format (yyyy-MM-ddThh:mm)
    formatDateForInput(date: number): string {
      const parsedDate = new Date(date);

      const year = parsedDate.getFullYear();
      const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
      const day = String(parsedDate.getDate()).padStart(2, "0");
      const hours = String(parsedDate.getHours()).padStart(2, "0");
      const minutes = String(parsedDate.getMinutes()).padStart(2, "0");

      return `${year}-${month}-${day}T${hours}:${minutes}`;
    },

    // Convert the local value back to the local timezone
    convertToMillis(date: string): number {
      const parsedDate = new Date(date);
      return parsedDate.getTime();
    },
    translateFieldLabel(): string {
      // Placeholder for localization logic if needed
      return localizationService.t(
        this.field.label,
        undefined,
        this.field.label
      );
    },
  },
});
</script>

<style scoped>
.field-wrapper {
  margin-bottom: 16px;
}

.custom-datetime {
  margin-left: 16px;
  width: 100%;
  font-size: 16px;
  padding-left: 8px !important;
  padding-right: 8px !important;
  border-radius: 8px;
  border: 1px solid var(--ion-color-medium);
  background: var(--ion-background-color);
  color: var(--ion-text-color);
}

@media screen and (max-width: 768px) {
  .date-label {
    display: none;
  }
}
</style>
