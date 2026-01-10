<template>
  <div class="field-wrapper">
    <IonItem>
      <IonSelect
        v-model="localValue"
        :label="translatedLabel"
        :placeholder="translatedPlaceholder"
      >
        <IonSelectOption
          v-for="option in field.options"
          :key="option.value"
          :value="option.value"
        >
          {{ t(option.label, undefined, option.label) }}
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
import localizationService from '@/services/general/LocalizationService'

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
    translatedLabel(): string {
      return localizationService.t(this.field.label, undefined, this.field.label)
    },
    translatedPlaceholder(): string {
      return localizationService.t(this.field.placeholder || '', undefined, this.field.placeholder || '')
    },
    localValue: {
      get() {
        return this.modelValue;
      },
      set(val: string | number) {
        this.$emit("update:modelValue", val);
      },
    },
  },
  methods: {
    t(key: string | undefined, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key || '', vars, fallback || key || '');
    }
  },
});
</script>

<style scoped>
.field-wrapper {
  margin-bottom: 16px;
}
</style>
