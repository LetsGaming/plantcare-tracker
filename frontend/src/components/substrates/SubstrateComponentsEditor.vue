<template>
  <IonCard>
    <IonCardHeader>
      <IonCardTitle>Komponenten bearbeiten</IonCardTitle>
    </IonCardHeader>
    <IonCardContent>
      <template v-if="existingSubstrate">
        <ul v-if="existingSubstrate.components.length > 0">
          <li
            v-for="(component, index) in existingSubstrate.components"
            :key="component.id"
          >
            <IonLabel
              >{{ component.name }} (Teile: {{ component.parts }})</IonLabel
            >
            <IonButton color="danger" @click="handleRemoveComponent(component.id)">
              Entfernen
            </IonButton>
          </li>
        </ul>
        <IonItem v-else>
          <IonLabel>Keine Komponenten hinzugefügt.</IonLabel>
        </IonItem>
      </template>
    </IonCardContent>
  </IonCard>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonLabel,
  IonButton,
  IonItem,
} from "@ionic/vue";

export default defineComponent({
  emits: ["removeComponent"],
  components: {
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonLabel,
    IonButton,
    IonItem,
  },
  props: {
    existingSubstrate: {
      type: Object as () => Substrate,
      required: true,
    },
  },
  methods: {
    handleRemoveComponent(index: number) {
      this.$emit("removeComponent", index); // Emit event to parent
    },
  },
});
</script>
