<template>
    <div class="field-wrapper">
      <IonItem>
        <IonInput
          v-model="localValue"
          :label="field.label"
          label-placement="floating"
          :required="field.required"
        />
      </IonItem>
      <small v-if="field.required" class="required-note">This field is required</small>
    </div>
  </template>
  
  <script lang="ts">
  import { defineComponent } from "vue";
  import { IonItem, IonInput } from "@ionic/vue";
  
  export default defineComponent({
    name: "InputFieldComponent",
    components: { IonItem, IonInput },
    props: {
      field: {
        type: Object as () => InputField,
        required: true,
      },
      modelValue: {
        type: [String, Number],
        default: ""
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
  .required-note {
    font-size: 0.75em;
    color: red;
    margin-left: 16px;
  }
  </style>
  