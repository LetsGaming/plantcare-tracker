<template>
  <ion-app>
    <side-menu />
    <ion-router-outlet id="main" />
  </ion-app>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonApp, IonRouterOutlet } from "@ionic/vue";
import SideMenu from "./components/SideMenu.vue";

export default defineComponent({
  name: "App",
  components: { IonApp, IonRouterOutlet, SideMenu },
});
</script>
