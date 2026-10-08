<template>
  <div class="progressive-img-container">
    <PlantPlaceholder v-if="showPlaceholder" :kind="kind" :seed="seed || alt" :label="alt" />
    <ion-img
      v-else
      :src="currentSrc"
      :alt="alt"
      :class="{ 'is-loading': isLoading }"
      @ion-error="failed = true"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonImg } from "@ionic/vue";
import PlantPlaceholder, { PlaceholderKind } from "@/components/ui/PlantPlaceholder.vue";

/** Inline sources cannot take a size query, so they skip the low resolution step. */
const isInline = (url: string): boolean => url.startsWith("data:") || url.startsWith("blob:");

export default defineComponent({
  name: "ProgressiveImage",
  components: {
    IonImg,
    PlantPlaceholder,
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
    kind: {
      type: String as PropType<PlaceholderKind>,
      default: "plant",
    },
    seed: {
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
      currentSrc: "",
      isLoading: false,
      failed: false,
      // Reference to the current loading high-res image to allow cancellation
      highResLoader: null as HTMLImageElement | null,
    };
  },
  computed: {
    showPlaceholder(): boolean {
      return this.failed || !this.src || !this.currentSrc;
    },
  },
  watch: {
    src: {
      immediate: true,
      handler(newVal: string | null) {
        this.processImage(newVal);
      },
    },
  },
  methods: {
    processImage(url: string | null) {
      this.cancelHighRes();
      this.failed = false;
      this.currentSrc = "";

      if (!url) {
        this.isLoading = false;
        return;
      }

      this.isLoading = true;

      if (isInline(url)) {
        this.fetchHighRes(url);
        return;
      }

      const separator = url.includes("?") ? "&" : "?";
      const lowResUrl = `${url}${separator}size=${this.lowResSize}`;
      const lowResImg = new Image();
      lowResImg.src = lowResUrl;

      lowResImg.onload = () => {
        this.currentSrc = lowResUrl;
        this.fetchHighRes(url);
      };

      lowResImg.onerror = () => {
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
        if (!this.currentSrc) this.failed = true;
        this.isLoading = false;
        this.highResLoader = null;
      };
    },

    cancelHighRes() {
      if (!this.highResLoader) return;
      this.highResLoader.onload = null;
      this.highResLoader.onerror = null;
      this.highResLoader = null;
    },
  },
  beforeUnmount() {
    this.cancelHighRes();
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
}

.progressive-img-container ion-img::part(image) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0;
}

.is-loading {
  filter: blur(10px);
  transition: filter 0.2s var(--ease-out);
}
</style>
