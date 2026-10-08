<template>
  <ion-page>
    <AdminHeader :title="t('profile.title')" back-href="/tabs/plants" />

    <ion-content>
      <div class="page-column profile-column">
        <ion-card class="profile-card">
          <ion-card-content>
            <dl class="profile-facts">
              <div class="fact">
                <dt>{{ t("profile.username.label") }}</dt>
                <dd class="break-words">{{ username }}</dd>
              </div>
              <div class="fact">
                <dt>{{ t("profile.role.label") }}</dt>
                <dd>{{ role }}</dd>
              </div>
            </dl>

            <div class="profile-actions">
              <ion-button v-if="showEditButton" expand="block" @click="openEditingModal">
                {{ t("profile.edit") }}
              </ion-button>
              <ion-button v-if="isAdmin" expand="block" fill="outline" @click="openAdmin">
                {{ t("admin.menu.open") }}
              </ion-button>
            </div>
          </ion-card-content>
        </ion-card>
      </div>

      <profile-editing-modal
        :is-open="showEditingModal"
        :profileData="editProfileData"
        :formFields="profileFormFields"
        :is-loading="isLoading"
        :show-delete="true"
        :account-name="username"
        :field-errors="profileErrors"
        @save="editProfile"
        @delete="deleteProfile"
        @close="showEditingModal = false"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonContent, IonButton, IonCard, IonCardContent } from "@ionic/vue";
import ProfileEditingModal from "@/components/profile/ProfileEditingModal.vue";
import AdminHeader from "@/components/admin/AdminHeader.vue";
import { mapActions, mapState } from "pinia";
import { useSessionStore } from "@/stores/session";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import Utils from "@/utils/utils";
import { fieldErrorsFrom } from "@/utils/apiErrorMessage";
import { showRequestFailure, withoutErrorToasts } from "@/utils/requestFeedback";

const blankProfile = (username: string): EditProfile => ({
  username,
  password: "",
  passwordConfirmation: "",
});

export default defineComponent({
  name: "ProfilePage",
  components: {
    IonPage,
    IonContent,
    IonButton,
    IonCard,
    IonCardContent,
    ProfileEditingModal,
    AdminHeader,
  },
  data() {
    return {
      showEditingModal: false,
      isLoading: false,
      username: "",
      editProfileData: blankProfile(""),
      profileErrors: {} as Record<string, string>,
    };
  },
  computed: {
    ...mapState(useSessionStore, {
      isAdmin: "isAdmin",
      isGuest: "isGuest",
      sessionUsername: "username",
      sessionRole: "role",
    }),
    showEditButton(): boolean {
      return !this.isGuest;
    },
    role(): string {
      return Utils.capitalizeFirstLetter(this.sessionRole || "") as string;
    },
    profileFormFields(): FormField[] {
      return [
        {
          type: "input",
          modelKey: "username",
          label: "profile.field.username.placeholder",
          autocomplete: "username",
          autocapitalize: "off",
          enterkeyhint: "next",
        },
        {
          type: "password",
          modelKey: "password",
          label: "profile.field.password.placeholder",
          autocomplete: "new-password",
          enterkeyhint: "next",
        },
        {
          type: "password",
          modelKey: "passwordConfirmation",
          label: "profile.field.confirm_password.placeholder",
          autocomplete: "new-password",
          enterkeyhint: "done",
        },
      ];
    },
  },
  watch: {
    showEditingModal(open: boolean) {
      if (open) {
        this.editProfileData = blankProfile(this.username);
        this.profileErrors = {};
      }
    },
    sessionUsername: {
      immediate: true,
      handler(next: string) {
        this.username = next;
      },
    },
  },
  methods: {
    ...mapActions(useSessionStore, { saveProfile: "editProfile", removeProfile: "deleteProfile" }),
    openEditingModal() {
      this.showEditingModal = true;
    },
    openAdmin() {
      this.$router.push({ name: "admin-dashboard" });
    },
    t(key: string, vars?: Record<string, string>) {
      return localizationService.t(key, vars, key);
    },
    async editProfile(profile: EditProfile) {
      this.profileErrors = {};
      const changesUsername = !!profile.username && profile.username !== this.username;
      const changesPassword = !!profile.password;

      if (!changesUsername && !changesPassword) {
        this.profileErrors = { username: this.t("account.error_min_fields") };
        return;
      }
      if (changesPassword && profile.password !== profile.passwordConfirmation) {
        this.profileErrors = { passwordConfirmation: this.t("account.error_password_mismatch") };
        return;
      }

      this.isLoading = true;
      try {
        await withoutErrorToasts(() => this.saveProfile(profile));
        this.username = profile.username || this.username;
        this.showEditingModal = false;
        ToastService.showSuccess({
          key: "account.saved_signout",
          fallback:
            "Saved. Because your sign-in details changed, you will be signed out again soon.",
        });
      } catch (error) {
        const fields = fieldErrorsFrom(error);
        if (Object.keys(fields).length > 0) this.profileErrors = fields;
        else {
          showRequestFailure(error, "profile.title", "profile.update_failed", {
            retry: () => void this.editProfile(profile),
          });
        }
      } finally {
        this.isLoading = false;
      }
    },
    async deleteProfile() {
      this.isLoading = true;
      try {
        await this.removeProfile();
        this.showEditingModal = false;
      } catch (error) {
        console.error("Profile delete failed:", error);
      } finally {
        this.isLoading = false;
      }
    },
  },
});
</script>

<style scoped>
.profile-column {
  max-width: 560px;
}

.profile-card {
  margin: var(--space-5) 0 0;
}

.profile-facts {
  display: grid;
  gap: var(--space-4);
  margin: 0 0 var(--space-5);
}

.fact {
  display: grid;
  gap: var(--space-1);
}

.fact dt {
  font-size: var(--text-xs);
  color: var(--ink-soft);
}

.fact dd {
  margin: 0;
  color: var(--ion-text-color);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 650;
}

.profile-actions {
  display: grid;
  gap: var(--space-3);
}

.profile-actions ion-button {
  margin: 0;
}
</style>
