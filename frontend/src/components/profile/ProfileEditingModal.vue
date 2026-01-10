<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader headerTitle="profile.edit.title" @close="$emit('close')" />
    <IonContent>
      <form-component
        :item="editProfileData"
        :formFields="[
          {
            type: 'input',
            modelKey: 'username',
            label: 'profile.field.username.placeholder',
            required: false,
          },
          {
            type: 'password',
            modelKey: 'password',
            label: 'profile.field.password.placeholder',
            required: false,
          },
          {
            type: 'password',
            modelKey: 'passwordConfirmation',
            label: 'profile.field.confirm_password.placeholder',
            required: false,
          },
        ]"
        cardTitle="profile.info.title"
        submitLabel="profile.edit.submit"
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
      isLoading: false,
    };
  },
  methods: {
    async editProfile() {
      if (!this.editProfileData.username && !this.editProfileData.password) {
        ToastService.showError({ key: 'profile.error_min_fields', fallback: 'Please fill at least one field' });
        return;
      }

      if (
        this.editProfileData.password !==
        this.editProfileData.passwordConfirmation
      ) {
        ToastService.showError({ key: 'profile.error_password_mismatch', fallback: 'Passwords do not match' });
        return;
      }
      this.isLoading = true;
      const response = await UserService.editProfile(this.editProfileData);
      if (response) {
        this.isLoading = false;
        this.$emit("close");
      }
    },
    async deleteProfile() {
      this.isLoading = true;
      const response = await UserService.deleteProfile();
      if (response) {
        this.isLoading = false;
        this.$emit("close");
      }
    },
  },
});
</script>
