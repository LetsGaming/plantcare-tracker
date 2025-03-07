<template>
  <div class="field-wrapper">
    <IonItem>
      <IonLabel>{{ field.label }}</IonLabel>
      <input type="file" accept="image/*" @change="onFileChange" />
    </IonItem>
    <small v-if="field.required" class="required-note"
      >This field is required</small
    >
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonLabel } from "@ionic/vue";

export default defineComponent({
  name: "UploadFieldComponent",
  components: { IonItem, IonLabel },
  props: {
    field: {
      type: Object as () => UploadField,
      required: true,
    },
    modelValue: {
      type: [File, Object],
      default: null,
    },
  },
  methods: {
    onFileChange(event: Event) {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        this.$emit("update:modelValue", target.files[0]);
      }
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
/* Style the file input button */
/* Reset the button’s direction so its label reads normally */
input[type="file"]::file-selector-button {
  direction: ltr;
  background-color: var(--ion-color-secondary);
  color: #fff;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 10px; /* creates space between text and button */
}

/* Change appearance on hover */
input[type="file"]::file-selector-button:hover {
  background-color: var(--ion-color-secondary-tint);
}

/* Optional: Style the input for consistency */
input[type="file"] {
  font-family: inherit;
  font-size: 1rem;
  color: #a8a8a8;
  direction: rtl;
  /* optional: adjust padding if needed */
  padding: 8px;
}
</style>
