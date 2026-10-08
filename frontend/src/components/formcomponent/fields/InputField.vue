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
      :type="field.inputType || 'text'"
      :required="field.required"
      :inputmode="field.inputmode"
      :enterkeyhint="field.enterkeyhint"
      :autocomplete="field.autocomplete"
      :autocapitalize="field.autocapitalize"
      :autocorrect="field.autocorrect ?? 'off'"
      :maxlength="field.maxlength"
      :aria-labelledby="labelId"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
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
  name: "InputFieldComponent",
  emits: ["update:modelValue", "blur"],
  components: { IonInput, FieldShell },
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
    return { messageId: nextFieldId("field-msg"), labelId: nextFieldId("field-label") };
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
  methods: {
    focusControl() {
      focusControlRef(this.$refs.control);
    },
  },
});
</script>
