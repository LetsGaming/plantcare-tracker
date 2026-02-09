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
    // We allow String, Null, or Undefined to handle any raw API data
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
      default: 128, // Default low-res size in pixels
    },
  },
  data() {
    return {
      currentSrc: "/no-image.png",
      isLoading: false,
      fallbackUrl: "/no-image.png",
    };
  },
  watch: {
    // Watch the src prop and re-run logic if it changes
    src: {
      immediate: true,
      handler(newVal) {
        this.processImage(newVal);
      },
    },
  },
  methods: {
    processImage(url: string | null) {
      // 1. Internal check for null/empty source
      if (!url) {
        this.handleError();
        return;
      }

      this.isLoading = true;

      // 2. Construct the low-res URL
      // Logic: checks for existing query params to avoid breaking the URL
      const separator = url.includes("?") ? "&" : "?";
      const lowResUrl = `${url}${separator}size=${this.lowResSize}`;

      // 3. Set the low-res version immediately to give quick feedback
      this.currentSrc = lowResUrl;

      // 4. Background high-res fetch
      const img = new Image();
      img.src = url;

      img.onload = () => {
        this.currentSrc = url;
        this.isLoading = false;
      };

      img.onerror = () => {
        this.handleError();
      };
    },
    handleError() {
      this.currentSrc = this.fallbackUrl;
      this.isLoading = false;
    },
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
  transition:
    filter 0.4s ease-in-out,
    transform 0.4s ease-in-out;
}

.progressive-img-container ion-img {
  width: 100%;
  height: 100%;
}

.progressive-img-container ion-img::part(image) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.is-loading {
  filter: blur(10px);
  transform: scale(1.05); /* Prevents blur bleed on the edges */
}
</style>
