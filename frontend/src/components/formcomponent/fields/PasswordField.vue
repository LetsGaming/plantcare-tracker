<template>
  <div class="field-wrapper">
    <IonItem class="custom-input-item">
      <div class="input-wrapper">
        <input
          v-model="localValue"
          :type="showPassword ? 'text' : 'password'"
          :required="field.required"
          :aria-label="translatedLabel"
        />
        <label>
          {{ translatedLabel }}
          <span v-if="field.required">*</span>
        </label>
      </div>

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
import { IonItem, IonButton, IonIcon } from "@ionic/vue";
import { eyeOutline, eyeOffOutline } from "ionicons/icons";
import RequiredNote from "@/components/formcomponent/RequiredNote.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "PasswordField",
  components: {
    IonItem,
    IonButton,
    IonIcon,
    RequiredNote,
  },
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
      get(): string | number {
        return this.modelValue;
      },
      set(val: string | number) {
        this.$emit("update:modelValue", val);
      },
    },
    translatedLabel(): string {
      return localizationService.t(
        this.field.label,
        undefined,
        this.field.label,
      );
    },
  },
});
</script>

<style scoped>
.field-wrapper {
  margin-bottom: 16px;
}

.custom-input-item {
  --padding-start: 16px;
  --inner-padding-end: 8px;
}

.input-wrapper {
  position: relative;
  flex: 1;
}

.input-wrapper input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  padding: 20px 0 6px;
  font-size: 16px;
  color: var(--ion-text-color, #000);
}

.input-wrapper label {
  position: absolute;
  left: 0;
  top: 18px;
  font-size: 16px;
  color: var(--ion-color-medium);
  pointer-events: none;
  transition: 0.2s ease;
}

.input-wrapper input:focus + label,
.input-wrapper input:not(:placeholder-shown) + label {
  top: 2px;
  font-size: 12px;
  color: var(--ion-color-primary);
}

.input-wrapper label span {
  color: var(--ion-color-danger);
  margin-left: 2px;
}
</style>
