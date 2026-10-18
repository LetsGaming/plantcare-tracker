<template>
  <button type="button" class="gallery-open" @click="$emit('open')">
    <span class="gallery-image">
      <progressive-image :image="image" :sizes="sizes" :alt="alt" :seed="seed" />
    </span>
    <span v-if="caption" class="image-date" aria-hidden="true">{{ caption }}</span>
  </button>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import ProgressiveImage from "@/components/ProgressiveImage.vue";

/** The tile is 168px wide, 148px from 900px up; the 160 and 480 variants cover both. */
const TILE_SIZES = "(min-width: 900px) 148px, 168px";

export default defineComponent({
  name: "GalleryTile",
  components: { ProgressiveImage },
  props: {
    image: { type: Object as PropType<ImageView>, required: true },
    alt: { type: String, default: "" },
    caption: { type: String, default: "" },
    seed: { type: String, default: "" },
  },
  emits: ["open"],
  data() {
    return { sizes: TILE_SIZES };
  },
});
</script>

<style scoped>
.gallery-open {
  display: grid;
  gap: var(--space-1);
  padding: 0;
  margin: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.gallery-image {
  display: block;
  width: 168px;
  height: 168px;
  overflow: hidden;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
}

.image-date {
  font-size: var(--text-xs);
  color: var(--ink-soft);
}

@media (min-width: 900px) {
  .gallery-image {
    width: 148px;
    height: 148px;
  }
}
</style>
