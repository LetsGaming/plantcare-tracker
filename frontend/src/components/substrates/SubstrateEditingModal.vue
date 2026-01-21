<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader headerTitle="substrate.edit.title" @close="$emit('close')" />

    <IonContent>
      <!-- STEP 1: META DATA -->
      <FormComponent
        v-if="step === 1"
        :item="form"
        :formFields="formFields"
        :cardTitle="t('substrate.info.title')"
        submitLabel="form.next"
        :is-loading="isLoading"
        @submit-click="step = 2"
        @delete-click="$emit('delete', substrate.id)"
      />

      <!-- STEP 2: COMPONENT SELECTION -->
      <div v-else class="component-container-wrapper">
        <ComponentSelection
          title="substrate.components.edit.title"
          :components="availableComponents"
          :selectedComponentIds="selectedComponentIds"
          :componentParts="componentParts"
          @toggle-component="toggleComponent"
        />

        <div class="action-buttons">
          <IonButton expand="full" color="medium" @click="step = 1">
            {{ t("action.back") }}
          </IonButton>

          <IonButton
            expand="full"
            color="primary"
            :disabled="isLoading"
            @click="submit"
          >
            {{ t("substrate.save") }}
          </IonButton>
        </div>
      </div>
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonModal, IonButton, IonContent } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import FormComponent from "@/components/formcomponent/FormComponent.vue";
import ComponentSelection from "@/components/substrates/ComponentSelection.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "SubstrateEditingModal",
  emits: ["close", "save", "delete"],
  components: {
    IonModal,
    IonButton,
    IonContent,
    ModalHeader,
    FormComponent,
    ComponentSelection,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    substrate: {
      type: Object as PropType<Substrate>,
      required: true,
    },
    availableComponents: {
      type: Array as PropType<SubstrateComponent[]>,
      required: true,
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      step: 1,
      form: {
        name: "",
        isPublic: false,
        image: null as File | null,
      },
      selectedComponentIds: [] as number[],
      componentParts: {} as Record<number, number>,
    };
  },
  watch: {
    substrate: {
      immediate: true,
      handler() {
        this.resetFromSubstrate();
      },
    },
  },
  computed: {
    formFields() {
      return [
        {
          type: "input",
          modelKey: "name",
          label: this.t("substrate.field.name"),
          required: true,
        },
        {
          type: "radio",
          modelKey: "isPublic",
          label: this.t("substrate.field.visibility"),
          options: [
            {
              value: true,
              label: this.t("substrate.visibility.public"),
            },
            {
              value: false,
              label: this.t("substrate.visibility.private"),
            },
          ],
          defaultValue: Boolean(this.substrate.isPublic),
        },
        {
          type: "file",
          modelKey: "image",
          label: this.t("plant.image.upload"),
        },
      ] as FormField[];
    },
  },
  methods: {
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },

    resetFromSubstrate() {
      this.form = {
        name: this.substrate.name,
        isPublic: this.substrate.isPublic,
        image: null,
      };

      this.selectedComponentIds = this.substrate.components.map((c) => c.id);

      this.componentParts = this.substrate.components.reduce(
        (acc, c) => {
          acc[c.id] = c.parts;
          return acc;
        },
        {} as Record<number, number>,
      );

      this.step = 1;
    },

    toggleComponent(id: number) {
      const index = this.selectedComponentIds.indexOf(id);

      if (index > -1) {
        this.selectedComponentIds.splice(index, 1);
        delete this.componentParts[id];
      } else {
        this.selectedComponentIds.push(id);
      }
    },

    submit() {
      this.$emit("save", {
        meta: { ...this.form },
        componentIds: [...this.selectedComponentIds],
        parts: { ...this.componentParts },
      });
    },
  },
});
</script>

<style scoped>
.component-container-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.action-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
  gap: 10px;
  padding-left: 20px;
  padding-right: 20px;
}

.action-buttons ion-button {
  width: 100%;
}
</style>
