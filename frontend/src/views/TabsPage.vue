<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet></ion-router-outlet>
      <ion-tab-bar slot="bottom" id="nav-tab-bar">
        <ion-tab-button tab="tab1" href="/tabs/plants">
          <ion-icon aria-hidden="true" :icon="leaf" />
          <ion-label>Pflanzen</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="tab2" href="/tabs/substrates">
          <ion-icon aria-hidden="true" :icon="cube" />
          <ion-label>Substrate</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="tab3" href="/tabs/components">
          <ion-icon aria-hidden="true" :icon="grid" />
          <ion-label>Komponenten</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import { IonTabBar, IonTabButton, IonTabs, IonLabel, IonIcon, IonPage, IonRouterOutlet } from '@ionic/vue';
import { cube, grid, leaf } from 'ionicons/icons';
</script>
