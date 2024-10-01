<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title class="ion-text-center">{{ isRegisterMode ? 'Register' : 'Login' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div v-if="isCheckingLogin" class="login-loading-container align-middle">
        <ion-spinner></ion-spinner>
      </div>
      <div v-else class="login-container align-middle">
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

        <!-- Confirm password field for registration -->
        <ion-item
          v-if="isRegisterMode"
          class="ion-margin-bottom"
          style="width: 100%"
        >
          <ion-icon :icon="lockClosedOutline" slot="start"></ion-icon>
          <ion-input
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            label="Confirm Password"
            label-placement="floating"
            aria-label="Confirm Password"
            placeholder="Confirm your password"
            clear-input
            required
          ></ion-input>
        </ion-item>

        <ion-button
          expand="block"
          @click="isRegisterMode ? handleRegister() : handleLogin()"
          :disabled="loading"
          id="auth-button"
          class="ion-margin-top"
          style="width: 100%"
        >
          <ion-spinner v-if="loading"></ion-spinner>
          <span v-else>{{ isRegisterMode ? 'Register' : 'Login' }}</span>
        </ion-button>

        <!-- Toggle between login and register mode -->
        <ion-text @click="toggleAuthMode" class="ion-margin-top" color="primary">
          <p>{{ isRegisterMode ? 'Already have an account? Login' : "Don't have an account? Register" }}</p>
        </ion-text>
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
      confirmPassword: "", // New field for registration
      showPassword: false,
      loading: false,
      isCheckingLogin: true,
      isRegisterMode: false, // Toggle for login and register mode
    };
  },
  setup() {
    return { personOutline, lockClosedOutline, eyeOffOutline, eyeOutline };
  },
  async mounted() {
    try {
      if (await AuthUtils.isAuthenticated()) {
        this.redirectUser();
      } else {
        try {
          await AuthUtils.refreshToken(1);
          this.redirectUser();
        } catch {
          return;
        }
      }
    } catch (error) {
      this.isCheckingLogin = false;
    } finally {
      this.isCheckingLogin = false;
    }
  },
  methods: {
    togglePasswordVisibility() {
      this.showPassword = !this.showPassword;
    },
    toggleAuthMode() {
      this.isRegisterMode = !this.isRegisterMode;
    },
    async handleLogin() {
      if (!this.username || !this.password) {
        ToastService.showError(
          "Please enter username and password.",
          undefined,
          "top",
          "auth-button"
        );
        return;
      }

      this.loading = true;
      try {
        const data = { username: this.username, password: this.password };
        await AuthUtils.login(data);
        this.redirectUser();
      } catch (error) {
        ToastService.showError(
          "Invalid username or password",
          undefined,
          "top",
          "auth-button"
        );
      } finally {
        this.loading = false;
      }
    },
    async handleRegister() {
      if (!this.username || !this.password || !this.confirmPassword) {
        ToastService.showError(
          "Please fill in all the fields.",
          undefined,
          "top",
          "auth-button"
        );
        return;
      }

      if (this.password !== this.confirmPassword) {
        ToastService.showError(
          "Passwords do not match.",
          undefined,
          "top",
          "auth-button"
        );
        return;
      }

      this.loading = true;
      try {
        const data = { username: this.username, password: this.password };
        await AuthUtils.register(data);
        ToastService.showSuccess("Registration successful. Please login.");
        this.isRegisterMode = false; // Switch back to login mode
      } catch (error) {
        ToastService.showError(
          "Registration failed.",
          undefined,
          "top",
          "auth-button"
        );
      } finally {
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
.login-loading-container {
  height: 90%;
  display: flex;
  align-items: center;
}

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
  cursor: pointer;
  text-align: center;
}
</style>
