<template>
  <div class="field-wrapper">
    <IonItem>
      <IonLabel class="date-label">{{ field.label }}</IonLabel>
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

export default defineComponent({
  name: "DateFieldComponent",
  components: { IonItem, IonLabel, IonInput, RequiredNote },
  props: {
    field: {
      type: Object as () => DateField,
      required: true,
    },
    modelValue: {
      type: String,
      default: "",
    },
  },
  computed: {
    localValue: {
      get() {
        if (!this.modelValue) return "";

        // Try to parse manually if modelValue is in DD.MM.YYYY, HH:mm:ss format
        const match =
          typeof this.modelValue === "string" &&
          this.modelValue.match(
            /^(\d{2})\.(\d{2})\.(\d{4}), (\d{2}):(\d{2}):(\d{2})$/
          );
        if (match) {
          const [, day, month, year, hours, minutes] = match;
          return `${year}-${month}-${day}T${hours}:${minutes}`;
        }

        // Otherwise, attempt regular conversion
        const date = new Date(this.modelValue);
        if (isNaN(date.getTime())) return ""; // Handle invalid date

        return date.toISOString().slice(0, 16); // Convert to YYYY-MM-DDTHH:mm
      },
      set(val: string) {
        this.$emit("update:modelValue", val);
      },
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
