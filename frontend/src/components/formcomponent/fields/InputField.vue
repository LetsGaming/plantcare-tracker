<template>
  <div class="field-wrapper">
    <IonItem>
      <IonInput
        v-model="localValue"
        :label="translatedLabel"
        label-placement="floating"
        :required="field.required"
      />
    </IonItem>
    <RequiredNote v-if="field.required" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonInput } from "@ionic/vue";
import RequiredNote from "@/components/formcomponent/RequiredNote.vue";
import localizationService from '@/services/general/LocalizationService'

export default defineComponent({
  name: "InputFieldComponent",
  components: { IonItem, IonInput, RequiredNote },
  props: {
    field: {
      type: Object as () => InputField,
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
    translatedLabel(): string {
      return localizationService.t(this.field.label, undefined, this.field.label)
    }
  },
});
</script>

<style scoped>
.field-wrapper {
  margin-bottom: 16px;
}
</style>
