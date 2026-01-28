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
        <ion-spinner />
      </div>

      <div v-else class="login-container align-middle">
        <!-- Username -->
        <ion-item class="ion-margin-bottom custom-input-item">
          <ion-icon :icon="personOutline" slot="start" />

          <div class="input-wrapper">
            <input
              v-model="username"
              type="text"
              required
              autocomplete="username"
              :aria-label="t('auth.username.label')"
            />
            <label>{{ t("auth.username.label") }}</label>
          </div>
        </ion-item>
        <!-- Password -->
        <ion-item class="ion-margin-bottom custom-input-item">
          <ion-icon :icon="lockClosedOutline" slot="start" />

          <div class="input-wrapper">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              autocomplete="current-password"
              :aria-label="t('auth.password.label')"
            />
            <label>{{ t("auth.password.label") }}</label>
          </div>

          <ion-button
            fill="clear"
            size="small"
            slot="end"
            @click="toggle('showPassword')"
          >
            <ion-icon :icon="showPassword ? eyeOffOutline : eyeOutline" />
          </ion-button>
        </ion-item>

        <!-- Confirm Password -->
        <ion-item
          v-if="isRegisterMode"
          class="ion-margin-bottom custom-input-item"
        >
          <ion-icon :icon="lockClosedOutline" slot="start" />

          <div class="input-wrapper">
            <input
              v-model="confirmPassword"
              :type="showPassword ? 'text' : 'password'"
              required
              autocomplete="new-password"
              :aria-label="t('auth.confirm_password.label')"
            />
            <label>{{ t("auth.confirm_password.label") }}</label>
          </div>

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
import ApiUtils from "@/utils/apiUtils";

export default defineComponent({
  name: "Login",

  components: {
    IonPage,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonItem,
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
      if (flag === "showPassword") this.showPassword = !this.showPassword;
      if (flag === "isRegisterMode") this.isRegisterMode = !this.isRegisterMode;
    },

    handleEnterKey(event: KeyboardEvent) {
      if (event.key === "Enter") {
        this.isRegisterMode ? this.handleRegister() : this.handleLogin();
      }
    },

    async runAuth<T>(
      action: () => Promise<T>,
      error: { key: string; fallback: string },
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
        },
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
        const result = await UserService.register({
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
          "auth-button",
        );

        this.isRegisterMode = false;
      } catch (error) {
        if (ApiUtils.isApiError(error)) {
          const message = error.data?.message;
          const requirements = error.data?.data?.requirements;

          let errorMessage = message;

          if (Array.isArray(requirements)) {
            errorMessage += requirements.map((r) => `• ${r}`).join("\n");
            ToastService.showError(
              errorMessage,
              undefined,
              "top",
              "auth-button",
            );
            return;
          }
        }
        // Fallback for other errors
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
  height: 100%;
  padding: 16px;
}

.custom-input-item {
  --padding-start: 16px;
  --inner-padding-end: 8px;
}

.input-wrapper {
  position: relative;
  flex: 1;
}

.input-wrapper input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  padding: 20px 0 6px;
  font-size: 16px;
  color: var(--ion-text-color, #000);
}

.input-wrapper label {
  position: absolute;
  left: 0;
  top: 18px;
  font-size: 16px;
  color: var(--ion-color-medium);
  pointer-events: none;
  transition: 0.2s ease;
}

.input-wrapper input:focus + label,
.input-wrapper input:not(:placeholder-shown) + label {
  top: 2px;
  font-size: 12px;
  color: var(--ion-color-primary);
}

ion-icon {
  color: #555;
}

ion-text {
  cursor: pointer;
  text-align: center;
}
</style>
