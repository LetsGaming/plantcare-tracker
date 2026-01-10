<template>
  <div class="field-wrapper">
    <IonItem>
      <IonInput
        v-model="localValue"
        :type="showPassword ? 'text' : 'password'"
        :label="translatedLabel"
        label-placement="floating"
        :required="field.required"
        clear-input
      />
      <IonButton
        fill="clear"
        size="small"
        slot="end"
        @click="togglePasswordVisibility"
      >
        <IonIcon :icon="showPassword ? eyeOffOutline : eyeOutline" />
      </IonButton>
    </IonItem>
    <RequiredNote v-if="field.required" />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";
import { IonItem, IonInput, IonButton, IonIcon } from "@ionic/vue";
import { eyeOutline, eyeOffOutline } from "ionicons/icons";
import RequiredNote from "@/components/formcomponent/RequiredNote.vue";
import localizationService from '@/services/general/LocalizationService'

export default defineComponent({
  name: "PasswordField",
  components: { IonItem, IonInput, IonButton, IonIcon, RequiredNote },
  props: {
    field: {
      type: Object,
      required: true,
    },
    modelValue: {
      type: [String, Number],
      default: "",
    },
  },
  setup() {
    const showPassword = ref(false);
    const togglePasswordVisibility = () => {
      showPassword.value = !showPassword.value;
    };
    return {
      showPassword,
      togglePasswordVisibility, 
      eyeOutline,
      eyeOffOutline,
    };
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
