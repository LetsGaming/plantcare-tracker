<template>
  <ion-page>
    <details-header
      :show-edit-button="showEditButton"
      @edit-click="navigateToComponentEditing"
      default-href="/tabs/components/overview"
    ></details-header>
    <ion-content>
      <div v-if="component">
        <!-- Full-width banner with dynamic component image -->
        <section class="component-banner">
          <ion-img
            :src="component.imageUrl || '/no-image.png'"
            alt="Component Image"
            class="component-banner-image"
          />
        </section>
        <div class="component-info">
          <ion-card class="component-banner-content align-middle">
            <ion-card-header>
              <h2 class="component-name">{{ component.name }}</h2>
            </ion-card-header>
            <ion-card-content>
              <p class="component-fineness">
                Fineness: {{ component.fineness }}
              </p>
            </ion-card-content>
          </ion-card>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import {
  IonPage,
  IonContent,
  IonImg,
  IonLabel,
  IonCard,
  IonCardContent,
  IonCardHeader,
} from "@ionic/vue";
import { defineComponent } from "vue";
import ComponentService from "@/services/ComponentService";
import DetailsHeader from "@/components/details/DetailsHeader.vue";
import HorizontalGallery from "@/components/details/HorizontalGallery.vue";
import AuthUtils from "@/utils/authUtils";

export default defineComponent({
  name: "ComponentDetails",
  components: {
    IonPage,
    IonContent,
    IonImg,
    IonLabel,
    IonCard,
    IonCardContent,
    IonCardHeader,
    DetailsHeader,
    HorizontalGallery,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      component: null as null | Component,
      showEditButton: false,
    };
  },
  async mounted() {
    try {
      this.component = await ComponentService.getComponentById(
        this.componentId
      );
      this.showEditButton = await AuthUtils.isAdmin();
    } catch (error) {
      console.error("Error fetching component details:", error);
    }
  },
  computed: {
    componentId() {
      return Number.parseInt(this.id);
    },
  },
  methods: {
    navigateToComponentEditing() {
      const id = this.componentId;
      this.$router.push({ name: "component-editing", params: { id: id } });
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

.component-banner {
  position: relative;
  width: 100%;
  height: 800px;
  overflow: hidden;
}

.component-banner-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.component-name {
  font-size: 2rem;
  font-weight: bold;
  margin: 0;
}

.component-fineness {
  font-size: 1.2rem;
  margin-top: 5px;
}

.component-info {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--card-background-color);
  border-radius: 16px;;
  transition: background 0.3s ease;
}

.component-banner-content {
    flex-flow: column !important;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
