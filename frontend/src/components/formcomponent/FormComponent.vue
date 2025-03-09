<template>
  <div class="form-container">
    <IonCard
      style="margin-top: auto; margin-inline: 0px !important"
      class="align-middle"
    >
      <IonCardHeader>
        <IonToolbar>
          <IonCardTitle>{{ cardTitle }}</IonCardTitle>
          <ion-icon
            v-if="onDeleteClick"
            :Icon="trashBin"
            @click="showDeleteModal = true"
            slot="end"
          />
        </IonToolbar>
      </IonCardHeader>
      <IonCardContent v-if="item">
        <!-- Dynamic Form Fields -->
        <div v-for="field in formFields" :key="field.modelKey">
          <InputField
            v-if="field.type === 'input'"
            :field="field"
            v-model="item[field.modelKey]"
          />
          <SelectField
            v-else-if="field.type === 'select'"
            :field="field"
            v-model="item[field.modelKey]"
          />
          <RadioField
            v-else-if="field.type === 'radio'"
            :field="field"
            v-model="item[field.modelKey]"
          />
          <DateField
            v-else-if="field.type === 'date'"
            :field="field"
            v-model="item[field.modelKey]"
          />
          <SwitchField
            v-else-if="field.type === 'switch'"
            :field="field"
            v-model="item[field.modelKey]"
          />
          <UploadField
            v-else-if="field.type === 'file'"
            :field="field"
            v-model="item[field.modelKey]"
          />
        </div>

        <!-- Submit Button -->
        <IonButton expand="full" color="primary" @click="submitForm">
          {{ submitLabel }}
        </IonButton>
      </IonCardContent>
    </IonCard>

    <!-- Extra Content SubstrateComponent -->
    <div
      v-if="extraContentComponent && extraContentData"
      class="extra-content-wrapper align-middle"
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
            <IonCardTitle>
              Sind Sie sicher, dass Sie
              <span
                style="
                  color: var(--ion-color-primary-tint);
                  white-space: nowrap;
                "
              >
                {{ item.name }}
              </span>
              löschen wollen?
            </IonCardTitle>
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
  IonButton,
  IonToolbar,
  IonHeader,
  IonIcon,
  IonModal,
  IonRow,
  IonContent,
  IonButtons,
  IonTitle,
} from "@ionic/vue";

import { closeOutline, trashBin } from "ionicons/icons";

import InputField from "@/components/formcomponent/fields/InputField.vue";
import SelectField from "@/components/formcomponent/fields/SelectField.vue";
import RadioField from "@/components/formcomponent/fields/RadioField.vue";
import SwitchField from "@/components/formcomponent/fields/SwitchField.vue";
import DateField from "@/components/formcomponent/fields/DateField.vue";
import UploadField from "@/components/formcomponent/fields/UploadField.vue";

export default defineComponent({
  name: "FormComponent",
  components: {
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonToolbar,
    IonHeader,
    IonIcon,
    IonModal,
    IonRow,
    IonContent,
    IonButtons,
    IonTitle,
    InputField,
    SelectField,
    RadioField,
    SwitchField,
    DateField,
    UploadField,
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
  display: grid;
  justify-content: center;
  grid-template-rows: max-content auto;
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
