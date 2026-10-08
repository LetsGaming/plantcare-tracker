<template>
  <div class="field-wrapper">
    <IonInput
      class="field-input"
      :class="{ 'field-invalid': !!error }"
      fill="outline"
      v-model="localValue"
      label-placement="stacked"
      :type="showPassword ? 'text' : 'password'"
      :required="field.required"
      :autocomplete="field.autocomplete || 'new-password'"
      :enterkeyhint="field.enterkeyhint"
      autocapitalize="off"
      autocorrect="off"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? messageId : undefined"
      @ionBlur="$emit('blur')"
    >
      <div slot="label">
        {{ translatedLabel }}
        <RequiredMark v-if="field.required" />
      </div>
      <IconButton
        slot="end"
        :icon="showPassword ? eyeOffOutline : eyeOutline"
        :label="toggleLabel"
        :aria-pressed="showPassword ? 'true' : 'false'"
        @press="showPassword = !showPassword"
      />
    </IonInput>
    <FieldError :id="messageId" :message="error" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonInput } from "@ionic/vue";
import { eyeOutline, eyeOffOutline } from "ionicons/icons";
import FieldError from "@/components/formcomponent/FieldError.vue";
import RequiredMark from "@/components/formcomponent/RequiredMark.vue";
import IconButton from "@/components/ui/IconButton.vue";
import { fieldErrorProp, nextFieldId } from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "PasswordField",
  emits: ["update:modelValue", "blur"],
  components: { IonInput, FieldError, RequiredMark, IconButton },
  props: {
    field: {
      type: Object as () => PasswordField,
      required: true,
    },
    modelValue: {
      type: [String, Number],
      default: "",
    },
    ...fieldErrorProp,
  },
  setup() {
    return { eyeOutline, eyeOffOutline };
  },
  data() {
    return { showPassword: false, messageId: nextFieldId("field-msg") };
  },
  computed: {
    localValue: {
      get(): string | number {
        return this.modelValue;
      },
      set(val: string | number) {
        this.$emit("update:modelValue", val);
      },
    },
    translatedLabel(): string {
      return localizationService.t(this.field.label, undefined, this.field.label);
    },
    toggleLabel(): string {
      return this.showPassword
        ? localizationService.t("a11y.hide_password", undefined, "Hide password")
        : localizationService.t("a11y.show_password", undefined, "Show password");
    },
  },
});
</script>

<style scoped>
.field-wrapper {
  margin-bottom: var(--space-3);
}
</style>
