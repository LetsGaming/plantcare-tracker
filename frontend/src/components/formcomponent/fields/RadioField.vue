<template>
  <div class="field-wrapper">
    <IonItem>
      <IonLabel>{{ t(field.label) }}</IonLabel>

      <IonRadioGroup :value="modelValue" @ionChange="onRadioChange">
        <IonItem v-for="(option, index) in field.options" :key="index">
          <IonRadio :value="option.value">
            {{ t(option.label) }}
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
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "RadioFieldComponent",
  components: { IonItem, IonLabel, IonRadioGroup, IonRadio, RequiredNote },
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
  mounted() {
    // Sett default value if provided
    if (this.field.defaultValue !== undefined) {
      this.$emit("update:modelValue", this.field.defaultValue);
    }
  },
  methods: {
    onRadioChange(event: CustomEvent) {
      const newVal = event.detail.value;
      this.$emit("update:modelValue", newVal);
    },
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
  },
});
</script>

<style scoped>
.field-wrapper {
  margin-bottom: 16px;
}
</style>
