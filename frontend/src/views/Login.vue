<template>
  <ion-page>
    <ion-content class="ion-padding" :scroll-y="false">
      <div v-if="isCheckingLogin" class="login-loading-container align-middle">
        <ion-spinner></ion-spinner>
      </div>

      <form
        v-else
        name="loginForm"
        action="#"
        @submit.prevent="isRegisterMode ? handleRegister() : handleLogin()"
        class="login-container align-middle"
      >
        <fieldset style="border: none; padding: 0; margin: 0; width: 100%">
          <ion-item class="ion-margin-bottom">
            <ion-icon :icon="personOutline" slot="start"></ion-icon>
            <ion-input
              v-model="username"
              name="username"
              type="text"
              autocomplete="username"
              inputmode="text"
              label="Username"
              label-placement="floating"
              required
            ></ion-input>
          </ion-item>

          <ion-item class="ion-margin-bottom">
            <ion-icon :icon="lockClosedOutline" slot="start"></ion-icon>
            <ion-input
              v-model="password"
              name="password"
              :type="showPassword ? 'text' : 'password'"
              :autocomplete="
                isRegisterMode ? 'new-password' : 'current-password'
              "
              inputmode="text"
              label="Password"
              label-placement="floating"
              required
            ></ion-input>
            <ion-button
              type="button"
              fill="clear"
              slot="end"
              @click="togglePasswordVisibility"
            >
              <ion-icon
                :icon="showPassword ? eyeOffOutline : eyeOutline"
              ></ion-icon>
            </ion-button>
          </ion-item>

          <ion-item v-if="isRegisterMode" class="ion-margin-bottom">
            <ion-icon :icon="lockClosedOutline" slot="start"></ion-icon>
            <ion-input
              v-model="confirmPassword"
              name="confirmPassword"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              label="Confirm Password"
              label-placement="floating"
              required
            ></ion-input>
          </ion-item>
        </fieldset>

        <ion-button
          type="submit"
          expand="block"
          :disabled="loading"
          class="ion-margin-top"
          style="width: 100%"
        >
          <ion-spinner v-if="loading"></ion-spinner>
          <span v-else>{{ isRegisterMode ? "Register" : "Login" }}</span>
        </ion-button>
      </form>
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
import UserService from "@/services/UserService";
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
      confirmPassword: "",
      showPassword: false,
      loading: false,
      isCheckingLogin: true,
      isRegisterMode: false,
    };
  },
  setup() {
    return { personOutline, lockClosedOutline, eyeOffOutline, eyeOutline };
  },
  async mounted() {
    try {
      if (!(await UserService.isAuthenticated())) return;

      try {
        await UserService.refreshToken(1);
        this.redirectUser();
      } catch {
        return;
      }
    } catch (error) {
      this.isCheckingLogin = false;
    } finally {
      this.isCheckingLogin = false;
    }

    window.addEventListener("keydown", this.handleEnterKey);
  },
  beforeUnmount() {
    // Clean up listener to avoid memory leaks
    window.removeEventListener("keydown", this.handleEnterKey);
  },
  methods: {
    togglePasswordVisibility() {
      this.showPassword = !this.showPassword;
    },
    toggleAuthMode() {
      this.isRegisterMode = !this.isRegisterMode;
    },
    handleEnterKey(event: KeyboardEvent) {
      if (event.key === "Enter") {
        if (this.isRegisterMode) {
          this.handleRegister();
        } else {
          this.handleLogin();
        }
      }
    },
    async guestLogin() {
      this.loading = true;
      try {
        await UserService.guestLogin();
        this.redirectUser();
      } catch (error) {
        ToastService.showError(
          "Failed to login as guest.",
          undefined,
          "top",
          "auth-button"
        );
      } finally {
        this.loading = false;
      }
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
        await UserService.login(data);
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
        await UserService.register(data);
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
      this.$router.replace({ name: "plant-overview" });
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
