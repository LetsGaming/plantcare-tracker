<template>
  <section class="details-banner">
    <div class="details-banner__media">
      <progressive-image
        :src="imageUrl ?? ''"
        :alt="altText"
        :kind="placeholderKind"
        :seed="bannerTitle"
      />
    </div>
    <div v-if="!imageOnly" class="details-banner__content">
      <h1 class="details-banner__title break-words">{{ bannerTitle }}</h1>
      <p class="details-banner__subtitle break-words" v-if="bannerSubtitle">
        {{ bannerSubtitle }}
      </p>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import ProgressiveImage from "@/components/ProgressiveImage.vue";
import type { PlaceholderKind } from "@/components/ui/PlantPlaceholder.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "DetailsBanner",
  components: {
    ProgressiveImage,
  },
  props: {
    bannerTitle: {
      type: String,
      required: true,
    },
    bannerSubtitle: {
      type: String,
      required: false,
    },
    imageUrl: {
      type: String,
      required: false,
    },
    /** Descriptive alt text; defaults to "Photo of {title}". */
    imageAlt: {
      type: String,
      required: false,
    },
    placeholderKind: {
      type: String as PropType<PlaceholderKind>,
      default: "plant",
    },
    /** Renders the photo alone, for screens that show the title elsewhere. */
    imageOnly: {
      type: Boolean,
      default: false,
    },
  },
  computed: {
    altText(): string {
      return (
        this.imageAlt ??
        localizationService.t(
          "plantdetail.hero_alt",
          { name: this.bannerTitle },
          `Photo of ${this.bannerTitle}`,
        )
      );
    },
  },
});
</script>

<style scoped>
.details-banner {
  width: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
  box-sizing: border-box;
}

.details-banner__media {
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 40vh;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
}

.details-banner__content {
  padding: var(--space-4) var(--space-4) 0;
  color: var(--ion-text-color);
}

.details-banner__title {
  font-size: var(--text-xl);
}

.details-banner__subtitle {
  margin: var(--space-1) 0 0;
  font-size: var(--text-md);
  color: var(--ink-soft);
}

@media (min-width: 900px) {
  .details-banner__title {
    font-size: var(--text-2xl);
  }
}
</style>
