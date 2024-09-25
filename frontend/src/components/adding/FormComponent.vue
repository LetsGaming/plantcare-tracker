<template>
  <div class="form-container">
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>{{ cardTitle }}</IonCardTitle>
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
} from "@ionic/vue";

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
  },
  methods: {
    submitForm() {
      this.onSubmitClick();
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
