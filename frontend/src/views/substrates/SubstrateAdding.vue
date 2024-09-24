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
      <form-component
        :item="substrate"
        :formFields="substrateFormFields"
        cardTitle="Substrat Informationen"
        submitLabel="Substrat hinzufügen"
        @submit="prepareAddSubstrate"
      ></form-component>
      <div class="component-container">
        <h2>Wähle Komponenten für das Substrat</h2>
        <div v-for="component in availableComponents" :key="component.id">
          <input
            type="checkbox"
            :value="component.id"
            v-model="selectedComponentIds"
          />
          {{ component.name }} ({{ component.fineness }})
        </div>
        <ion-button @click="addSubstrate">Substrat hinzufügen</ion-button>
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
    FormComponent,
  },
  data() {
    return {
      substrate: {
        name: "",
      } as AddSubstrate,
      availableComponents: [] as Component[], // Store available components
      selectedComponentIds: [] as number[], // Store selected component IDs
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
      // Replace with actual fetching logic for available components
      try {
        const response = await ComponentService.getComponents(); // This method needs to be implemented in your service
        this.availableComponents = response; // Assuming response is an array of components
      } catch (error) {
        console.error("Error fetching components:", error);
        ToastService.showError("Fehler beim Laden der Komponenten");
      }
    },
    async prepareAddSubstrate() {
      if (!this.substrate.name) {
        ToastService.showWarning("Substratname ist erforderlich!");
        return;
      }
      await this.addSubstrate(); // Call addSubstrate to handle the submission
    },
    async addSubstrate() {
      // Check if at least one component is selected
      if (this.selectedComponentIds.length === 0) {
        ToastService.showWarning(
          "Bitte wählen Sie mindestens eine Komponente aus!"
        );
        return;
      }

      // Prepare components data
      const componentsData: AddSubstrateComponents = {
        substrateId: 0, // This will be updated after substrate is created
        components: this.selectedComponentIds.map((id) => ({
          componentId: id,
          parts: 1, // Assuming a default value for parts
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
          this.$router.push("/substrates"); // Redirect to substrate list after success
        }
      } catch (error) {
        console.error("Error adding substrate:", error);
        ToastService.showError("Fehler beim Hinzufügen des Substrats");
      }
    },
  },
  mounted() {
    this.fetchAvailableComponents(); // Fetch available components when the component mounts
  },
});
</script>

<style scoped>
.component-container {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-flow: column;
}
</style>
