<template>
  <div class="switch-field">
    <div class="switch-box">
      <IonToggle v-model="localValue" justify="space-between" @ionBlur="$emit('blur')">
        {{ translateLabel() }}
      </IonToggle>
    </div>
    <FieldError :id="messageId" :message="error" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonToggle } from "@ionic/vue";
import FieldError from "@/components/formcomponent/FieldError.vue";
import { fieldErrorProp, nextFieldId } from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "SwitchFieldComponent",
  emits: ["update:modelValue", "blur"],
  components: { IonToggle, FieldError },
  props: {
    field: {
      type: Object as () => SwitchField,
      required: true,
    },
    modelValue: {
      type: Boolean,
      default: false,
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
      set(val: boolean) {
        this.$emit("update:modelValue", val);
      },
    },
  },
  methods: {
    translateLabel(): string {
      return localizationService.t(this.field.label, undefined, this.field.label);
    },
  },
});
</script>

<style scoped>
.switch-field {
  margin-bottom: var(--space-4);
}

.switch-box {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: 1.5px solid color-mix(in srgb, var(--ink-soft) 60%, var(--line));
  border-radius: var(--radius-md);
  background: var(--surface-raised);
}

.switch-box ion-toggle {
  width: 100%;
  font-weight: 600;
}
</style>
