<template>
  <div class="progressive-img-container" :style="{ aspectRatio }">
    <PlantPlaceholder
      class="layer"
      :kind="kind"
      :seed="seed || alt"
      :label="showImage ? '' : alt"
      :class="{ covered: loaded && showImage }"
      :color="showImage ? (image?.placeholder ?? '') : ''"
    />
    <img
      v-if="showImage"
      ref="img"
      class="layer photo"
      :class="{ 'is-loaded': loaded, fade: !reducedMotion }"
      :src="url"
      :srcset="image?.srcset || undefined"
      :sizes="image?.srcset ? sizes || '100vw' : undefined"
      :width="image?.width || undefined"
      :height="image?.height || undefined"
      :alt="alt"
      :referrerpolicy="image ? undefined : 'no-referrer'"
      :loading="priority ? 'eager' : 'lazy'"
      :fetchpriority="priority ? 'high' : undefined"
      decoding="async"
      draggable="false"
      @load="loaded = true"
      @error="failed = true"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import PlantPlaceholder, { PlaceholderKind } from "@/components/ui/PlantPlaceholder.vue";

/** The part of an ImageView the component renders. */
type ImageSource = Pick<ImageView, "url"> &
  Partial<Pick<ImageView, "srcset" | "width" | "height" | "placeholder">>;

const FALLBACK_RATIO = "4 / 3";

export default defineComponent({
  name: "ProgressiveImage",
  components: { PlantPlaceholder },
  props: {
    /** Server image; `url` is the 1024 variant and `srcset` lists the smaller ones. */
    image: {
      type: Object as PropType<ImageSource | null>,
      default: null,
    },
    /** Plain url for third-party images (sales) that have no variants. */
    src: {
      type: String,
      default: "",
    },
    sizes: {
      type: String,
      default: "",
    },
    /** Above-the-fold image: loaded eagerly with high fetch priority. */
    priority: {
      type: Boolean,
      default: false,
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
  },
  data() {
    return {
      loaded: false,
      failed: false,
      reducedMotion:
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  },
  computed: {
    url(): string {
      return this.image?.url || this.src || "";
    },
    showImage(): boolean {
      return !!this.url && !this.failed;
    },
    aspectRatio(): string {
      const width = this.image?.width;
      const height = this.image?.height;
      return width && height ? `${width} / ${height}` : FALLBACK_RATIO;
    },
  },
  watch: {
    url() {
      this.loaded = false;
      this.failed = false;
    },
  },
  mounted() {
    const img = this.$refs.img as HTMLImageElement | undefined;
    if (img?.complete && img.naturalWidth > 0) this.loaded = true;
  },
});
</script>

<style scoped>
.progressive-img-container {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 100%;
}

.layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.layer.covered {
  visibility: hidden;
}

.photo {
  display: block;
  object-fit: cover;
  opacity: 0;
}

.photo.is-loaded {
  opacity: 1;
}

.photo.fade {
  transition: opacity 0.25s var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .photo.fade {
    transition: none;
  }
}
</style>
