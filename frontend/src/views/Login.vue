<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Login</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="floating">Username</ion-label>
        <ion-input v-model="username"></ion-input>
      </ion-item>
      <ion-item>
        <ion-label position="floating">Password</ion-label>
        <ion-input v-model="password" type="password"></ion-input>
      </ion-item>
      <ion-button expand="full" @click="handleLogin">Login</ion-button>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonPage,
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
} from "@ionic/vue";

import AuthUtils from "@/utils/authUtils";

export default defineComponent({
  name: "Login",
  components: {
    IonPage,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
  },
  data() {
    return {
      username: "",
      password: "",
    };
  },
  methods: {
    async handleLogin() {
      try {
        const data = {
          username: this.username,
          password: this.password,
        } as LoginData;
        const response = await AuthUtils.login(data);
        console.log("Logged in successfully:", response);
        this.$router.push("/tabs");
      } catch (error) {
        alert(error); // Show error message
      }
    },
  },
});
</script>
