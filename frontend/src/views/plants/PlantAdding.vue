<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <ion-buttons slot="start">
          <ion-back-button text="Zurück"></ion-back-button>
        </ion-buttons>
        <IonTitle>Neue Pflanze hinzufügen</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent>
      <div class="form-container">
        <IonCard>
          <IonCardHeader>
            <IonCardTitle>Pflanzen Informationen</IonCardTitle>
          </IonCardHeader>
          <IonCardContent v-if="plant">
            <!-- Plant Name -->
            <IonItem>
              <IonInput
                v-model="plant.name"
                label="Name"
                label-placement="floating"
                required
              />
            </IonItem>

            <!-- Plant Species -->
            <IonItem>
              <IonInput
                v-model="plant.species"
                label="Spezies"
                label-placement="floating"
                required
              />
            </IonItem>

            <!-- Substrate ID (Dropdown) -->
            <IonItem>
              <IonSelect v-model="plant.substrateId" label="Substrat" placeholder="Select Substrate">
                <IonSelectOption
                  v-for="substrate in substrates"
                  :key="substrate.substrate_id"
                  :value="substrate.substrate_id"
                >
                  {{ substrate.substrate_name }}
                </IonSelectOption>
              </IonSelect>
            </IonItem>

            <!-- Plant Visibility (Public/Private Radio Buttons) -->
            <IonItem>
              <IonLabel>Sichtbarkeit</IonLabel>
              <IonRadioGroup v-model="plant.isPublic">
                <IonItem>
                  <IonRadio slot="start" :value="true">Öffentlich</IonRadio>
                  <IonRadio slot="start" :value="false">Privat</IonRadio>
                </IonItem>
              </IonRadioGroup>
            </IonItem>

            <!-- Add Button -->
            <IonButton expand="full" color="primary" @click="addPlant">Add Plant</IonButton>
          </IonCardContent>
        </IonCard>
      </div>
    </IonContent>
  </IonPage>
</template>

<script lang="ts">
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
  IonInput,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonRadioGroup,
  IonRadio,
} from "@ionic/vue";
import PlantService from "@/services/PlantService";
import SubstrateService from "@/services/SubstrateService";
import ToastService from "@/services/ToastService";

export default {
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
    IonInput,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonRadioGroup,
    IonRadio,
  },
  data() {
    return {
      plant: { 
        name: "",
        species: "",
        substrateId: 0,
        isPublic: false, // Default to private
      } as AddPlant,
      substrates: [] as any[], // Substrate data will be fetched from API
    };
  },
  methods: {
    async fetchSubstrates() {
      try {
        const response = await SubstrateService.getSubstrates();
        this.substrates = response;
      } catch (error) {
        console.error("Error fetching substrates:", error);
      }
    },
    async addPlant() {
      if (!this.plant.name || !this.plant.species || !this.plant.substrateId) {
        ToastService.showWarning("All fields are required!");
        return;
      }

      try {
        const response = await PlantService.addPlant(this.plant);
        if (response) {
          this.$router.push("/plants"); // Redirect to plant list after success
        }
      } catch (error) {
        console.error("Error:", error);
        ToastService.showError("Error while adding the plant");
      }
    },
  },
  async mounted() {
    await this.fetchSubstrates(); // Fetch substrates when component mounts
  },
};
</script>

<style scoped>
.form-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 16px;
}

ion-card {
  width: 100%;
  max-width: 500px;
}
</style>
