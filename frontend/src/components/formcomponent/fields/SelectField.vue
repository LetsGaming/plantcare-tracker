<template>
  <div class="field-wrapper">
    <IonItem :class="{ 'field-invalid': !!error }">
      <IonSelect
        v-model="localValue"
        :placeholder="translatedPlaceholder"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? messageId : undefined"
        @ionBlur="$emit('blur')"
        @ionDismiss="$emit('blur')"
      >
        <div slot="label">
          {{ translatedLabel }}
          <RequiredMark v-if="field.required" />
        </div>
        <IonSelectOption v-for="option in field.options" :key="option.value" :value="option.value">
          {{ t(option.label, undefined, option.label) }}
        </IonSelectOption>
      </IonSelect>
    </IonItem>
    <FieldError :id="messageId" :message="error" :hint="translatedHint" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonSelect, IonSelectOption } from "@ionic/vue";
import FieldError from "@/components/formcomponent/FieldError.vue";
import RequiredMark from "@/components/formcomponent/RequiredMark.vue";
import { fieldErrorProp, nextFieldId } from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "SelectFieldComponent",
  emits: ["update:modelValue", "blur"],
  components: { IonItem, IonSelect, IonSelectOption, FieldError, RequiredMark },
  props: {
    field: {
      type: Object as () => SelectField,
      required: true,
    },
    modelValue: {
      type: [String, Number],
      default: "",
    },
    ...fieldErrorProp,
  },
  data() {
    return { messageId: nextFieldId("field-msg") };
  },
  computed: {
    translatedLabel(): string {
      return localizationService.t(this.field.label, undefined, this.field.label);
    },
    translatedPlaceholder(): string {
      return localizationService.t(
        this.field.placeholder || "",
        undefined,
        this.field.placeholder || "",
      );
    },
    translatedHint(): string {
      return this.field.hint
        ? localizationService.t(this.field.hint, undefined, this.field.hint)
        : "";
    },
    localValue: {
      get() {
        return this.modelValue;
      },
      set(val: string | number) {
        this.$emit("update:modelValue", val);
      },
    },
  },
  methods: {
    t(key: string | undefined, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key || "", vars, fallback || key || "");
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
