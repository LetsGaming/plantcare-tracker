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
        :is-loading="isLoading"
      />

      <!-- Step 2: SubstrateComponent Selection -->

      <!-- Filtered and Sorted SubstrateComponent List -->
      <div class="component-list" v-if="step === 2">
        <component-selection
          title="Wähle Komponenten für das Substrat"
          :components="availableComponents"
          :selected-component-ids="selectedComponentIds"
          :component-parts="componentParts"
          @toggle-component="toggleSelectedComponent"
        ></component-selection>
      </div>

      <div class="action-buttons" v-if="step === 2">
        <IonButton expand="full" color="medium" @click="goToStepOne">
          Zurück
        </IonButton>
        <IonButton
          expand="full"
          color="primary"
          @click="addSubstrate"
          :disabled="isLoading"
        >
          Substrat speichern
        </IonButton>
      </div>
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
import FormComponent from "@/components/formcomponent/FormComponent.vue";
import ComponentSelection from "@/components/substrates/ComponentSelection.vue";
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
    ComponentSelection,
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
      selectedComponentIds: [] as number[],
      componentParts: {} as Record<number, number>,
      isLoading: false,
    };
  },
  computed: {
    sortedComponents(): SubstrateComponent[] {
      return [...this.availableComponents].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    },
  },
  async mounted() {
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
        this.loadingTimeout();
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
          this.resetSubstrate();
        }
      } catch (error) {
        console.error("Error adding substrate:", error);
        ToastService.showError("Fehler beim Hinzufügen des Substrats");
      }
    },
    async imageUpload(id: number, file: File) {
      try {
        this.loadingTimeout();
        const response = await SubstrateService.uploadSubstrateImage(id, file);
        if (response) {
          ToastService.showSuccess(
            "Substrat und Komponenten erfolgreich hinzugefügt"
          );
          this.$emit("added");
        } else {
          ToastService.showError("Fehler beim Hochladen des Bildes");
        }
      } catch (error) {
        console.error("Error uploading image:", error);
        ToastService.showError("Fehler beim Hochladen des Bildes");
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
      this.substrate = {
        name: "",
        image: undefined,
        isPublic: false,
      };
      this.selectedComponentIds = [];
      this.componentParts = {};
      this.step = 1;
    },
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
