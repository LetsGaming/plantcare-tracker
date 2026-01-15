<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader headerTitle="substrate.edit.title" @close="$emit('close')" />
    <IonContent>
      <!-- Step 1: Substrate Information Form -->
      <form-component
        v-if="step === 1"
        :item="editSubstrateData"
        :formFields="[
          {
            type: 'input',
            modelKey: 'name',
            label: t('substrate.field.name'),
            required: true,
          },
          {
            type: 'radio',
            modelKey: 'isPublic',
            label: t('substrate.field.visibility'),
            options: [
              { value: true, label: t('substrate.visibility.public') },
              { value: false, label: t('substrate.visibility.private') },
            ],
            defaultValue: Boolean(substrate.isPublic),
          },
          {
            type: 'file',
            label: t('plant.image.upload'),
            modelKey: 'image',
          },
        ]"
        :cardTitle="t('substrate.info.title')"
        submitLabel="form.next"
        @submit-click="goToStepTwo"
        @delete-click="deleteSubstrate"
        :is-loading="isLoading"
      ></form-component>

      <!-- Step 2: Edit Components -->
      <div class="component-container-wrapper" v-if="step === 2">
        <ComponentSelection
          title="substrate.components.edit.title"
          :components="availableComponents"
          :selectedComponentIds="selectedComponentIds"
          :componentParts="componentParts"
          @toggle-component="toggleSelectedComponent"
        />
      </div>
      <!-- Action Buttons -->
      <div class="action-buttons" v-if="step === 2">
        <IonButton expand="full" color="medium" @click="goToStepOne">
          {{ t("action.back") }}
        </IonButton>
        <IonButton
          expand="full"
          color="primary"
          @click="editSubstrate"
          :disabled="isLoading"
        >
          {{ t("substrate.save") }}
        </IonButton>
      </div>
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonTitle,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardContent,
  IonCheckbox,
  IonInput,
  IonRow,
  IonCol,
  IonLabel,
  IonIcon,
} from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import FormComponent from "@/components/formcomponent/FormComponent.vue";
import ComponentSelection from "@/components/substrates/ComponentSelection.vue";
import localizationService from "@/services/general/LocalizationService";
import SubstrateService from "@/services/SubstrateService";
import ComponentService from "@/services/ComponentService";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  name: "SubstrateEditingModal",
  emits: ["close", "edited"],
  components: {
    IonModal,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardContent,
    IonCheckbox,
    IonInput,
    IonRow,
    IonCol,
    IonLabel,
    IonIcon,
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
  },
  data() {
    return {
      step: 1,
      editSubstrateData: {
        name: "",
        isPublic: false,
        image: null as File | null,
      },
      filteredComponents: [] as SubstrateComponent[],
      availableComponents: [] as SubstrateComponent[],
      selectedComponentIds: [] as number[],
      componentParts: {} as Record<number, number>,
      originalComponentIds: [] as number[],
      isLoading: false,
    };
  },
  async mounted() {
    // Initialize local editing data from the passed substrate prop
    this.editSubstrateData = {
      name: this.substrate.name,
      isPublic: this.substrate.isPublic,
      image: null,
    };

    // Set up initial component selections based on the substrate's components
    this.originalComponentIds = this.substrate.components.map(
      (component: SubstrateComponent) => component.id
    );
    this.substrate.components.forEach((component: SubstrateComponent) => {
      this.selectedComponentIds.push(component.id);
      this.componentParts[component.id] = component.parts;
    });

    await this.fetchAvailableComponents();
  },
  methods: {
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    async fetchAvailableComponents() {
      try {
        const response = await ComponentService.getComponents();

        // Initialize the filtered list with the full list of components
        this.availableComponents = [...response].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      } catch (error) {
        console.error("Error fetching components:", error);
        ToastService.showError({
          key: "substrate.load_components_failed",
          fallback: "Failed to load components",
        });
      }
    },
    goToStepOne() {
      this.step = 1;
    },
    goToStepTwo() {
      this.step = 2;
    },
    toggleSelectedComponent(id: number) {
      const index = this.selectedComponentIds.indexOf(id);
      if (index > -1) {
        this.selectedComponentIds.splice(index, 1);
        delete this.componentParts[id]; // Clear input value when deselected
      } else {
        this.selectedComponentIds.push(id);
      }
    },
    async editSubstrate() {
      if (this.selectedComponentIds.length === 0) {
        ToastService.showWarning({
          key: "substrate.select_component_required",
        });
        return;
      }

      // Detect changes in substrate metadata
      const metaChanged =
        this.editSubstrateData.name !== this.substrate.name ||
        this.editSubstrateData.isPublic !== this.substrate.isPublic ||
        !!this.editSubstrateData.image;

      // Detect changes in components
      const componentsChanged =
        // Check if selected component ids differ from original ones (by length or content)
        this.selectedComponentIds.length !== this.originalComponentIds.length ||
        this.selectedComponentIds.some(
          (id) => !this.originalComponentIds.includes(id)
        ) ||
        this.originalComponentIds.some(
          (id) => !this.selectedComponentIds.includes(id)
        ) ||
        // Check if parts changed for any component
        this.selectedComponentIds.some((id) => {
          const originalComponent = this.substrate.components.find(
            (c) => c.id === id
          );
          return (
            !originalComponent ||
            this.componentParts[id] !== originalComponent.parts
          );
        });

      if (!metaChanged && !componentsChanged) {
        // Nothing changed, just return early
        ToastService.showWarning({ key: "substrate.no_changes" });
        return;
      }

      this.loadingTimeout();

      try {
        if (componentsChanged && !metaChanged) {
          const components = this.selectedComponentIds.map((id) => ({
            componentId: id,
            parts: this.componentParts[id] || 1,
          })) as EditSubstrateComponent[];
          // Only components changed
          await SubstrateService.editSubstrateComponents(
            this.substrate.id,
            components
          );
          ToastService.showSuccess({ key: "substrate.components_updated" });
        } else if (!componentsChanged && metaChanged) {
          // Only meta changed
          const removedComponents = this.originalComponentIds.filter(
            (id) => !this.selectedComponentIds.includes(id)
          );
          const substrateData = {
            name: this.editSubstrateData.name,
            isPublic: this.editSubstrateData.isPublic || undefined,
            image: this.editSubstrateData.image || undefined,
          };
          await SubstrateService.editSubstrate(
            this.substrate.id,
            substrateData,
            removedComponents
          );
          ToastService.showSuccess({ key: "substrate.updated" });
        } else {
          // Both changed: do components update first (priority), then substrate update
          await SubstrateService.editSubstrateComponents(
            this.substrate.id,
            this.selectedComponentIds.map((id) => ({
              componentId: id,
              parts: this.componentParts[id] || 1,
            }))
          );
          const removedComponents = this.originalComponentIds.filter(
            (id) => !this.selectedComponentIds.includes(id)
          );
          const substrateData = {
            name: this.editSubstrateData.name,
            isPublic: this.editSubstrateData.isPublic || undefined,
            image: this.editSubstrateData.image || undefined,
          };
          await SubstrateService.editSubstrate(
            this.substrate.id,
            substrateData,
            removedComponents
          );
          ToastService.showSuccess({ key: "substrate.updated_both" });
        }

        this.resetSubstrate();

        this.isLoading = false;
        this.$emit("edited");
      } catch (error) {
        console.error("Error editing substrate or components:", error);
        ToastService.showError({ key: "substrate.update_error" });
      }
    },
    async deleteSubstrate() {
      try {
        this.loadingTimeout();
        const response = await SubstrateService.deleteSubstrate(
          this.substrate.id
        );
        if (response) {
          ToastService.showSuccess({ key: "substrate.deleted" });
          this.resetSubstrate();
          this.$emit("close");
          this.$router.push({ name: "substrate-overview" });
        }
      } catch (error) {
        console.error("Error deleting substrate:", error);
        ToastService.showError({ key: "substrate.delete_error" });
      }
    },
    loadingTimeout() {
      this.isLoading = true;
      const timeout_s = 10;
      setTimeout(() => {
        this.isLoading = false;
      }, timeout_s * 1000);
    },
    resetSubstrate() {
      this.editSubstrateData = {
        name: "",
        isPublic: false,
        image: null,
      };
      this.selectedComponentIds = [];
      this.componentParts = {};
      this.step = 1;
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

.component-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.component-selection {
  display: flex;
  align-items: center;
  gap: 12px;
}
h2 {
  text-align: center;
  margin-bottom: 16px;
}
ion-label h3 {
  font-size: 18px;
  margin: 0;
}
ion-label p {
  font-size: 14px;
  color: var(--ion-text-color-medium);
  margin: 0;
}
.action-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
  gap: 10px;
  padding-right: 20px;
  padding-left: 20px;
}
.action-buttons ion-button {
  width: 100%;
}
</style>
