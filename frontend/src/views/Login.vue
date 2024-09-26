<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title class="ion-text-center">Login</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div class="login-container align-middle">
        <ion-item class="ion-margin-bottom" style="width: 100%">
          <ion-icon :icon="personOutline" slot="start"></ion-icon>
          <ion-input
            v-model="username"
            aria-label="Username"
            label="Username"
            label-placement="floating"
            placeholder="Enter your username"
            type="text"
            required
            clear-input
          ></ion-input>
        </ion-item>

        <ion-item class="ion-margin-bottom" style="width: 100%">
          <ion-icon :icon="lockClosedOutline" slot="start"></ion-icon>
          <ion-input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            label="Password"
            label-placement="floating"
            aria-label="Password"
            placeholder="Enter your password"
            clear-input
            required
          ></ion-input>
          <ion-button
            fill="clear"
            size="small"
            slot="end"
            @click="togglePasswordVisibility"
          >
            <ion-icon
              :icon="showPassword ? eyeOffOutline : eyeOutline"
            ></ion-icon>
          </ion-button>
        </ion-item>

        <ion-button
          expand="block"
          @click="handleLogin"
          :disabled="loading"
          id="login-button"
          class="ion-margin-top"
          style="width: 100%"
        >
          <ion-spinner v-if="loading"></ion-spinner>
          <span v-else>Login</span>
        </ion-button>
      </div>
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
  IonIcon,
  IonSpinner,
  IonText,
} from "@ionic/vue";

import {
  personOutline,
  lockClosedOutline,
  eyeOffOutline,
  eyeOutline,
} from "ionicons/icons";

import AuthUtils from "@/utils/authUtils";
import ToastService from "@/services/general/ToastService";

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
    IonIcon,
    IonSpinner,
    IonText,
  },
  data() {
    return {
      username: "",
      password: "",
      showPassword: false, // For toggling password visibility
      loading: false, // For showing loading spinner
    };
  },
  setup() {
    return { personOutline, lockClosedOutline, eyeOffOutline, eyeOutline };
  },
  async mounted() {
    // Check if user is already logged in
    if (await AuthUtils.isAuthenticated()) {
      this.redirectUser();
    } else {
      try {
        // If not authToken set, try to refresh
        await AuthUtils.refreshToken();
        this.redirectUser();
      } catch {
        return;
      }
    }
  },
  methods: {
    togglePasswordVisibility() {
      this.showPassword = !this.showPassword;
    },
    async handleLogin() {
      // Check if username or password is empty
      if (!this.username || !this.password) {
        ToastService.showError(
          "Please enter username and password.",
          undefined,
          "top",
          "login-button"
        );
        return;
      }

      this.loading = true;
      try {
        const data = {
          username: this.username,
          password: this.password,
        };

        // Call the AuthUtils login method
        await AuthUtils.login(data);
        this.redirectUser();
      } catch (error) {
        // Show error message if login fails
        ToastService.showError(
          "Invalid username or password",
          undefined,
          "top",
          "login-button"
        );
      } finally {
        // Stop the loading spinner
        this.loading = false;
      }
    },
    redirectUser() {
      this.$router.push({ name: "plant-overview" });
    },
  },
});
</script>

<style scoped>
.login-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 16px;
}

ion-item {
  --padding-start: 16px;
  --inner-padding-end: 8px;
}

ion-icon {
  color: #555;
}

ion-text {
  margin-top: 12px;
}
</style>
