<template>
  <ion-page>
    <ion-content>
      <div v-if="isCheckingLogin" class="login-loading" role="status">
        <ion-spinner />
        <span class="sr-only">{{ t("login2.checking", "Checking your session") }}</span>
      </div>

      <main v-else class="login-shell">
        <header class="brand">
          <PlantPlaceholder kind="plant" seed="welcome" class="brand-art" />
          <h1 class="brand-name">{{ t("login2.app_name", "PlantCare") }}</h1>
          <p class="brand-welcome">{{ t("login2.welcome") }}</p>
        </header>

        <form class="login-form" novalidate @submit.prevent="submit">
          <h2 class="form-heading">
            {{ isRegisterMode ? t("login2.heading_register") : t("login2.heading_login") }}
          </h2>

          <p v-if="notice" class="form-notice" role="status">{{ notice }}</p>

          <InputField
            v-model="username"
            :field="usernameField"
            :error="errors.username"
            @blur="validateUsername"
          />
          <PasswordField
            v-model="password"
            :field="passwordField"
            :error="errors.password"
            @blur="validatePassword"
          />
          <PasswordField
            v-if="isRegisterMode"
            v-model="confirmPassword"
            :field="confirmField"
            :error="errors.confirmPassword"
            @blur="validateConfirm"
          />

          <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

          <ion-button expand="block" type="submit" :disabled="loading" class="submit">
            <ion-spinner v-if="loading" name="crescent" />
            <span v-else>{{ isRegisterMode ? t("auth.register") : t("auth.login") }}</span>
          </ion-button>

          <ion-button
            expand="block"
            fill="clear"
            type="button"
            :disabled="loading"
            @click="toggleMode"
          >
            {{ isRegisterMode ? t("auth.already_have_account") : t("auth.no_account_register") }}
          </ion-button>

          <ion-button
            expand="block"
            fill="clear"
            color="medium"
            type="button"
            :disabled="loading"
            @click="guestLogin"
          >
            {{ t("auth.continue_as_guest") }}
          </ion-button>
        </form>
      </main>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonContent, IonButton, IonSpinner } from "@ionic/vue";

import { mapActions } from "pinia";
import { useSessionStore } from "@/stores/session";
import InputFieldComponent from "@/components/formcomponent/fields/InputField.vue";
import PasswordFieldComponent from "@/components/formcomponent/fields/PasswordField.vue";
import PlantPlaceholder from "@/components/ui/PlantPlaceholder.vue";
import localizationService from "@/services/general/LocalizationService";
import { describeUserFixableError, fieldErrorsFrom } from "@/utils/apiErrorMessage";
import {
  classifyFailure,
  describeRequestFailure,
  withoutErrorToasts,
} from "@/utils/requestFeedback";
import { safeRedirectPath } from "@/utils/formState";

const emptyErrors = () => ({ username: "", password: "", confirmPassword: "" });

export default defineComponent({
  name: "Login",

  components: {
    IonPage,
    IonContent,
    IonButton,
    IonSpinner,
    InputField: InputFieldComponent,
    PasswordField: PasswordFieldComponent,
    PlantPlaceholder,
  },

  data() {
    return {
      username: "",
      password: "",
      confirmPassword: "",
      loading: false,
      isCheckingLogin: true,
      isRegisterMode: false,
      errors: emptyErrors(),
      formError: "",
      notice: "",
    };
  },

  computed: {
    usernameField(): InputField {
      return {
        type: "input",
        modelKey: "username",
        label: "auth.username.label",
        required: true,
        autocomplete: "username",
        autocapitalize: "off",
        autocorrect: "off",
        enterkeyhint: "next",
      };
    },
    passwordField(): PasswordField {
      return {
        type: "password",
        modelKey: "password",
        label: "auth.password.label",
        required: true,
        autocomplete: this.isRegisterMode ? "new-password" : "current-password",
        enterkeyhint: this.isRegisterMode ? "next" : "go",
      };
    },
    confirmField(): PasswordField {
      return {
        type: "password",
        modelKey: "confirmPassword",
        label: "auth.confirm_password.label",
        required: true,
        autocomplete: "new-password",
        enterkeyhint: "go",
      };
    },
  },

  async mounted() {
    try {
      if (await this.ensureAuthenticated()) this.redirectUser();
    } catch {
      // A failed session check just means the form is shown.
    } finally {
      this.isCheckingLogin = false;
    }
  },

  methods: {
    ...mapActions(useSessionStore, {
      ensureAuthenticated: "ensureAuthenticated",
      signIn: "login",
      signInAsGuest: "guestLogin",
      signUp: "register",
    }),
    t(key: string, fallback?: string) {
      return localizationService.t(key, undefined, fallback ?? key);
    },

    toggleMode() {
      this.isRegisterMode = !this.isRegisterMode;
      this.errors = emptyErrors();
      this.formError = "";
      this.notice = "";
      this.confirmPassword = "";
    },

    validateUsername(): boolean {
      this.errors.username = this.username.trim() ? "" : this.t("login2.username_required");
      return !this.errors.username;
    },
    validatePassword(): boolean {
      this.errors.password = this.password ? "" : this.t("login2.password_required");
      return !this.errors.password;
    },
    validateConfirm(): boolean {
      if (!this.isRegisterMode) return true;
      if (!this.confirmPassword) {
        this.errors.confirmPassword = this.t("login2.confirm_required");
      } else if (this.confirmPassword !== this.password) {
        this.errors.confirmPassword = this.t("login2.passwords_mismatch");
      } else {
        this.errors.confirmPassword = "";
      }
      return !this.errors.confirmPassword;
    },
    validateAll(): boolean {
      const results = [this.validateUsername(), this.validatePassword(), this.validateConfirm()];
      return results.every(Boolean);
    },

    async submit() {
      if (this.loading) return;
      this.formError = "";
      this.notice = "";
      if (!this.validateAll()) return;
      if (this.isRegisterMode) await this.handleRegister();
      else await this.handleLogin();
    },

    reportFailure(error: unknown, actionKey: string) {
      this.formError = describeRequestFailure(error, "auth.title", actionKey);
    },

    async handleLogin() {
      this.loading = true;
      try {
        await withoutErrorToasts(() =>
          this.signIn({ username: this.username.trim(), password: this.password }),
        );
        this.redirectUser();
      } catch (error) {
        const kind = classifyFailure(error);
        if (kind === "unauthorized" || kind === "fixable") {
          this.formError = this.t("login2.invalid_credentials");
        } else {
          this.reportFailure(error, "auth.login_failed");
        }
      } finally {
        this.loading = false;
      }
    },

    async guestLogin() {
      if (this.loading) return;
      this.formError = "";
      this.loading = true;
      try {
        await withoutErrorToasts(() => this.signInAsGuest());
        this.redirectUser();
      } catch (error) {
        this.reportFailure(error, "auth.failed_guest");
      } finally {
        this.loading = false;
      }
    },

    async handleRegister() {
      this.loading = true;
      try {
        await withoutErrorToasts(() =>
          this.signUp({ username: this.username.trim(), password: this.password }),
        );
        this.password = "";
        this.confirmPassword = "";
        this.errors = emptyErrors();
        this.isRegisterMode = false;
        this.notice = this.t("login2.registered");
      } catch (error) {
        const fields = fieldErrorsFrom(error);
        const fixable = describeUserFixableError(error);
        if (fields.username || fields.password) {
          this.errors.username = fields.username ?? "";
          this.errors.password = fields.password ?? "";
        } else if (fixable) {
          this.errors.username = fixable;
        } else {
          this.reportFailure(error, "auth.registration_failed");
        }
      } finally {
        this.loading = false;
      }
    },

    redirectUser() {
      const target = safeRedirectPath(this.$route.query.redirect);
      this.$router.replace(target ?? { name: "plant-overview" });
    },
  },
});
</script>

<style scoped>
.login-loading {
  min-height: 100%;
  display: grid;
  place-items: center;
}

.login-shell {
  min-height: 100%;
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-5);
}

.brand {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  text-align: center;
}

.brand-art {
  width: 112px;
  height: 112px;
  min-height: 0;
  border-radius: var(--radius-lg);
}

.brand-name {
  font-size: var(--text-2xl);
  color: var(--ion-color-primary);
}

.brand-welcome {
  margin: 0;
  color: var(--ink-soft);
}

.login-form {
  display: grid;
  gap: var(--space-2);
}

.form-heading {
  font-size: var(--text-lg);
  margin-bottom: var(--space-1);
}

.form-notice {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--leaf-wash);
  color: var(--ion-text-color);
  font-size: var(--text-sm);
}

.form-error {
  margin: 0;
  color: var(--ion-color-danger);
  font-weight: 600;
  font-size: var(--text-sm);
}

.submit {
  margin-top: var(--space-2);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
