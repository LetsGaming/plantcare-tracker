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
              { value: false, label: 'Privat' }
            ],
          },
          {
            type: 'file',
            label: 'Bild hochladen',
            modelKey: 'image',
          }
        ]"
        cardTitle="Substrat Informationen"
        submitLabel="Weiter"
        @submit-click="goToStepTwo"
        @delete-click="deleteSubstrate"
      ></form-component>

      <!-- Step 2: Edit Components -->
      <div class="component-container-wrapper" v-if="step === 2">
        <ion-card class="component-container">
          <h2>Komponenten für das Substrat bearbeiten</h2>
          <SearchBar
            :items="availableComponents"
            searchKey="name"
            @filtered="filteredComponents = $event"
          />
          <div class="component-list">
            <ion-row>
              <ion-col
                v-for="component in filteredComponents"
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

          <!-- Action Buttons -->
          <div class="action-buttons">
            <IonButton expand="block" color="medium" @click="goToStepOne">
              Zurück
            </IonButton>
            <IonButton expand="block" color="primary" @click="editSubstrate">
              Substrat speichern
            </IonButton>
          </div>
        </ion-card>
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
  IonCheckbox,
  IonInput,
  IonRow,
  IonCol,
  IonLabel,
  IonIcon,
} from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import FormComponent from "@/components/adding/FormComponent.vue";
import SearchBar from "@/components/SearchBar.vue";
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
    IonCheckbox,
    IonInput,
    IonRow,
    IonCol,
    IonLabel,
    IonIcon,
    ModalHeader,
    FormComponent,
    SearchBar,
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
      } as EditSubstrate,
      filteredComponents: [] as Component[],
      availableComponents: [] as Component[],
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
    };

    // Set up initial component selections based on the substrate's components
    this.originalComponentIds = this.substrate.components.map(
      (component: Component) => component.id
    );
    this.substrate.components.forEach((component: Component) => {
      this.selectedComponentIds.push(component.id);
      this.componentParts[component.id] = component.parts;
    });

    await this.fetchAvailableComponents();
  },
  methods: {
    async fetchAvailableComponents() {
      try {
        const response = await ComponentService.getComponents();
        this.availableComponents = response;
        // Initialize the filtered list
        this.filteredComponents = response;
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
      } else {
        this.selectedComponentIds.push(id);
      }
    },
    async editSubstrate() {
      if (this.selectedComponentIds.length === 0) {
        ToastService.showWarning("Bitte wählen Sie mindestens eine Komponente aus!");
        return;
      }

      // Determine which components have been removed
      const removedComponents = this.originalComponentIds.filter(
        (id) => !this.selectedComponentIds.includes(id)
      );

      const componentsData = {
        name: this.editSubstrateData.name,
        components: this.selectedComponentIds.map((id) => ({
          componentId: id,
          parts: this.componentParts[id] || 1,
        })),
        isPublic: this.editSubstrateData.isPublic,
        image: this.editSubstrateData.image,
      } as EditSubstrate;

      try {
        const response = await SubstrateService.editSubstrate(
          this.substrate.id,
          componentsData,
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
        const response = await SubstrateService.deleteSubstrate(this.substrate.id);
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
</style>
