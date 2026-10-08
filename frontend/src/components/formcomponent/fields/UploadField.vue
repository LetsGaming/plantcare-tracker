<template>
  <div class="field-wrapper">
    <div class="upload" :class="{ 'upload-invalid': !!shownError }">
      <label :for="inputId" class="upload-label">
        {{ translateLabel() }}
        <RequiredMark v-if="field.required" />
      </label>

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

      <input
        :id="inputId"
        ref="input"
        class="upload-input"
        type="file"
        :accept="accept"
        :aria-invalid="shownError ? 'true' : undefined"
        :aria-describedby="shownError || translatedHint ? messageId : undefined"
        @change="onFileChange"
        @blur="$emit('blur')"
      />
    </div>
    <FieldError :id="messageId" :message="shownError" :hint="translatedHint" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { closeCircleOutline } from "ionicons/icons";
import FieldError from "@/components/formcomponent/FieldError.vue";
import RequiredMark from "@/components/formcomponent/RequiredMark.vue";
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
  components: { FieldError, RequiredMark, IconButton },
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
    return { closeCircleOutline, accept: IMAGE_ACCEPT };
  },
  data() {
    return {
      inputId: nextFieldId("field-file"),
      messageId: nextFieldId("field-msg"),
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
.field-wrapper {
  margin-bottom: var(--space-3);
}

.upload {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}

.upload-invalid {
  border-color: var(--ion-color-danger);
}

.upload-label {
  font-size: var(--text-sm);
  color: var(--ink-soft);
}

.upload-preview {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.upload-thumb {
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.upload-size {
  font-size: var(--text-xs);
  color: var(--ink-soft);
}

.upload-input {
  width: 100%;
  font-family: inherit;
  font-size: var(--text-sm);
  color: var(--ink-soft);
}

.upload-input::file-selector-button {
  min-height: var(--tap-min);
  margin-right: var(--space-3);
  padding: 0 var(--space-4);
  border: 0;
  border-radius: var(--radius-md);
  background: var(--ion-color-secondary);
  color: var(--ion-color-secondary-contrast);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.upload-input::file-selector-button:hover {
  background: var(--ion-color-secondary-shade);
}
</style>
