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
    <IonTextarea
      ref="control"
      v-model="localValue"
      :rows="field.rows ?? 3"
      :auto-grow="true"
      :required="field.required"
      :enterkeyhint="field.enterkeyhint"
      :autocapitalize="field.autocapitalize"
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
import { IonTextarea } from "@ionic/vue";
import FieldShell from "@/components/formcomponent/FieldShell.vue";
import {
  fieldErrorProp,
  focusControlRef,
  nextFieldId,
} from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "TextareaFieldComponent",
  emits: ["update:modelValue", "blur"],
  components: { IonTextarea, FieldShell },
  props: {
    field: {
      type: Object as () => TextareaField,
      required: true,
    },
    modelValue: {
      type: String,
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
      set(val: string) {
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
