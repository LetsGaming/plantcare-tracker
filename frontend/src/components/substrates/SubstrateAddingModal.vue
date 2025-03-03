<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader headerTitle="Substrat hinzufügen" @close="$emit('close')" />
    <IonContent>
      <!-- Step 1: Substrate Information Form -->
      <form-component
        v-if="step === 1"
        :item="substrate"
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
      />

      <!-- Step 2: SubstrateComponent Selection -->
      <ion-card v-if="step === 2" class="component-container align-middle">
        <h2>Wähle Komponenten für das Substrat</h2>

        <!-- Updated Search Bar Integration -->
        <SearchBar
          placeholder="Komponenten suchen..."
          @search="filterComponents"
        />

        <!-- Filtered and Sorted SubstrateComponent List -->
        <div class="component-list align-middle">
          <ion-item
            v-for="component in filteredComponents"
            :key="component.id"
            class="component-item"
          >
            <div class="component-content">
              <ion-row style="width: 100%">
                <ion-col>
                  <div class="component-selection-title">
                    <ion-text>
                      {{ component.name }} ({{ component.fineness }})
                    </ion-text>
                  </div>
                </ion-col>
                <ion-col>
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
                      style="text-align: left; margin-left: 5%"
                    />
                  </div>
                </ion-col>
              </ion-row>
            </div>
          </ion-item>
        </div>

        <IonButton expand="block" @click="addSubstrate">
          Substrat hinzufügen
        </IonButton>
      </ion-card>
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonModal,
  IonContent,
  IonCard,
  IonButton,
  IonItem,
  IonRow,
  IonCol,
  IonInput,
  IonCheckbox,
  IonText,
} from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import FormComponent from "@/components/FormComponent.vue";
import SearchBar from "@/components/SearchBar.vue";
import SubstrateService from "@/services/SubstrateService";
import ToastService from "@/services/general/ToastService";
import ComponentService from "@/services/ComponentService";

export default defineComponent({
  name: "SubstrateAddingModal",
  emits: ["close", "added"],
  components: {
    IonModal,
    IonContent,
    IonCard,
    IonButton,
    IonItem,
    IonRow,
    IonCol,
    IonInput,
    IonCheckbox,
    IonText,
    ModalHeader,
    FormComponent,
    SearchBar,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
  },
  data() {
    return {
      step: 1, // 1: form, 2: component selection
      substrate: {
        name: "",
        image: undefined as File | undefined,
        isPublic: false,
      },
      availableComponents: [] as SubstrateComponent[],
      filteredComponents: [] as SubstrateComponent[],
      selectedComponentIds: [] as number[],
      componentParts: {} as Record<number, number>,
    };
  },
  computed: {
    sortedComponents(): SubstrateComponent[] {
      return [...this.availableComponents].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    },
  },
  methods: {
    async fetchAvailableComponents() {
      try {
        const response = await ComponentService.getComponents();
        this.availableComponents = response;
        // Initialize the filtered list with the sorted components
        this.filteredComponents = this.sortedComponents;
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
    // New filtering method that uses the emitted search query
    filterComponents(query: string) {
      const lowerQuery = query.toLowerCase();
      this.filteredComponents = this.sortedComponents.filter((component) =>
        component.name.toLowerCase().includes(lowerQuery)
      );
    },
    async addSubstrate() {
      if (this.selectedComponentIds.length === 0) {
        ToastService.showWarning(
          "Bitte wählen Sie mindestens eine Komponente aus!"
        );
        return;
      }

      const componentsData = {
        substrateId: 0, // to be updated after substrate creation
        components: this.selectedComponentIds.map((id) => ({
          componentId: id,
          parts: this.componentParts[id] || 1,
        })),
      };

      try {
        const response = await SubstrateService.addSubstrateWithComponents(
          this.substrate,
          componentsData
        );

        if (response) {
          const substrateId = response.substrate.substrateId;
          if (!this.substrate.image) {
            ToastService.showSuccess(
              "Substrat und Komponenten erfolgreich hinzugefügt"
            );
            this.$emit("added");
          } else {
            await this.imageUpload(substrateId, this.substrate.image);
          }
        }
      } catch (error) {
        console.error("Error adding substrate:", error);
        ToastService.showError("Fehler beim Hinzufügen des Substrats");
      }
    },
    async imageUpload(id: number, file: File) {
      try {
        await SubstrateService.uploadSubstrateImage(id, file);
        ToastService.showSuccess(
          "Substrat und Komponenten erfolgreich hinzugefügt"
        );
        this.$emit("added");
      } catch (error) {
        console.error("Error uploading image:", error);
        ToastService.showError("Fehler beim Hochladen des Bildes");
      }
    },
  },
  async mounted() {
    await this.fetchAvailableComponents();
  },
});
</script>

<style scoped>
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
.component-content {
  display: contents;
  width: 100%;
}
.component-selection-title {
  display: flex;
  align-items: center;
  height: 100%;
}
.component-selection {
  display: flex;
  align-items: center;
  height: 100%;
}
</style>
