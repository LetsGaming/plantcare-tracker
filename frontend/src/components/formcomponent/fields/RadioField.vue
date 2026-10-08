<template>
  <FieldShell
    :label="t(field.label)"
    :required="field.required"
    :error="error"
    :hint="translatedHint"
    :message-id="messageId"
    :label-id="labelId"
    :boxed="false"
  >
    <IonRadioGroup
      class="radio-group"
      :class="{ 'radio-group-invalid': !!error }"
      :value="modelValue"
      :aria-labelledby="labelId"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error || translatedHint ? messageId : undefined"
      @ionChange="onRadioChange"
    >
      <IonRadio
        v-for="(option, index) in field.options"
        :key="index"
        class="radio-option"
        :value="option.value"
        justify="start"
        label-placement="end"
      >
        {{ t(option.label) }}
      </IonRadio>
    </IonRadioGroup>
  </FieldShell>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonRadioGroup, IonRadio } from "@ionic/vue";
import FieldShell from "@/components/formcomponent/FieldShell.vue";
import { fieldErrorProp, nextFieldId } from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "RadioFieldComponent",
  emits: ["update:modelValue", "blur"],
  components: { IonRadioGroup, IonRadio, FieldShell },
  props: {
    field: {
      type: Object as () => RadioField,
      required: true,
    },
    modelValue: {
      type: [String, Number, Boolean],
      default: "",
    },
    ...fieldErrorProp,
  },
  data() {
    return { messageId: nextFieldId("field-msg"), labelId: nextFieldId("field-label") };
  },
  computed: {
    translatedHint(): string {
      return this.field.hint ? this.t(this.field.hint) : "";
    },
  },
  mounted() {
    if (this.field.defaultValue !== undefined && this.modelValue === "") {
      this.$emit("update:modelValue", this.field.defaultValue);
    }
  },
  methods: {
    onRadioChange(event: CustomEvent) {
      this.$emit("update:modelValue", event.detail.value);
      this.$emit("blur");
    },
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
  },
});
</script>

<style scoped>
.radio-group {
  display: grid;
  overflow: hidden;
  border: 1.5px solid color-mix(in srgb, var(--ink-soft) 60%, var(--line));
  border-radius: var(--radius-md);
  background: var(--surface-raised);
}

.radio-group-invalid {
  border-color: var(--ion-color-danger);
}

.radio-option {
  color: var(--ion-text-color);
  box-sizing: border-box;
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
}

.radio-option + .radio-option {
  border-top: 1px solid var(--line);
}
</style>
