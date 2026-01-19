<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader
      :headerTitle="t('substrate.add.title')"
      @close="$emit('close')"
    />

    <IonContent>
      <!-- STEP 1: META -->
      <FormComponent
        v-if="step === 1"
        :item="form"
        :formFields="formFields"
        :cardTitle="t('substrate.info.title')"
        submitLabel="form.next"
        :is-loading="isLoading"
        @submit-click="step = 2"
      />

      <!-- STEP 2: COMPONENTS -->
      <div v-else class="component-list">
        <ComponentSelection
          :title="t('substrate.select_components_title')"
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
import { IonModal, IonContent, IonButton } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import FormComponent from "@/components/formcomponent/FormComponent.vue";
import ComponentSelection from "@/components/substrates/ComponentSelection.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "SubstrateAddingModal",
  emits: ["close", "save"],
  components: {
    IonModal,
    IonContent,
    IonButton,
    ModalHeader,
    FormComponent,
    ComponentSelection,
  },
  props: {
    isOpen: { type: Boolean, required: true },
    isLoading: { type: Boolean, default: false },
    availableComponents: {
      type: Array as PropType<SubstrateComponent[]>,
      required: true,
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
    t(key: string, vars?: Record<string, any>) {
      return localizationService.t(key, vars);
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
.component-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
