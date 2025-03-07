<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader headerTitle="Substrat bearbeiten" @close="$emit('close')" />
    <IonContent>
      <!-- Step 1: Substrate Information Form -->
      <form-component
        v-if="step === 1"
        :item="editSubstrateData"
        :formFields="[
          {
            type: 'input',
            modelKey: 'name',
            label: 'Substratname',
            required: true,
          },
          {
            type: 'radio',
            modelKey: 'isPublic',
            label: 'Sichtbarkeit',
            options: [
              { value: true, label: 'Öffentlich' },
              { value: false, label: 'Privat' },
            ],
            defaultValue: Boolean(substrate.isPublic),
          },
          {
            type: 'file',
            label: 'Bild hochladen',
            modelKey: 'image',
          },
        ]"
        cardTitle="Substrat Informationen"
        submitLabel="Weiter"
        @submit-click="goToStepTwo"
        @delete-click="deleteSubstrate"
      ></form-component>

      <!-- Step 2: Edit Components -->
      <div class="component-container-wrapper" v-if="step === 2">
        <ComponentSelection
          title="Komponenten für das Substrat bearbeiten"
          :components="availableComponents"
          :selectedComponentIds="selectedComponentIds"
          :componentParts="componentParts"
          @toggle-component="toggleSelectedComponent"
        />
      </div>
      <!-- Action Buttons -->
      <div class="action-buttons">
        <IonButton expand="full" color="medium" @click="goToStepOne">
          Zurück
        </IonButton>
        <IonButton expand="full" color="primary" @click="editSubstrate">
          Substrat speichern
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
import SubstrateService from "@/services/SubstrateService";
import ComponentService from "@/services/ComponentService";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  name: "SubstrateEditingModal",
  emits: ["close"],
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
    async fetchAvailableComponents() {
      try {
        const response = await ComponentService.getComponents();

        // Initialize the filtered list with the full list of components
        this.availableComponents = [...response].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      } catch (error) {
        console.error("Error fetching components:", error);
        ToastService.showError("Fehler beim Laden der Komponenten");
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
        ToastService.showWarning(
          "Bitte wählen Sie mindestens eine Komponente aus!"
        );
        return;
      }

      // Determine which components have been removed
      const removedComponents = this.originalComponentIds.filter(
        (id) => !this.selectedComponentIds.includes(id)
      );

      const substrateData = {
        name: this.editSubstrateData.name,
        components: this.selectedComponentIds.map((id) => ({
          componentId: id,
          parts: this.componentParts[id] || 1,
        })),
        isPublic: this.editSubstrateData.isPublic,
        image: this.editSubstrateData.image || undefined,
      };

      try {
        const response = await SubstrateService.editSubstrate(
          this.substrate.id,
          substrateData,
          removedComponents
        );
        if (response) {
          ToastService.showSuccess("Substrat erfolgreich aktualisiert");
          this.$emit("close");
          this.$router.push({ name: "substrate-overview" });
        }
      } catch (error) {
        console.error("Error editing substrate:", error);
        ToastService.showError("Fehler beim Aktualisieren des Substrats");
      }
    },
    async deleteSubstrate() {
      try {
        const response = await SubstrateService.deleteSubstrate(
          this.substrate.id
        );
        if (response) {
          ToastService.showSuccess("Substrat erfolgreich gelöscht");
          this.$emit("close");
          this.$router.push({ name: "substrate-overview" });
        }
      } catch (error) {
        console.error("Error deleting substrate:", error);
        ToastService.showError("Fehler beim Löschen des Substrats");
      }
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
