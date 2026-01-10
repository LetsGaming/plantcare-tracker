<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet name="tabs"></ion-router-outlet>
      <ion-tab-bar slot="bottom" id="nav-tab-bar">
        <ion-tab-button tab="tab1" href="/tabs/plants">
          <ion-icon aria-hidden="true" :icon="leaf" />
          <ion-label>{{ t('tabs.plants') }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="tab2" href="/tabs/substrates">
          <ion-icon aria-hidden="true" :icon="cube" />
          <ion-label>{{ t('tabs.substrates') }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="tab3" href="/tabs/components">
          <ion-icon aria-hidden="true" :icon="grid" />
          <ion-label>{{ t('tabs.components') }}</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button router-link="/sales">
        <ion-icon :icon="pricetag" />
      </ion-fab-button>
    </ion-fab>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonTabBar,
  IonTabButton,
  IonTabs,
  IonLabel,
  IonIcon,
  IonPage,
  IonRouterOutlet,
  IonFab,
  IonFabButton,
} from "@ionic/vue";
import { cube, grid, leaf, pricetag } from "ionicons/icons";
import localizationService from '@/services/general/LocalizationService'

const t = (k: string, v?: Record<string, string | number>, f?: string) =>
  localizationService.t(k, v, f)

</script>

<style scoped>
 @media (max-width: 768px) {
  ion-fab {
    margin-bottom: 70px;
  }
}
</style>