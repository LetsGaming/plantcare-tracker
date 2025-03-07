<template>
  <div class="field-wrapper">
    <IonItem>
      <IonLabel>{{ field.label }}</IonLabel>
      <input type="datetime-local" v-model="localValue" />
    </IonItem>
    <small v-if="field.required" class="required-note"
      >This field is required</small
    >
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonLabel } from "@ionic/vue";

export default defineComponent({
  name: "DateFieldComponent",
  components: { IonItem, IonLabel },
  props: {
    field: {
      type: Object as () => DateField,
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
.required-note {
  font-size: 0.75em;
  color: red;
  margin-left: 16px;
}
</style>
