<template>
  <div class="form-container">
    <IonCard>
      <IonCardHeader>
        <IonToolbar>
          <IonCardTitle>{{ cardTitle }}</IonCardTitle>
          <ion-icon
            :Icon="trashBin"
            @click="showDeleteModal = true"
            slot="end"
          />
        </IonToolbar>
      </IonCardHeader>
      <IonCardContent v-if="item">
        <!-- Dynamic Form Fields -->
        <div v-for="field in formFields" :key="field.modelKey">
          <IonItem v-if="field.type === 'input'">
            <IonInput
              v-model="item[field.modelKey]"
              :label="field.label"
              label-placement="floating"
              :required="field.required"
            />
          </IonItem>
          <IonItem v-else-if="field.type === 'select'">
            <IonSelect
              v-model="item[field.modelKey]"
              :label="field.label"
              :placeholder="field.placeholder"
            >
              <IonSelectOption
                v-for="option in field.options"
                :key="option.id"
                :value="option.id"
              >
                {{ option.name }}
              </IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem v-else-if="field.type === 'radio'">
            <IonLabel>{{ field.label }}</IonLabel>
            <IonRadioGroup v-model="item[field.modelKey]">
              <IonItem>
                <IonRadio
                  :slot="index < 1 ? 'start' : 'end'"
                  v-for="(option, index) in field.options"
                  :value="option.value"
                >
                  {{ option.label }}
                </IonRadio>
              </IonItem>
            </IonRadioGroup>
          </IonItem>
          <IonItem v-else-if="field.type === 'switch'">
            <IonLabel>{{ field.label }}</IonLabel>
            <IonToggle v-model="item[field.modelKey]" />
          </IonItem>
          <IonItem v-else-if="field.type === 'file'">
            <IonLabel>{{ field.label }}</IonLabel>
            <input
              type="file"
              accept="image/*"
              @change="onFileChange"
              ref="fileInput"
              class="file-input"
            />
          </IonItem>
        </div>

        <!-- Submit Button -->
        <IonButton expand="full" color="primary" @click="submitForm">
          {{ submitLabel }}
        </IonButton>
      </IonCardContent>
    </IonCard>

    <!-- Extra Content Component -->
    <div
      v-if="extraContentComponent && extraContentData"
      class="extra-content-wrapper"
    >
      <component :is="extraContentComponent" v-bind="extraContentData" />
    </div>
  </div>
  <IonModal v-model:isOpen="showDeleteModal">
    <IonHeader>
      <IonToolbar>
        <IonTitle>Löschen</IonTitle>
        <IonButtons slot="end">
          <IonButton @click="showDeleteModal = false">
            <IonIcon :icon="closeOutline" />
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent>
      <div class="modal-card-container">
        <IonCard>
          <IonCardHeader>
            <IonCardTitle
              >Sind Sie sicher, dass Sie
              <span style="color: var(--ion-color-primary-tint); white-space: nowrap">{{
                item.name
              }}</span>
              löschen wollen?</IonCardTitle
            >
          </IonCardHeader>
          <IonCardContent>
            <IonRow>
              <IonButton
                expand="full"
                color="danger"
                @click="showDeleteModal = false"
              >
                Abbrechen
              </IonButton>
              <!-- Submit Button -->
              <IonButton expand="full" color="primary" @click="submitDelete">
                Löschen
              </IonButton>
            </IonRow>
          </IonCardContent>
        </IonCard>
      </div>
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonLabel,
  IonRadioGroup,
  IonRadio,
  IonButton,
  IonToolbar,
  IonHeader,
  IonToggle,
  IonIcon,
  IonModal,
  IonRow,
  IonContent,
  IonButtons,
  IonTitle,
} from "@ionic/vue";

import { closeOutline, trashBin } from "ionicons/icons";

export default defineComponent({
  name: "FormComponent",
  components: {
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonLabel,
    IonRadioGroup,
    IonRadio,
    IonButton,
    IonToolbar,
    IonHeader,
    IonToggle,
    IonIcon,
    IonModal,
    IonRow,
    IonContent,
    IonButtons,
    IonTitle,
  },
  props: {
    item: {
      type: Object as PropType<Record<string, any>>,
      required: true,
    },
    formFields: {
      type: Array as PropType<FormField[]>,
      required: true,
    },
    cardTitle: {
      type: String,
      default: "Form",
    },
    submitLabel: {
      type: String,
      default: "Submit",
    },
    extraContentComponent: {
      type: Object as PropType<any>, // The component itself
      default: null,
    },
    extraContentData: {
      type: Object as PropType<Record<string, any>>, // Data to pass to the extra component
      default: () => ({}),
    },
    onSubmitClick: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onDeleteClick: {
      type: Function as PropType<() => void>,
      required: false,
    },
  },
  data() {
    return {
      showDeleteModal: false,
    };
  },
  setup() {
    return {
      closeOutline,
      trashBin,
    };
  },
  methods: {
    onFileChange(event: Event) {
      const target = event.target as HTMLInputElement;
      const files = target.files;
      if (files) {
        this.item.image = files[0];
      }
    },
    submitForm() {
      this.onSubmitClick();
    },
    submitDelete() {
      this.showDeleteModal = false;
      this.onDeleteClick && this.onDeleteClick();
    },
  },
});
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

.extra-content-wrapper {
  width: 100%;
  max-width: 500px;
}

ion-card {
  width: 100%;
  max-width: 500px;
}
</style>
