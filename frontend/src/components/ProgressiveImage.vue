<template>
  <div class="progressive-img-container">
    <ion-img
      :src="currentSrc"
      :alt="alt"
      :class="{ 'is-loading': isLoading }"
      @ion-error="handleError"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonImg } from "@ionic/vue";

export default defineComponent({
  name: "ProgressiveImage",
  components: {
    IonImg,
  },
  props: {
    src: {
      type: String,
      default: null,
    },
    alt: {
      type: String,
      default: "",
    },
    lowResSize: {
      type: [String, Number],
      default: 128,
    },
  },
  data() {
    return {
      currentSrc: "/no-image.png",
      isLoading: false,
      fallbackUrl: "/no-image.png",
      // Reference to the current loading high-res image to allow cancellation
      highResLoader: null as HTMLImageElement | null,
    };
  },
  watch: {
    src: {
      immediate: true,
      handler(newVal) {
        this.processImage(newVal);
      },
    },
  },
  methods: {
    processImage(url: string | null) {
      if (!url) {
        this.handleError();
        return;
      }

      // Cancel any existing background loads if the src changes mid-flight
      if (this.highResLoader) {
        this.highResLoader.onload = null;
        this.highResLoader.onerror = null;
        this.highResLoader = null;
      }

      this.isLoading = true;

      const separator = url.includes("?") ? "&" : "?";
      const lowResUrl = `${url}${separator}size=${this.lowResSize}`;

      // 1. Create a loader for the low-res version first
      const lowResImg = new Image();
      lowResImg.src = lowResUrl;

      lowResImg.onload = () => {
        // 2. Only show the low-res once it's actually ready
        this.currentSrc = lowResUrl;

        // 3. Now that the low-res is visible, start fetching the high-res in the background
        this.fetchHighRes(url);
      };

      lowResImg.onerror = () => {
        // If low-res fails, try to jump straight to high-res
        this.fetchHighRes(url);
      };
    },

    fetchHighRes(url: string) {
      const img = new Image();
      this.highResLoader = img;
      img.src = url;

      img.onload = () => {
        this.currentSrc = url;
        this.isLoading = false;
        this.highResLoader = null;
      };

      img.onerror = () => {
        // If we haven't even managed to show the low-res yet, show fallback
        if (this.currentSrc === this.fallbackUrl) {
          this.handleError();
        }
        this.isLoading = false;
        this.highResLoader = null;
      };
    },

    handleError() {
      this.currentSrc = this.fallbackUrl;
      this.isLoading = false;
    },
  },
  beforeUnmount() {
    // Cleanup to prevent memory leaks or state updates on unmounted components
    if (this.highResLoader) {
      this.highResLoader.onload = null;
      this.highResLoader.onerror = null;
    }
  },
});
</script>

<style scoped>
.progressive-img-container {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

ion-img {
  width: 100%;
  height: 100%;
  display: block;
  transition: filter 0.5s ease-in-out;
}

.progressive-img-container ion-img::part(image) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.is-loading {
  filter: blur(10px);
  /* Removed transform scale because it can cause layout shifts in some Ion-Grid setups, 
     but add it back if you see white edges during the blur */
}
</style>
