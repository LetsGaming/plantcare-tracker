<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="goBack">
            <ion-icon :icon="close"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ label }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card class="align-middle" style="display: block;">
        <ion-list>
          <ion-item lines="none">
            <ion-grid>
              <ion-row>
                <ion-col>
                  <ion-label class="profile-label">Username:</ion-label>
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
                  <ion-label class="profile-label">Rolle:</ion-label>
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
          >Edit</ion-button
        >
      </ion-card>

      <profile-editing-modal
        :is-open="showEditingModal"
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
      label: "Profil",
      showEditButton: false,
      showEditingModal: false,
      username: "",
      role: "",
    };
  },
  async mounted() {
    this.showEditButton = !(await UserService.isGuest());
    this.username = await UserService.getUsername();
    this.role = await UserService.getUserRole();
  },
  methods: {
    goBack() {
      this.$router.back();
    },
    openEditingModal() {
      this.showEditingModal = true;
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
