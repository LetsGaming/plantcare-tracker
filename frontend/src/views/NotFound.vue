<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t("pageNotFound.title") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-card class="align-middle not-found-card">
        <ion-card-header>
          <ion-card-title>{{ t("pageNotFound.title") }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>{{ t("pageNotFound.message") }}</p>
          <ion-button expand="block" @click="navigateHome">
            {{ t("pageNotFound.goHome") }}
          </ion-button>
        </ion-card-content>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";

import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
} from "@ionic/vue";

import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "NotFound",
  components: {
    IonPage,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
  },
  methods: {
    t(value: string) {
      return localizationService.t(value, undefined, value);
    },
    navigateHome() {
      // Replace the current NotFound page with the home page
      this.$router
        .replace({ name: "tabs" })
        .then(() => window.location.reload());
    },
  },
});
</script>

<style scoped>
.not-found-card {
  margin-top: 35vh;
  display: block;
}
</style>
