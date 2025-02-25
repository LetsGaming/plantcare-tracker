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
      ></form-component>

      <!-- Step 2: SubstrateComponent Selection -->
      <ion-card v-if="step === 2" class="component-container align-middle">
        <h2>Wähle Komponenten für das Substrat</h2>

        <!-- Search Bar Integration -->
        <SearchBar
          :items="sortedComponents"
          searchKey="name"
          placeholder="Komponenten suchen..."
          @filtered="updateFilteredComponents"
        />

        <!-- Filtered and Sorted SubstrateComponent List -->
        <div class="component-list align-middle">
          <ion-item
            v-for="component in filteredComponents"
            :key="component.id"
            class="component-item"
          >
            <div class="component-content">
              <ion-text>
                {{ component.name }} ({{ component.fineness }})
              </ion-text>
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
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonItem,
  IonCard,
  IonCheckbox,
  IonInput,
  IonText,
} from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import FormComponent from "@/components/adding/FormComponent.vue";
import SearchBar from "@/components/SearchBar.vue";
import SubstrateService from "@/services/SubstrateService";
import ToastService from "@/services/general/ToastService";
import ComponentService from "@/services/ComponentService";

export default defineComponent({
  name: "SubstrateAddingModal",
  emits: ["close"],
  components: {
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonItem,
    IonCard,
    IonCheckbox,
    IonInput,
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
        image: null as File | null,
        isPublic: false,
      } as AddSubstrate,
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
        this.filteredComponents = this.sortedComponents; // initialize filtered list
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
    updateFilteredComponents(filtered: SubstrateComponent[]) {
      this.filteredComponents = filtered;
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
            this.$emit("close");
            this.$router.push("/substrates");
          } else {
            await this.imageUpload(substrateId, this.substrate.image);
            this.$emit("close");
            this.$router.push("/substrates");
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
        this.$emit("close");
        this.$router.push("/substrates");
      } catch (error) {
        console.error("Error uploading image:", error);
        ToastService.showError("Fehler beim Hochladen des Bildes");
      }
    },
  },
  async mounted() {
    await this.fetchAvailableComponents();
  },
  setup() {
    return { close };
  },
});
</script>

<style scoped>
/* General styling for a better UI look */
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
</style>
