<template>
  <div class="field-wrapper">
    <IonItem>
      <IonToggle v-model="localValue" justify="space-between" @ionBlur="$emit('blur')">
        {{ translateLabel() }}
      </IonToggle>
    </IonItem>
    <FieldError :id="messageId" :message="error" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonToggle } from "@ionic/vue";
import FieldError from "@/components/formcomponent/FieldError.vue";
import { fieldErrorProp, nextFieldId } from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "SwitchFieldComponent",
  emits: ["update:modelValue", "blur"],
  components: { IonItem, IonToggle, FieldError },
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
.field-wrapper {
  margin-bottom: var(--space-3);
}
</style>
