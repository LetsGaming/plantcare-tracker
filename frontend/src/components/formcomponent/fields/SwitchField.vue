<template>
  <div class="field-wrapper">
    <IonItem>
      <IonLabel>{{ field.label }}</IonLabel>
      <IonToggle v-model="localValue" />
    </IonItem>
    <small v-if="field.required" class="required-note"
      >This field is required</small
    >
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonLabel, IonToggle } from "@ionic/vue";

export default defineComponent({
  name: "SwitchFieldComponent",
  components: { IonItem, IonLabel, IonToggle },
  props: {
    field: {
      type: Object as () => SwitchField,
      required: true,
    },
    modelValue: {
      type: Boolean,
      default: false,
    },
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
