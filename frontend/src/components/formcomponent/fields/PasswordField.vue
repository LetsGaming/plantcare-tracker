<template>
  <FieldShell
    :label="translatedLabel"
    :required="field.required"
    :error="error"
    :hint="translatedHint"
    :message-id="messageId"
    :label-id="labelId"
    @label-click="focusControl"
  >
    <IonInput
      ref="control"
      v-model="localValue"
      :type="showPassword ? 'text' : 'password'"
      :required="field.required"
      :autocomplete="field.autocomplete || 'new-password'"
      :enterkeyhint="field.enterkeyhint"
      autocapitalize="off"
      autocorrect="off"
      :aria-labelledby="labelId"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error || translatedHint ? messageId : undefined"
      @ionBlur="$emit('blur')"
    >
      <IconButton
        slot="end"
        :icon="showPassword ? eyeOffOutline : eyeOutline"
        :label="toggleLabel"
        :aria-pressed="showPassword ? 'true' : 'false'"
        @press="showPassword = !showPassword"
      />
    </IonInput>
  </FieldShell>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonInput } from "@ionic/vue";
import { eyeOutline, eyeOffOutline } from "ionicons/icons";
import FieldShell from "@/components/formcomponent/FieldShell.vue";
import IconButton from "@/components/ui/IconButton.vue";
import {
  fieldErrorProp,
  focusControlRef,
  nextFieldId,
} from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "PasswordField",
  emits: ["update:modelValue", "blur"],
  components: { IonInput, FieldShell, IconButton },
  props: {
    field: {
      type: Object as () => PasswordField,
      required: true,
    },
    modelValue: {
      type: [String, Number],
      default: "",
    },
    ...fieldErrorProp,
  },
  setup() {
    return { eyeOutline, eyeOffOutline };
  },
  data() {
    return {
      showPassword: false,
      messageId: nextFieldId("field-msg"),
      labelId: nextFieldId("field-label"),
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
      return localizationService.t(this.field.label, undefined, this.field.label);
    },
    translatedHint(): string {
      return this.field.hint
        ? localizationService.t(this.field.hint, undefined, this.field.hint)
        : "";
    },
    toggleLabel(): string {
      return this.showPassword
        ? localizationService.t("a11y.hide_password", undefined, "Hide password")
        : localizationService.t("a11y.show_password", undefined, "Show password");
    },
  },
  methods: {
    focusControl() {
      focusControlRef(this.$refs.control);
    },
  },
});
</script>
