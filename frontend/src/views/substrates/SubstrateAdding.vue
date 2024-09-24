<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <ion-buttons slot="start">
          <ion-back-button text="Zurück"></ion-back-button>
        </ion-buttons>
        <IonTitle>Neues Substrat hinzufügen</IonTitle>
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
        @submit="goToStepTwo"
      ></form-component>

      <!-- Step 2: Select Components -->
      <ion-card v-if="step === 2" class="component-container">
        <h2>Wähle Komponenten für das Substrat</h2>

        <!-- Improved Component Item Display -->
        <div class="component-list">
          <ion-item
            v-for="component in availableComponents"
            :key="component.id"
            class="component-item"
          >
            <div class="component-content">
              <ion-text
                >{{ component.name }} ({{ component.fineness }})</ion-text
              >
              <div class="component-selection">
                <IonCheckbox
                  :value="component.id"
                  @ionChange="toggleSelectedComponent(component.id)"
                />
                <IonInput
                  v-if="selectedComponentIds.includes(component.id)"
                  v-model="componentParts[component.id]"
                  type="number"
                  placeholder="Teile"
                  min="1"
                />
              </div>
            </div>
          </ion-item>
        </div>

        <IonButton expand="block" @click="addSubstrate"
          >Substrat hinzufügen</IonButton
        >
      </ion-card>
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
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonCheckbox,
  IonInput,
  IonText,
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
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonCheckbox,
    IonInput,
    IonText,

    FormComponent,
  },
  data() {
    return {
      step: 1, // Control the step (1 for form, 2 for components selection)
      substrate: {
        name: "",
      } as AddSubstrate,
      availableComponents: [] as Component[], // Store available components
      selectedComponentIds: [] as number[], // Store selected component IDs
      componentParts: {} as Record<number, number>, // Store parts per component
    };
  },
  computed: {
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
    goToStepTwo() {
      if (!this.substrate.name) {
        ToastService.showWarning("Substratname ist erforderlich!");
        return;
      }
      this.step = 2; // Move to step 2 (component selection)
    },
    toggleSelectedComponent(id: number) {
      const index = this.selectedComponentIds.indexOf(id);
      if (index > -1) {
        this.selectedComponentIds.splice(index, 1);
      } else {
        this.selectedComponentIds.push(id);
      }
    },
    async addSubstrate() {
      if (this.selectedComponentIds.length === 0) {
        ToastService.showWarning(
          "Bitte wählen Sie mindestens eine Komponente aus!"
        );
        return;
      }

      // Prepare components data
      const componentsData = {
        substrateId: 0, // This will be updated after substrate is created
        components: this.selectedComponentIds.map((id) => ({
          componentId: id,
          parts: this.componentParts[id] || 1, // Use specified parts or default to 1
        })),
      };

      try {
        const response = await SubstrateService.addSubstrateWithComponents(
          this.substrate,
          componentsData
        );

        if (response) {
          ToastService.showSuccess(
            "Substrat und Komponenten erfolgreich hinzugefügt"
          );
          this.$router.push("/substrates"); // Redirect after success
        }
      } catch (error) {
        console.error("Error adding substrate:", error);
        ToastService.showError("Fehler beim Hinzufügen des Substrats");
      }
    },
  },
  mounted() {
    this.fetchAvailableComponents();
  },
});
</script>

<style scoped>
/* General styling for better UI look */
.step-indicator {
  display: flex;
  justify-content: space-between;
  margin: 20px;
  font-weight: bold;
}

.active-step {
  color: var(--ion-color-primary);
  font-weight: bold;
}

.component-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
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

ion-card {
  width: 100%;
}

.component-item {
  display: flex;
  flex-wrap: wrap;
  flex-direction: column;
  --min-height: auto;
}

ion-button {
  margin-top: 20px;
}
</style>
