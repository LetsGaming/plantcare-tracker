<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader headerTitle="Profil bearbeiten" @close="$emit('close')" />
    <IonContent>
      <form-component
        :item="editProfileData"
        :formFields="[
          { type: 'input', modelKey: 'username', label: 'Name', required: false },
          {
            type: 'password',
            modelKey: 'password',
            label: 'Passwort',
            required: false,
          },
          {
            type: 'password',
            modelKey: 'passwordConfirmation',
            label: 'Passwort bestätigen',
            required: false,
          },
        ]"
        cardTitle="Profil Informationen"
        submitLabel="Profil editieren"
        @delete-click="deleteProfile"
        @submitClick="editProfile"
      />
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonModal, IonContent } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import FormComponent from "@/components/formcomponent/FormComponent.vue";

import UserService from "@/services/UserService";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  name: "ProfileEditingModal",
  emits: ["close"],
  components: {
    IonModal,
    IonContent,
    ModalHeader,
    FormComponent,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
  },
  data() {
    return {
      editProfileData: {
        username: "",
        password: "",
        passwordConfirmation: "",
      } as EditProfile,
    };
  },
  methods: {
    async editProfile() {
      if (
        !this.editProfileData.username &&
        !this.editProfileData.password
      ) {
        ToastService.showError("Bitte füllen Sie mindestens ein Feld aus");
        return;
      }

      if (
        this.editProfileData.password !==
        this.editProfileData.passwordConfirmation
      ) {
        ToastService.showError("Passwörter stimmen nicht überein");
        return;
      }

      await UserService.editProfile(this.editProfileData);
      this.$emit("close");
    },
    async deleteProfile() {
      await UserService.deleteProfile();
      this.$emit("close");
    },
  },
});
</script>
