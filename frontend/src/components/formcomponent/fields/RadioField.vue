<template>
  <div class="field-wrapper">
    <fieldset class="radio-fieldset">
      <legend class="radio-legend">
        {{ t(field.label) }}
        <RequiredMark v-if="field.required" />
      </legend>

      <IonRadioGroup :value="modelValue" @ionChange="onRadioChange">
        <IonItem v-for="(option, index) in field.options" :key="index" lines="none">
          <IonRadio :value="option.value" justify="start" label-placement="end">
            {{ t(option.label) }}
          </IonRadio>
        </IonItem>
      </IonRadioGroup>
    </fieldset>
    <FieldError :id="messageId" :message="error" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonRadioGroup, IonRadio } from "@ionic/vue";
import FieldError from "@/components/formcomponent/FieldError.vue";
import RequiredMark from "@/components/formcomponent/RequiredMark.vue";
import { fieldErrorProp, nextFieldId } from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "RadioFieldComponent",
  emits: ["update:modelValue", "blur"],
  components: { IonItem, IonRadioGroup, IonRadio, FieldError, RequiredMark },
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
    return { messageId: nextFieldId("field-msg") };
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
.field-wrapper {
  margin-bottom: var(--space-3);
}

.radio-fieldset {
  margin: 0;
  padding: 0;
  border: 0;
}

.radio-legend {
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--ink-soft);
}
</style>
