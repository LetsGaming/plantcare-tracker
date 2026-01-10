<template>
  <div class="field-wrapper">
    <IonItem>
      <IonLabel>{{ translateLabel() }}</IonLabel>
      <IonToggle v-model="localValue" />
    </IonItem>
    <RequiredNote v-if="field.required" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonLabel, IonToggle } from "@ionic/vue";
import RequiredNote from "@/components/formcomponent/RequiredNote.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "SwitchFieldComponent",
  components: { IonItem, IonLabel, IonToggle, RequiredNote },
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
  methods: {
    translateLabel(): string {
      return localizationService.t(
        this.field.label,
        undefined,
        this.field.label
      );
    },
  },
});
</script>

<style scoped>
.field-wrapper {
  margin-bottom: 16px;
}
</style>
