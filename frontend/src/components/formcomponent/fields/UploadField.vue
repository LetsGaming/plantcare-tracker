<template>
  <FieldShell
    :label="translateLabel()"
    :required="field.required"
    :error="shownError"
    :hint="translatedHint"
    :message-id="messageId"
    :label-id="labelId"
    :boxed="false"
  >
    <div class="upload" :class="{ 'upload-invalid': !!shownError }">
      <div v-if="previewUrl" class="upload-preview">
        <img :src="previewUrl" alt="" class="upload-thumb" />
        <div class="upload-meta">
          <span class="upload-name">{{ file?.name }}</span>
          <span class="upload-size">{{ sizeText }}</span>
        </div>
        <IconButton
          :icon="closeCircleOutline"
          :label="t('upload2.remove', 'Remove image')"
          @press="clearFile"
        />
      </div>

      <IonButton
        ref="pickButton"
        class="upload-button"
        fill="outline"
        color="medium"
        type="button"
        :aria-labelledby="`${labelId} ${buttonTextId}`"
        :aria-invalid="shownError ? 'true' : undefined"
        :aria-describedby="shownError || translatedHint ? messageId : undefined"
        @click="openPicker"
      >
        <IonIcon slot="start" :icon="imageOutline" aria-hidden="true" />
        <span :id="buttonTextId">
          {{
            file
              ? t("modal2.file_change", "Choose another image")
              : t("modal2.file_choose", "Choose an image")
          }}
        </span>
      </IonButton>

      <input
        :id="inputId"
        ref="input"
        class="upload-input"
        type="file"
        tabindex="-1"
        aria-hidden="true"
        :accept="accept"
        @change="onFileChange"
        @blur="$emit('blur')"
      />
    </div>
  </FieldShell>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import { closeCircleOutline, imageOutline } from "ionicons/icons";
import FieldShell from "@/components/formcomponent/FieldShell.vue";
import IconButton from "@/components/ui/IconButton.vue";
import { fieldErrorProp, nextFieldId } from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";
import {
  IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
  checkImageFile,
  formatFileSize,
} from "@/utils/imageValidation";

export default defineComponent({
  name: "UploadFieldComponent",
  emits: ["update:modelValue", "blur"],
  components: { FieldShell, IconButton, IonButton, IonIcon },
  props: {
    field: {
      type: Object as () => UploadField,
      required: true,
    },
    modelValue: {
      type: [File, Object],
      default: null,
    },
    ...fieldErrorProp,
  },
  setup() {
    return { closeCircleOutline, imageOutline, accept: IMAGE_ACCEPT };
  },
  data() {
    return {
      inputId: nextFieldId("field-file"),
      messageId: nextFieldId("field-msg"),
      labelId: nextFieldId("field-label"),
      buttonTextId: nextFieldId("field-button"),
      localError: "",
      previewUrl: "",
    };
  },
  computed: {
    file(): File | null {
      return typeof File !== "undefined" && this.modelValue instanceof File
        ? this.modelValue
        : null;
    },
    shownError(): string {
      return this.localError || this.error;
    },
    sizeText(): string {
      return this.file ? formatFileSize(this.file.size) : "";
    },
    translatedHint(): string {
      return this.field.hint
        ? localizationService.t(this.field.hint, undefined, this.field.hint)
        : "";
    },
  },
  watch: {
    file: {
      immediate: true,
      handler(next: File | null) {
        this.releasePreview();
        if (next && typeof URL !== "undefined" && URL.createObjectURL) {
          this.previewUrl = URL.createObjectURL(next);
        }
        if (!next && this.$refs.input) (this.$refs.input as HTMLInputElement).value = "";
      },
    },
  },
  beforeUnmount() {
    this.releasePreview();
  },
  methods: {
    t(key: string, fallback: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, fallback);
    },
    openPicker() {
      (this.$refs.input as HTMLInputElement | undefined)?.click();
    },
    releasePreview() {
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = "";
    },
    onFileChange(event: Event) {
      const input = event.target as HTMLInputElement;
      const chosen = input.files?.[0];
      this.localError = "";
      if (!chosen) return;

      const problem = checkImageFile(chosen);
      if (problem === "type") {
        this.localError = this.t("upload2.error_type", "Please choose a JPEG or PNG image.");
      } else if (problem === "size") {
        this.localError = this.t("upload2.error_size", "This image is larger than {max} MB.", {
          max: MAX_IMAGE_BYTES / (1024 * 1024),
        });
      }
      if (problem) {
        input.value = "";
        this.$emit("update:modelValue", undefined);
        return;
      }
      this.$emit("update:modelValue", chosen);
    },
    clearFile() {
      this.localError = "";
      this.$emit("update:modelValue", undefined);
    },
    translateLabel(): string {
      return localizationService.t(this.field.label, undefined, this.field.label);
    },
  },
});
</script>

<style scoped>
.upload {
  display: grid;
  gap: var(--space-3);
}

.upload-preview {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  border: 1.5px solid color-mix(in srgb, var(--ink-soft) 60%, var(--line));
  border-radius: var(--radius-md);
  background: var(--surface-raised);
}

.upload-invalid .upload-preview {
  border-color: var(--ion-color-danger);
}

.upload-invalid .upload-button {
  --border-color: var(--ion-color-danger);
}

.upload-thumb {
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: var(--surface-sunken);
}

.upload-meta {
  display: grid;
  min-width: 0;
  flex: 1;
}

.upload-name {
  overflow-wrap: anywhere;
  font-weight: 600;
}

.upload-size {
  font-size: var(--text-xs);
  color: var(--ink-soft);
}

.upload-button {
  --border-radius: var(--radius-md);
  --border-width: 1.5px;
  min-height: var(--tap-min);
  margin: 0;
  justify-self: start;
}

.upload-input {
  display: none;
}
</style>
