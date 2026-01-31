<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>System Debug</ion-title>
        <ion-buttons slot="end">
          <ion-button color="danger" @click="clearLogs">
            <ion-icon slot="icon-only" :icon="trashOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="debug-section-title">UI & Feedback</div>
      <ion-grid class="ion-no-padding">
        <ion-row>
          <ion-col size="6">
            <ion-button
              expand="block"
              fill="outline"
              color="success"
              @click="showToastSuccess"
            >
              <ion-icon slot="start" :icon="checkmarkCircleOutline"></ion-icon>
              Success
            </ion-button>
          </ion-col>
          <ion-col size="6">
            <ion-button
              expand="block"
              fill="outline"
              color="danger"
              @click="showToastError"
            >
              <ion-icon slot="start" :icon="alertCircleOutline"></ion-icon>
              Error
            </ion-button>
          </ion-col>
          <ion-col size="6">
            <ion-button
              expand="block"
              fill="outline"
              @click="showToastLineBreak"
            >
              <ion-icon slot="start" :icon="checkmarkCircleOutline"></ion-icon>
              Toast w/ Multi-line
            </ion-button>
          </ion-col>
          <ion-col size="6">
            <ion-button
              expand="block"
              fill="outline"
              color="medium"
              @click="dismissToast"
            >
              <ion-icon slot="start" :icon="trashOutline"></ion-icon>
              Dismiss All Toasts
            </ion-button>
          </ion-col>
        </ion-row>
      </ion-grid>

      <div class="debug-section-title">Authentication</div>
      <ion-card class="ion-no-margin ion-margin-bottom">
        <ion-card-content>
          <ion-row>
            <ion-col size="6">
              <ion-button expand="block" @click="loginSample">
                <ion-icon slot="start" :icon="logInOutline"></ion-icon>
                Login
              </ion-button>
            </ion-col>
            <ion-col size="6">
              <ion-button expand="block" color="medium" @click="logout">
                <ion-icon slot="start" :icon="logOutOutline"></ion-icon>
                Logout
              </ion-button>
            </ion-col>
          </ion-row>
        </ion-card-content>
      </ion-card>

      <div class="debug-section-title">API & Data Operations</div>
      <ion-grid class="ion-no-padding ion-margin-bottom">
        <ion-row>
          <ion-col size="6">
            <ion-button expand="block" color="secondary" @click="getPlants">
              <ion-icon slot="start" :icon="leafOutline"></ion-icon>
              Get Plants
            </ion-button>
          </ion-col>
          <ion-col size="6">
            <ion-button expand="block" color="tertiary" @click="createPlant">
              <ion-icon slot="start" :icon="addOutline"></ion-icon>
              Create
            </ion-button>
          </ion-col>
          <ion-col size="6">
            <ion-button expand="block" color="warning" @click="triggerApiError">
              <ion-icon slot="start" :icon="bugOutline"></ion-icon>
              Trigger Error
            </ion-button>
          </ion-col>
          <ion-col size="6">
            <ion-button
              expand="block"
              color="light"
              @click="simulateOfflineSave"
            >
              <ion-icon slot="start" :icon="saveOutline"></ion-icon>
              Save Offline
            </ion-button>
          </ion-col>
          <ion-col size="12">
            <ion-button expand="block" color="dark" @click="checkStorageSize">
              <ion-icon slot="start" :icon="folderOpenOutline"></ion-icon>
              Check Storage Footprint
            </ion-button>
          </ion-col>
        </ion-row>
      </ion-grid>

      <div class="debug-section-title">Media & Clipboard</div>
      <ion-card class="ion-no-margin ion-margin-bottom">
        <ion-card-content>
          <div class="file-upload-container">
            <input
              ref="fileInput"
              type="file"
              @change="onFileChange"
              id="file-id"
              class="hidden-input"
            />
            <label for="file-id" class="custom-file-label">
              {{ selectedFile ? selectedFile.name : "Select Image..." }}
            </label>
            <ion-button
              :disabled="!selectedFile"
              @click="uploadImage"
              size="small"
            >
              <ion-icon slot="icon-only" :icon="cloudUploadOutline"></ion-icon>
            </ion-button>
          </div>
          <ion-button
            expand="block"
            fill="clear"
            size="small"
            @click="copyClipboard"
          >
            <ion-icon slot="start" :icon="copyOutline"></ion-icon>
            Copy Sample Text
          </ion-button>
        </ion-card-content>
      </ion-card>

      <div class="debug-section-title">Console Logs ({{ logs.length }})</div>
      <ion-list v-if="logs.length > 0" class="log-list">
        <ion-button expand="block" fill="clear" size="small" @click="clearLogs">
          <ion-icon slot="start" :icon="trashOutline"></ion-icon>
          Clear Logs
        </ion-button>
        <ion-item
          v-for="(l, idx) in logs"
          :key="idx"
          lines="full"
          class="log-item"
        >
          <ion-label>
            <div class="log-header">
              <span class="log-timestamp">{{ l.timestamp }}</span>
              <strong class="log-title">{{ l.title }}</strong>
            </div>
            <pre class="mono">{{ l.payload }}</pre>
          </ion-label>
        </ion-item>
      </ion-list>
      <div v-else class="empty-state">
        <ion-icon :icon="terminalOutline"></ion-icon>
        <p>No logs recorded yet</p>
      </div>
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
  IonItem,
  IonLabel,
  IonIcon,
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardContent,
  IonButtons,
} from "@ionic/vue";
import {
  trashOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  logInOutline,
  logOutOutline,
  leafOutline,
  addOutline,
  bugOutline,
  saveOutline,
  cloudUploadOutline,
  copyOutline,
  terminalOutline,
  folderOpenOutline,
} from "ionicons/icons";

import ToastService from "@/services/general/ToastService";
import UserService from "@/services/UserService";
import PlantService from "@/services/PlantService";
import ApiUtils from "@/utils/apiUtils";
import StorageService from "@/services/general/StorageService";

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
    IonItem,
    IonLabel,
    IonIcon,
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    IonCardContent,
    IonButtons,
  },
  setup() {
    return {
      trashOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
      logInOutline,
      logOutOutline,
      leafOutline,
      addOutline,
      bugOutline,
      saveOutline,
      cloudUploadOutline,
      copyOutline,
      terminalOutline,
      folderOpenOutline,
    };
  },
  data() {
    return {
      logs: [] as Array<{ title: string; payload: string; timestamp: string }>,
      selectedFile: null as File | null,
    };
  },
  methods: {
    pushLog(title: string, payload: any) {
      const p =
        typeof payload === "string"
          ? payload
          : JSON.stringify(payload, null, 2);
      this.logs.unshift({
        title,
        payload: p,
        timestamp: new Date().toLocaleTimeString(),
      });
    },

    /**
     * Helper to format bytes into readable string
     */
    formatBytes(bytes: number, decimals = 2) {
      if (bytes === 0) return "0 Bytes";
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
    },

    async checkStorageSize() {
      try {
        const bytes = await StorageService.getSizeInBytes();
        const readable = this.formatBytes(bytes);
        this.pushLog("Storage Footprint", {
          totalBytes: bytes,
          readableSize: readable,
        });
        ToastService.addToast({
          message: `Storage use: ${readable}`,
          color: "dark",
        });
      } catch (err) {
        this.pushLog("Storage Error", err);
      }
    },

    async dismissToast() {
      ToastService.dismissAllToasts();
      this.pushLog("Toast", "dismissed all");
    },

    async showToastLineBreak() {
      ToastService.showSuccess(
        "Line 1. Some super long and interesting text. Lorem ipsum dolor sit amet. \nLine 2 Lorem ipsum dolor sit amet. \nLine 3 Another line of text.",
        3000,
      );
      this.pushLog("Toast", "line break shown");
    },

    async showToastSuccess() {
      ToastService.showSuccess("Test success", 2000);
      this.pushLog("Toast", "success shown");
    },

    async showToastError() {
      ToastService.showError("Test error: We ran into an issue.", 4000);
      this.pushLog("Toast", "error shown");
    },

    async loginSample() {
      try {
        const creds = { username: "demo@demo.com", password: "password" };
        const res = await UserService.login(creds);
        this.pushLog("Auth: Login", res);
        ToastService.showSuccess("Logged in (debug)");
      } catch (err) {
        this.pushLog("Auth Login Error", err);
        ToastService.showError("Login failed");
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
      const sample = { name: "Debug Plant", scientificName: "Debugus plantus" };
      this.pushLog("Create Plant (Simulated)", sample);
    },

    async triggerApiError() {
      try {
        await ApiUtils.get("/api/debug/trigger-error");
      } catch (err) {
        this.pushLog("API Error (expected)", err);
        ToastService.showError("API error triggered");
      }
    },

    onFileChange(e: Event) {
      const target = e.target as HTMLInputElement;
      if (target.files?.[0]) {
        this.selectedFile = target.files[0];
        this.pushLog("File Selected", {
          name: this.selectedFile.name,
          size: this.selectedFile.size,
        });
      }
    },

    async uploadImage() {
      if (!this.selectedFile) return;
      this.pushLog("Upload Image", { name: this.selectedFile.name });
      ToastService.showSuccess("Image uploaded (debug)");
      this.selectedFile = null;
      if (this.$refs.fileInput)
        (this.$refs.fileInput as HTMLInputElement).value = "";
    },

    async copyClipboard() {
      await navigator.clipboard.writeText("PlantCare Debug sample text");
      this.pushLog("Clipboard", "copied");
      ToastService.addToast({ message: "Copied", color: "primary" });
    },

    simulateOfflineSave() {
      const payload = { ts: new Date().toISOString(), note: "offline sample" };
      localStorage.setItem("debug-offline", JSON.stringify(payload));
      this.pushLog("Offline Save", payload);
      ToastService.addToast({ message: "Saved to storage", color: "tertiary" });
    },

    clearLogs() {
      this.logs = [];
    },
  },
});
</script>

<style scoped>
.debug-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--ion-color-medium);
  letter-spacing: 0.5px;
  margin: 16px 4px 8px 4px;
}

.file-upload-container {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--ion-color-light);
  padding: 8px;
  border-radius: 8px;
  margin-bottom: 8px;
}

.hidden-input {
  display: none;
}

.custom-file-label {
  flex: 1;
  font-size: 13px;
  color: var(--ion-color-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 8px;
}

.log-list {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.log-item {
  --padding-start: 12px;
  --inner-padding-end: 12px;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.log-timestamp {
  font-size: 10px;
  color: var(--ion-color-medium);
  font-family: monospace;
}

.log-title {
  font-size: 13px;
  color: var(--ion-color-primary);
}

.mono {
  font-family: ui-monospace, "Courier New", monospace;
  white-space: pre-wrap;
  font-size: 11px;
  background: #1e1e1e;
  color: #00ff41;
  padding: 10px;
  border-radius: 6px;
  margin: 4px 0;
  max-height: 250px;
  overflow-y: auto;
  border: 1px solid #333;
}

.empty-state {
  text-align: center;
  color: var(--ion-color-medium);
  margin-top: 40px;
}

.empty-state ion-icon {
  font-size: 48px;
  opacity: 0.3;
}
</style>
