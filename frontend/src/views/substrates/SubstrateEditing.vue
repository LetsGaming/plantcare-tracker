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
      <form-component
        :item="editSubstrateData"
        :formFields="[
          { type: 'input', modelKey: 'name', label: 'Name', required: true },
        ]"
        cardTitle="Substrat Informationen"
        submitLabel="Substrat speichern"
        @submitClick="editSubstrate"
      ></form-component>
      <template v-if="selectedSubstrate">
        <SubstrateComponentsEditor
          :existingSubstrate="selectedSubstrate"
          @removeComponent="removeComponent"
        />
      </template>
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
  IonTitle,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonButton,
} from "@ionic/vue";
import SubstrateService from "@/services/SubstrateService";
import ToastService from "@/services/general/ToastService";
import FormComponent from "@/components/adding/FormComponent.vue";
import SubstrateComponentsEditor from "@/components/substrates/SubstrateComponentsEditor.vue";

export default defineComponent({
  components: {
    IonPage,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonItem,
    IonLabel,
    IonButton,
    FormComponent,
    SubstrateComponentsEditor,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      selectedSubstrate: null as null | Substrate,
      editSubstrateData: {
        name: "",
        components: [] as EditSubstrateComponent[],
      } as EditSubstrate,
      removedComponents: [] as number[], // IDs of components marked for removal
    };
  },
  async mounted() {
    await this.fetchSubstrate(); // Fetch the substrate details when the component mounts
  },
  computed: {
    substrateId() {
      return Number.parseInt(this.id);
    },
  },
  methods: {
    async fetchSubstrate() {
      try {
        const response = await SubstrateService.getSubstrateById(
          this.substrateId
        );
        this.selectedSubstrate = response;
      } catch (error) {
        console.error("Error fetching substrate:", error);
        ToastService.showError("Fehler beim Laden des Substrats.");
      }
    },
    removeComponent(index: number) {
      if (!this.selectedSubstrate) return;

      const component = this.selectedSubstrate.components.find(
        (component: Component) => component.id === index
      );
      if (component) {
        this.removedComponents.push(component.id);
        this.editSubstrateData.components.splice(index, 1);
      }
    },
    async editSubstrate() {
      try {
        const response = await SubstrateService.editSubstrate(
          this.substrateId,
          this.editSubstrateData,
          this.removedComponents
        );
        if (response) {
          this.$router.push({ name: "substrate-overview" });
          ToastService.showSuccess("Substrat erfolgreich bearbeitet.");
        }
      } catch (error) {
        console.error("Error editing substrate:", error);
        ToastService.showError("Fehler beim Bearbeiten des Substrats.");
      }
    },
  },
});
</script>
