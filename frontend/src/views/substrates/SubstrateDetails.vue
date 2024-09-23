<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button text="Zurück"></ion-back-button>
        </ion-buttons>
        <ion-title>Substrat Details</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="substrate">
        <!-- Full-width banner with dynamic substrate image -->
        <section class="substrate-banner">
          <ion-img
            :src="substrate.imageUrl || '/no-image.png'"
            alt="Substrate Image"
            class="substrate-banner-image"
          />
          <div class="substrate-banner-content">
            <h2 class="substrate-name">{{ substrate.name }}</h2>
          </div>
        </section>

        <section class="substrate-info">
          <SubstrateContainer :substrate="substrate"></SubstrateContainer>
        </section>
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
  IonButtons,
  IonBackButton,
  IonTitle,
  IonImg,
} from "@ionic/vue";
import SubstrateService from "@/services/SubstrateService";
import SubstrateContainer from "@/components/plants/SubstrateContainer.vue";

export default defineComponent({
  name: "SubstrateDetails",
  components: {
    IonPage,
    IonContent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonImg,

    SubstrateContainer,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      substrate: null as null | Substrate,
    };
  },
  async mounted() {
    try {
      this.substrate = await SubstrateService.getSubstrateById(
        this.substrateId,
        this.isPublic
      );
    } catch (error) {
      console.error("Error fetching substrate details:", error);
    }
  },
  computed: {
    substrateId() {
      return Number.parseInt(this.id);
    },
  },
});
</script>

<style scoped>
:root {
  --background-color: var(--ion-color-light);
  --card-background-color: var(--ion-color-white);
  --header-background-color: var(--ion-color-light-tint);
  --text-color: var(--ion-color-dark);
  --detail-text-color: var(--ion-color-medium);
  --accent-color: var(--ion-color-primary);
}

.substrate-banner {
  position: relative;
  width: 100%;
  height: 500px;
  overflow: hidden;
}

.substrate-banner-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.substrate-banner-content {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px;
  background: rgba(0, 0, 0, 0.5); /* Dark overlay for readability */
  color: white;
  text-align: left;
}

.substrate-name {
  font-size: 2rem;
  font-weight: bold;
  margin: 0;
}

.substrate-type {
  font-size: 1.2rem;
  margin-top: 5px;
}

.substrate-info {
  padding: 20px;
  background: var(--card-background-color);
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
  transition: background 0.3s ease;
}
</style>
