<template>
  <div class="field-wrapper">
    <IonInput
      class="field-input"
      :class="{ 'field-invalid': !!error }"
      fill="outline"
      v-model="localValue"
      label-placement="stacked"
      :type="field.inputType || 'text'"
      :required="field.required"
      :inputmode="field.inputmode"
      :enterkeyhint="field.enterkeyhint"
      :autocomplete="field.autocomplete"
      :autocapitalize="field.autocapitalize"
      :autocorrect="field.autocorrect ?? 'off'"
      :maxlength="field.maxlength"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @ionBlur="$emit('blur')"
    >
      <div slot="label">
        {{ translatedLabel }}
        <RequiredMark v-if="field.required" />
      </div>
    </IonInput>
    <FieldError :id="messageId" :message="error" :hint="translatedHint" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonInput } from "@ionic/vue";
import FieldError from "@/components/formcomponent/FieldError.vue";
import RequiredMark from "@/components/formcomponent/RequiredMark.vue";
import { fieldErrorProp, nextFieldId } from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "InputFieldComponent",
  emits: ["update:modelValue", "blur"],
  components: { IonInput, FieldError, RequiredMark },
  props: {
    field: {
      type: Object as () => InputField,
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
    localValue: {
      get() {
        return this.modelValue;
      },
      set(val: string | number) {
        this.$emit("update:modelValue", val);
      },
    },
    translatedLabel(): string {
      return localizationService.t(this.field.label, undefined, this.field.label);
    },
    translatedHint(): string {
      return this.field.hint
        ? localizationService.t(this.field.hint, undefined, this.field.hint)
        : "";
    },
    describedBy(): string | undefined {
      return this.error || this.translatedHint ? this.messageId : undefined;
    },
  },
});
</script>

<style scoped>
.field-wrapper {
  margin-bottom: var(--space-3);
}
</style>
