<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title class="ion-text-center">
          {{ isRegisterMode ? t("auth.register") : t("auth.login") }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding" :scroll-y="false">
      <div v-if="isCheckingLogin" class="login-loading-container align-middle">
        <ion-spinner></ion-spinner>
      </div>

      <div v-else class="login-container align-middle">
        <!-- Username -->
        <ion-item class="ion-margin-bottom" style="width: 100%">
          <ion-icon :icon="personOutline" slot="start" />
          <ion-input
            v-model="username"
            type="text"
            required
            clear-input
            label-placement="floating"
            :label="t('auth.username.label')"
            :placeholder="t('auth.username.placeholder')"
            :aria-label="t('auth.username.label')"
            autocomplete="username"
          />
        </ion-item>

        <!-- Password -->
        <ion-item class="ion-margin-bottom" style="width: 100%">
          <ion-icon :icon="lockClosedOutline" slot="start" />
          <ion-input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            required
            clear-input
            label-placement="floating"
            :label="t('auth.password.label')"
            :placeholder="t('auth.password.placeholder')"
            :aria-label="t('auth.password.label')"
            autocomplete="current-password"
          />
          <ion-button
            fill="clear"
            size="small"
            slot="end"
            @click="toggle('showPassword')"
          >
            <ion-icon :icon="showPassword ? eyeOffOutline : eyeOutline" />
          </ion-button>
        </ion-item>

        <!-- Confirm Password (Register only) -->
        <ion-item
          v-if="isRegisterMode"
          class="ion-margin-bottom"
          style="width: 100%"
        >
          <ion-icon :icon="lockClosedOutline" slot="start" />
          <ion-input
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            required
            clear-input
            label-placement="floating"
            :label="t('auth.confirm_password.label')"
            :placeholder="t('auth.confirm_password.placeholder')"
            :aria-label="t('auth.confirm_password.label')"
            autocomplete="new-password"
          />
          <ion-button
            fill="clear"
            size="small"
            slot="end"
            @click="toggle('showPassword')"
          >
            <ion-icon :icon="showPassword ? eyeOffOutline : eyeOutline" />
          </ion-button>
        </ion-item>

        <!-- Submit -->
        <ion-button
          expand="block"
          class="ion-margin-top"
          style="width: 100%"
          id="auth-button"
          :disabled="loading"
          @click="isRegisterMode ? handleRegister() : handleLogin()"
        >
          <ion-spinner v-if="loading" />
          <span v-else>
            {{ isRegisterMode ? t("auth.register") : t("auth.login") }}
          </span>
        </ion-button>

        <!-- Toggle login/register -->
        <ion-text
          class="ion-margin-top"
          color="primary"
          @click="toggle('isRegisterMode')"
        >
          <p>
            {{
              isRegisterMode
                ? t("auth.already_have_account")
                : t("auth.no_account_register")
            }}
          </p>
        </ion-text>

        <!-- Guest login -->
        <ion-text class="ion-margin-top" color="primary" @click="guestLogin">
          <p>{{ t("auth.continue_as_guest") }}</p>
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

import UserService from "@/services/UserService";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

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

  setup() {
    return {
      personOutline,
      lockClosedOutline,
      eyeOffOutline,
      eyeOutline,
    };
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

  async mounted() {
    try {
      if (!(await UserService.isAuthenticated())) return;

      await UserService.refreshToken(1);
      this.redirectUser();
    } catch {
      // ignore
    } finally {
      this.isCheckingLogin = false;
    }

    window.addEventListener("keydown", this.handleEnterKey);
  },

  beforeUnmount() {
    window.removeEventListener("keydown", this.handleEnterKey);
  },

  methods: {
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },

    showAuthError(error: { key: string; fallback: string }) {
      return ToastService.showError(error, undefined, "top", "auth-button");
    },

    toggle(flag: "showPassword" | "isRegisterMode") {
      switch (flag) {
        case "showPassword":
          this.showPassword = !this.showPassword;
          break;
        case "isRegisterMode":
          this.isRegisterMode = !this.isRegisterMode;
          break;
      }
    },

    handleEnterKey(event: KeyboardEvent) {
      if (event.key === "Enter") {
        this.isRegisterMode ? this.handleRegister() : this.handleLogin();
      }
    },

    async runAuth<T>(
      action: () => Promise<T>,
      error: { key: string; fallback: string }
    ) {
      this.loading = true;
      try {
        await action();
        this.redirectUser();
      } catch {
        this.showAuthError(error);
      } finally {
        this.loading = false;
      }
    },

    async guestLogin() {
      await this.runAuth(() => UserService.guestLogin(), {
        key: "auth.failed_guest",
        fallback: "Failed to login as guest.",
      });
    },

    async handleLogin() {
      if (!this.username || !this.password) {
        return this.showAuthError({
          key: "auth.missing_fields",
          fallback: "Please fill in all the fields.",
        });
      }

      await this.runAuth(
        () =>
          UserService.login({
            username: this.username,
            password: this.password,
          }),
        {
          key: "auth.invalid_credentials",
          fallback: "Invalid username or password.",
        }
      );
    },

    async handleRegister() {
      if (!this.username || !this.password || !this.confirmPassword) {
        return this.showAuthError({
          key: "auth.missing_fields",
          fallback: "Please fill in all the fields.",
        });
      }

      if (this.password !== this.confirmPassword) {
        return this.showAuthError({
          key: "auth.passwords_do_not_match",
          fallback: "Passwords do not match.",
        });
      }

      this.loading = true;
      try {
        await UserService.register({
          username: this.username,
          password: this.password,
        });

        ToastService.showSuccess(
          {
            key: "auth.register_success",
            fallback: "Registration successful. Please login.",
          },
          undefined,
          "top",
          "auth-button"
        );

        this.isRegisterMode = false;
      } catch {
        this.showAuthError({
          key: "auth.register_failed",
          fallback: "Registration failed. Please try again.",
        });
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
