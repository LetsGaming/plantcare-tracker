<template>
  <BaseFormModal
    :isOpen="isOpen"
    modalTitle="plant.add.title"
    formTitle="plant.add.form_title"
    submitLabel="plant.add.submit"
    :formData="plant"
    :formFields="plantFormFields"
    :is-loading="isLoading"
    @submit="submit"
    @close="$emit('close')"
  >
    <template #after-field="{ modelKey }">
      <IonButton
        v-if="modelKey === 'substrateId'"
        class="new-substrate"
        fill="clear"
        size="small"
        @click="openNewSubstrate"
      >
        <IonIcon slot="start" :icon="icons.add" aria-hidden="true" />
        {{ t("plant.add.new_substrate") }}
      </IonButton>
    </template>
  </BaseFormModal>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import localizationService from "@/services/general/LocalizationService";
import { icons } from "@/theme/icons";

const blankPlant = (): AddPlant => ({
  name: "",
  species: "",
  substrateId: null,
  isPublic: false,
  image: undefined,
});

export default defineComponent({
  name: "PlantAddingModal",
  components: { BaseFormModal, IonButton, IonIcon },
  emits: ["close", "save"],
  props: {
    isOpen: { type: Boolean, required: true },
    isLoading: { type: Boolean, default: false },
  },
  setup() {
    return { icons };
  },
  data() {
    return { plant: blankPlant() };
  },
  watch: {
    isOpen(open: boolean) {
      if (open) this.plant = blankPlant();
    },
  },
  computed: {
    plantFormFields() {
      return [
        {
          type: "input",
          modelKey: "name",
          label: "plant.field.name",
          required: true,
          autocapitalize: "words",
          enterkeyhint: "next",
        },
        {
          type: "input",
          modelKey: "species",
          label: "plant.field.species",
          autocapitalize: "words",
          enterkeyhint: "next",
        },
        {
          type: "substrate-picker",
          modelKey: "substrateId",
          label: "plant.field.substrate",
          placeholder: "plant.field.substrate_placeholder",
        },
        {
          type: "radio",
          modelKey: "isPublic",
          label: "plant.field.visibility",
          options: [
            { value: true, label: "plant.visibility.public" },
            { value: false, label: "plant.visibility.private" },
          ],
          defaultValue: Boolean(this.plant.isPublic),
        },
        {
          type: "file",
          modelKey: "image",
          label: "plant.image.upload",
        },
      ] as FormField[];
    },
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
    submit() {
      this.$emit("save", { ...this.plant });
    },
    /** The substrates tab has no deep link into its add dialog, so the user opens it there. */
    openNewSubstrate() {
      this.$emit("close");
      this.$router.push("/tabs/substrates");
    },
  },
});
</script>

<style scoped>
.new-substrate {
  margin: calc(-1 * var(--space-2)) 0 var(--space-3);
  --padding-start: 0;
  font-weight: 600;
}
</style>
