<template>
  <div class="field-wrapper">
    <IonItem>
      <IonSelect
        v-model="localValue"
        :label="field.label"
        :placeholder="field.placeholder"
      >
        <IonSelectOption
          v-for="option in field.options"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </IonSelectOption>
      </IonSelect>
    </IonItem>
    <RequiredNote v-if="field.required" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonSelect, IonSelectOption } from "@ionic/vue";
import RequiredNote from "@/components/formcomponent/RequiredNote.vue";

export default defineComponent({
  name: "SelectFieldComponent",
  components: { IonItem, IonSelect, IonSelectOption, RequiredNote },
  props: {
    field: {
      type: Object as () => SelectField,
      required: true,
    },
    modelValue: {
      type: [String, Number],
      default: "",
    },
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
  },
});
</script>

<style scoped>
.field-wrapper {
  margin-bottom: 16px;
}
</style>
