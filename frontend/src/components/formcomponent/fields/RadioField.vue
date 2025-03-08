<template>
  <div class="field-wrapper">
    <IonItem>
      <IonLabel>{{ field.label }}</IonLabel>

      <IonRadioGroup :value="field.defaultValue" v-model="localValue">
        <IonItem v-for="(option, index) in field.options" :key="index">
          <IonRadio :value="option.value">
            {{ option.label }}
          </IonRadio>
        </IonItem>
      </IonRadioGroup>
      <RequiredNote v-if="field.required" />
    </IonItem>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonLabel, IonRadioGroup, IonRadio } from "@ionic/vue";
import RequiredNote from "@/components/formcomponent/RequiredNote.vue";

export default defineComponent({
  name: "RadioFieldComponent",
  components: { IonItem, IonLabel, IonRadioGroup, IonRadio, RequiredNote },
  props: {
    field: {
      type: Object as () => RadioField,
      required: true,
    },
    modelValue: {
      type: String,
      default: "",
    },
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
  },
});
</script>

<style scoped>
.field-wrapper {
  margin-bottom: 16px;
}
</style>
