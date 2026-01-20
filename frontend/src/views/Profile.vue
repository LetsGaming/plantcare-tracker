<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="goBack">
            <ion-icon :icon="close"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ t("profile.title") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card class="align-middle align-horizontal" style="display: block">
        <ion-list>
          <ion-item lines="none">
            <ion-grid>
              <ion-row>
                <ion-col>
                  <ion-label class="profile-label">{{
                    t("profile.username.label")
                  }}</ion-label>
                </ion-col>
                <ion-col>
                  <ion-label>{{ username }}</ion-label>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-item>
          <ion-item lines="none">
            <ion-grid>
              <ion-row>
                <ion-col>
                  <ion-label class="profile-label">{{
                    t("profile.role.label")
                  }}</ion-label>
                </ion-col>
                <ion-col>
                  <ion-label>{{ role }}</ion-label>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-item>
        </ion-list>

        <ion-button
          v-if="showEditButton"
          expand="full"
          @click="openEditingModal"
          >{{ t("profile.edit") }}</ion-button
        >
      </ion-card>

      <profile-editing-modal
        :is-open="showEditingModal"
        :profileData="editProfileData"
        :formFields="profileFormFields"
        :is-loading="isLoading"
        :show-delete="true"
        @save="editProfile"
        @delete="deleteProfile"
        @close="showEditingModal = false"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonButtons,
  IonButton,
  IonIcon,
  IonLabel,
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
} from "@ionic/vue";
import { close } from "ionicons/icons";
import ProfileEditingModal from "@/components/profile/ProfileEditingModal.vue";
import UserService from "@/services/UserService";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import Utils from "@/utils/utils";

export default defineComponent({
  name: "ProfilePage",
  components: {
    IonPage,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonButtons,
    IonButton,
    IonIcon,
    IonLabel,
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    ProfileEditingModal,
  },
  setup() {
    return { close };
  },
  data() {
    return {
      showEditButton: false,
      showEditingModal: false,
      isLoading: false,
      username: "",
      role: "",
      editProfileData: {
        username: "",
        password: "",
        passwordConfirmation: "",
      } as EditProfile,
    };
  },
  computed: {
    profileFormFields(): FormField[] {
      return [
        {
          type: "input",
          modelKey: "username",
          label: "profile.field.username.placeholder",
          required: false,
        },
        {
          type: "password",
          modelKey: "password",
          label: "profile.field.password.placeholder",
          required: false,
        },
        {
          type: "password",
          modelKey: "passwordConfirmation",
          label: "profile.field.confirm_password.placeholder",
          required: false,
        },
      ];
    },
  },
  async mounted() {
    this.showEditButton = !(await UserService.isGuest());
    this.username = await UserService.getUsername();
    this.role = Utils.capitalizeFirstLetter((await UserService.getUserRole()) || "") as string;
    this.editProfileData.username = this.username;
  },
  methods: {
    goBack() {
      this.$router.back();
    },
    openEditingModal() {
      this.showEditingModal = true;
    },
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    async editProfile(profile: EditProfile) {
      if (!profile.username && !profile.password) {
        ToastService.showError({
          key: "profile.error_min_fields",
          fallback: "Please fill at least one field",
        });
        return;
      }
      if (
        profile.password &&
        profile.password !== profile.passwordConfirmation
      ) {
        ToastService.showError({
          key: "profile.error_password_mismatch",
          fallback: "Passwords do not match",
        });
        return;
      }

      this.isLoading = true;
      const response = await UserService.editProfile(profile);
      this.isLoading = false;
      if (response) {
        this.username = profile.username || this.username;
        this.showEditingModal = false;
      }
    },
    async deleteProfile() {
      this.isLoading = true;
      const response = await UserService.deleteProfile();
      this.isLoading = false;
      if (response) this.showEditingModal = false;
    },
  },
});
</script>

<style scoped>
.profile-label {
  font-weight: bold;
  color: var(--ion-color-primary);
}
</style>
