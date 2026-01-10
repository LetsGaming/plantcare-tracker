<template>
  <ion-modal :is-open="isOpen" @ionModalDidDismiss="closeModal">
    <editing-header
      :headerTitle="label"
      :showEditButton="showEditButton"
      :onEditClick="onEditClick"
      @close="closeModal"
    />
    <ion-content>
      <ion-list>
        <ion-item lines="none">
          <ion-grid>
            <ion-row>
              <ion-col>
                <ion-label class="profile-label">{{ t('profile.username.label') }}</ion-label>
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
                <ion-label class="profile-label">{{ t('profile.role.label') }}</ion-label>
              </ion-col>
              <ion-col>
                <ion-label>{{ role }}</ion-label>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import { defineComponent } from "vue";

import {
  IonModal,
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
  IonToggle,
  IonGrid,
  IonRow,
  IonCol,
} from "@ionic/vue";
import { close } from "ionicons/icons";

import EditingHeader from "@/components/modal/EditingHeader.vue";
import localizationService from '@/services/general/LocalizationService'

import UserService from "@/services/UserService";

export default defineComponent({
  name: "ProfileModal",
  emits: ["close"],
  components: {
    IonModal,
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
    IonToggle,
    IonGrid,
    IonRow,
    IonCol,
    EditingHeader,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
  },
  setup() {
    return {
      close,
    };
  },
  data() {
    return {
      label: 'profile.title',
      showEditButton: false,
      username: "",
      role: "",
    };
  },
  async mounted() {
    this.showEditButton = !(await UserService.isGuest());
    await UserService.getUsername().then((username) => {
      this.username = username;
    });
    await UserService.getUserRole().then((role) => {
      this.role = role;
    });
  },
  methods: {
    async closeModal() {
      this.$emit("close");
    },
    onEditClick() {
      console.log("Edit clicked");
    },
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback)
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
