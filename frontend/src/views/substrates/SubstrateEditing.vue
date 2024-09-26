<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <ion-buttons slot="start">
          <ion-back-button text="Zurück"></ion-back-button>
        </ion-buttons>
        <IonTitle>Substrat bearbeiten</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent>
      <!-- Step 1: Substrate Information Form -->
      <form-component
        v-if="step === 1"
        :item="substrate"
        :formFields="substrateFormFields"
        cardTitle="Substrat Informationen"
        submitLabel="Weiter"
        @submit-click="goToStepTwo"
      ></form-component>

      <!-- Step 2: Select Components -->
      <div class="component-container-wrapper">
        <ion-card v-if="step === 2" class="component-container">
          <h2>Komponenten für das Substrat bearbeiten</h2>

          <!-- Improved, more accessible component list -->
          <div class="component-list">
            <ion-row>
              <ion-col
                v-for="component in availableComponents"
                :key="component.id"
                class="component-item"
                size="2"
                size-xs="6"
              >
                <div class="component-content">
                  <ion-label>
                    <h3>{{ component.name }}</h3>
                    <p>Feinheit: {{ component.fineness }}</p>
                  </ion-label>
                  <div class="component-selection">
                    <IonCheckbox
                      :checked="selectedComponentIds.includes(component.id)"
                      @ionChange="toggleSelectedComponent(component.id)"
                    />
                    <IonInput
                      v-show="selectedComponentIds.includes(component.id)"
                      v-model="componentParts[component.id]"
                      type="number"
                      placeholder="Teile"
                      min="0.1"
                    />
                  </div>
                </div>
              </ion-col>
            </ion-row>
          </div>

          <!-- Action Buttons with Better Layout -->
          <div class="action-buttons">
            <IonButton expand="block" color="medium" @click="goToStepOne"
              >Zurück</IonButton
            >
            <IonButton expand="block" color="primary" @click="editSubstrate"
              >Substrat speichern</IonButton
            >
          </div>
        </ion-card>
      </div>
    </IonContent>
  </IonPage>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonButton,
  IonTitle,
  IonContent,
  IonItem,
  IonCard,
  IonCheckbox,
  IonInput,
  IonText,
  IonRow,
  IonCol,
  IonLabel,
} from "@ionic/vue";
import FormComponent from "@/components/adding/FormComponent.vue";
import SubstrateService from "@/services/SubstrateService";
import ToastService from "@/services/general/ToastService";
import ComponentService from "@/services/ComponentService";

export default defineComponent({
  components: {
    IonPage,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonTitle,
    IonContent,
    IonItem,
    IonCard,
    IonCheckbox,
    IonInput,
    IonText,
    IonRow,
    IonCol,
    IonLabel,
    FormComponent,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      step: 1,
      substrate: {
        name: "",
      } as EditSubstrate, // Use EditSubstrate for editing
      availableComponents: [] as Component[],
      selectedComponentIds: [] as number[],
      componentParts: {} as Record<number, number>,
      originalComponentIds: [] as number[], // Store the original component IDs
    };
  },
  computed: {
    substrateId() {
      return Number.parseInt(this.id);
    },
    substrateFormFields(): FormField[] {
      return [
        {
          type: "input",
          modelKey: "name",
          label: "Substratname",
          required: true,
        },
      ];
    },
  },
  methods: {
    async fetchAvailableComponents() {
      try {
        const response = await ComponentService.getComponents();
        this.availableComponents = response;
      } catch (error) {
        console.error("Error fetching components:", error);
        ToastService.showError("Fehler beim Laden der Komponenten");
      }
    },
    async fetchSubstrateDetails() {
      try {
        const substrate = await SubstrateService.getSubstrateById(
          this.substrateId
        );
        this.substrate = { ...substrate }; // Set substrate data for form
        this.originalComponentIds = substrate.components.map(
          (component: Component) => component.id
        ); // Save original components

        // Set initial component selections
        substrate.components.forEach((component: Component) => {
          this.selectedComponentIds.push(component.id);
          this.componentParts[component.id] = component.parts;
        });
      } catch (error) {
        console.error("Error fetching substrate details:", error);
        ToastService.showError("Fehler beim Laden des Substrats");
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

      const removedComponents = this.originalComponentIds.filter(
        (id) => !this.selectedComponentIds.includes(id)
      );

      const componentsData = {
        name: this.substrate.name,
        components: this.selectedComponentIds.map((id) => ({
          componentId: id,
          parts: this.componentParts[id] || 1,
        })),
      } as EditSubstrate;
      
      try {
        const response = await SubstrateService.editSubstrate(
          this.substrateId,
          componentsData,
          removedComponents
        );

        if (response) {
          ToastService.showSuccess("Substrat erfolgreich aktualisiert");
          this.$router.push({ name: "substrate-overview" }); // Redirect after success
        }
      } catch (error) {
        console.error("Error editing substrate:", error);
        ToastService.showError("Fehler beim Aktualisieren des Substrats");
      }
    },
  },
  async mounted() {
    // Fetch components and substrate details
    await this.fetchAvailableComponents();
    await this.fetchSubstrateDetails();
  },
});
</script>

<style scoped>
.component-container-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 16px;
}
.component-container {
  overflow-y: scroll;
  display: flex;
  flex-direction: column;
  padding: 16px;
  max-width: 800px;
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
}

ion-button {
  width: 48%;
}
</style>
