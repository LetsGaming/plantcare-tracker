<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Debug</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="controls">
        <ion-button expand="block" @click="showToastSuccess"
          >Toast: Success</ion-button
        >
        <ion-button expand="block" color="danger" @click="showToastError"
          >Toast: Error</ion-button
        >

        <ion-button expand="block" @click="loginSample"
          >Auth: Login (sample)</ion-button
        >
        <ion-button expand="block" color="medium" @click="logout"
          >Auth: Logout</ion-button
        >

        <ion-button expand="block" @click="getPlants"
          >API: Get Plants</ion-button
        >
        <ion-button expand="block" color="tertiary" @click="createPlant"
          >API: Create Plant</ion-button
        >
        <ion-button expand="block" color="warning" @click="triggerApiError"
          >API: Trigger Error</ion-button
        >

        <div class="file-row">
          <input ref="fileInput" type="file" @change="onFileChange" />
          <ion-button :disabled="!selectedFile" @click="uploadImage"
            >Upload Image</ion-button
          >
        </div>

        <ion-button expand="block" @click="copyClipboard"
          >Clipboard: Copy sample text</ion-button
        >
        <ion-button expand="block" color="light" @click="simulateOfflineSave"
          >Simulate Offline Save</ion-button
        >

        <ion-button expand="block" color="danger" @click="clearLogs"
          >Clear Logs</ion-button
        >
      </div>

      <ion-list>
        <ion-list-header>
          <ion-label>Debug Logs</ion-label>
        </ion-list-header>
        <ion-item v-for="(l, idx) in logs" :key="idx">
          <ion-label>
            <h3>{{ l.title }}</h3>
            <p class="mono">{{ l.payload }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
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
  IonButton,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
} from "@ionic/vue";

import ToastService from "@/services/general/ToastService";
import UserService from "@/services/UserService";
import PlantService from "@/services/PlantService";
import ImageService from "@/services/ImageService";
import ApiUtils from "@/utils/apiUtils";

export default defineComponent({
  name: "DebugView",
  components: {
    IonPage,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
  },
  data() {
    return {
      logs: [] as Array<{ title: string; payload: string }>,
      selectedFile: null as File | null,
    };
  },
  methods: {
    pushLog(title: string, payload: any) {
      const p =
        typeof payload === "string"
          ? payload
          : JSON.stringify(payload, null, 2);
      this.logs.unshift({ title, payload: p });
    },

    async showToastSuccess() {
      try {
        ToastService.showSuccess("Test success", 2000);
        this.pushLog("Toast", "success shown");
      } catch (err) {
        this.pushLog("Toast Error", err);
      }
    },

    async showToastError() {
      try {
        ToastService.showError("Test error: This is the longest error message for testing purposes. \n Lorem ipsum dolor sit amet, consectetur adipiscing elit. \n Lorem ipsum dolor sit amet, consectetur adipiscing elit. Lorem ipsum dolor sit amet, consectetur adipiscing elit. ", 99999999);
        this.pushLog("Toast", "error shown");
      } catch (err) {
        this.pushLog("Toast Error", err);
      }
    },

    async loginSample() {
      try {
        const creds = { username: "demo@demo.com", password: "password" };
        const res = await UserService.login(creds);
        this.pushLog("Auth: Login", res);
        ToastService.showSuccess("Logged in (debug)");
      } catch (err) {
        this.pushLog("Auth Login Error", err);
        ToastService.showError("Login failed (debug)");
      }
    },

    async logout() {
      try {
        await UserService.logout();
        this.pushLog("Auth: Logout", "ok");
        ToastService.addToast({ message: "Logged out", color: "medium" });
      } catch (err) {
        this.pushLog("Auth Logout Error", err);
      }
    },

    async getPlants() {
      try {
        const res = await PlantService.getAllPlants();
        this.pushLog("Get Plants", res);
      } catch (err) {
        this.pushLog("Get Plants Error", err);
      }
    },

    async createPlant() {
      try {
        const sample = {
          name: "Debug Plant",
          scientificName: "Debugus plantus",
          notes: "Created from Debug page",
        };
        // const res = await PlantService.addPlant(sample);
        this.pushLog("Create Plant", sample);
      } catch (err) {
        this.pushLog("Create Plant Error", err);
      }
    },

    async triggerApiError() {
      try {
        const res = await ApiUtils.get("/api/debug/trigger-error");
        this.pushLog("Trigger API Error", res);
      } catch (err) {
        this.pushLog("API Error (expected)", err);
        ToastService.showError("API error triggered");
      }
    },

    onFileChange(e: Event) {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        this.selectedFile = target.files[0];
        this.pushLog("File Selected", {
          name: this.selectedFile.name,
          size: this.selectedFile.size,
        });
      }
    },

    async uploadImage() {
      if (!this.selectedFile) return this.pushLog("Upload", "no file selected");
      try {
        const form = new FormData();
        form.append("file", this.selectedFile);

        this.pushLog("Upload Image", {
          name: this.selectedFile.name,
          size: this.selectedFile.size,
        });
        ToastService.showSuccess("Image uploaded (debug)");

        const fileInput = this.$refs.fileInput as HTMLInputElement;
        if (fileInput) {
          fileInput.value = "";
        }
        this.selectedFile = null;
      } catch (err) {
        this.pushLog("Upload Error", err);
        ToastService.showError("Upload failed");
      }
    },

    async copyClipboard() {
      try {
        await navigator.clipboard.writeText("PlantCare Debug sample text");
        this.pushLog("Clipboard", "copied");
        ToastService.addToast({
          message: "Copied to clipboard",
          color: "primary",
        });
      } catch (err) {
        this.pushLog("Clipboard Error", err);
      }
    },

    simulateOfflineSave() {
      try {
        const key = "debug-offline";
        const payload = {
          ts: new Date().toISOString(),
          note: "offline sample",
        };
        localStorage.setItem(key, JSON.stringify(payload));
        this.pushLog("Offline Save", payload);
        ToastService.addToast({
          message: "Saved to localStorage",
          color: "tertiary",
        });
      } catch (err) {
        this.pushLog("Offline Save Error", err);
      }
    },

    clearLogs() {
      this.logs = [];
      ToastService.addToast({ message: "Logs cleared", color: "medium" });
    },
  },
});
</script>

<style scoped>
.controls {
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
}
.file-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.mono {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", monospace;
  white-space: pre-wrap;
  font-size: 12px;
}
</style>
