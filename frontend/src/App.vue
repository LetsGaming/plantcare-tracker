<template>
  <ion-app>
    <side-menu />
    <ion-router-outlet id="main"/>
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import SideMenu from './components/SideMenu.vue';
</script>