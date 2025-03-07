<template>
  <div class="field-wrapper">
    <IonItem>
      <IonLabel>{{ field.label }}</IonLabel>

      <IonRadioGroup v-model="localValue">
        <IonItem v-for="(option, index) in field.options" :key="index">
          <IonRadio :value="option.value">
            {{ option.label }}
          </IonRadio>
        </IonItem>
      </IonRadioGroup>
      <small v-if="field.required" class="required-note"
        >This field is required</small
      >
    </IonItem>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonLabel, IonRadioGroup, IonRadio } from "@ionic/vue";

export default defineComponent({
  name: "RadioFieldComponent",
  components: { IonItem, IonLabel, IonRadioGroup, IonRadio },
  props: {
    field: {
      type: Object as () => RadioField,
      required: true,
    },
    modelValue: {
      type: [String, Number, Boolean],
      default: "",
    },
  },
  computed: {
    localValue: {
      get() {
        return this.modelValue;
      },
      set(val: string | number | boolean) {
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
.required-note {
  font-size: 0.75em;
  color: red;
  margin-left: 16px;
}
</style>
