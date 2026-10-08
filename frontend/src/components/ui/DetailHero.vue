<template>
  <header class="hero">
    <div class="media">
      <ProgressiveImage :src="imageUrl" :alt="imageAlt" :kind="kind" :seed="title" />
    </div>
    <div class="tag">
      <span class="hole" aria-hidden="true" />
      <h1 class="title break-words">{{ title }}</h1>
      <div v-if="isPublic !== undefined || $slots.default" class="meta">
        <span
          v-if="isPublic !== undefined"
          class="chip"
          :class="isPublic ? 'chip-public' : 'chip-private'"
        >
          <ion-icon :icon="isPublic ? earthOutline : lockClosedOutline" aria-hidden="true" />
          {{ isPublic ? t("plantdetail.public") : t("plantdetail.private") }}
        </span>
        <slot />
      </div>
    </div>
  </header>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonIcon } from "@ionic/vue";
import { earthOutline, lockClosedOutline } from "ionicons/icons";
import localizationService from "@/services/general/LocalizationService";
import ProgressiveImage from "@/components/ProgressiveImage.vue";
import type { PlaceholderKind } from "@/components/ui/PlantPlaceholder.vue";

/** Detail screen top: photo capped to the viewport, with the name on a tag that wraps long names. */
export default defineComponent({
  name: "DetailHero",
  components: { ProgressiveImage, IonIcon },
  props: {
    title: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    imageAlt: { type: String, default: "" },
    kind: { type: String as PropType<PlaceholderKind>, default: "plant" },
    isPublic: { type: Boolean, default: undefined },
  },
  setup() {
    return { earthOutline, lockClosedOutline };
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
  },
});
</script>

<style scoped>
.hero {
  width: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4) var(--space-4) 0;
  box-sizing: border-box;
}

.media {
  height: min(40vh, 360px);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--surface-sunken);
}

.tag {
  position: relative;
  margin: calc(var(--space-5) * -1) var(--space-3) 0;
  padding: var(--space-4) var(--space-4) var(--space-4) var(--space-7);
  background: var(--leaf-wash);
  border-radius: var(--radius-md) var(--radius-lg) var(--radius-lg) var(--radius-md);
  box-shadow: var(--shadow-card);
}

.hole {
  position: absolute;
  top: var(--space-4);
  left: var(--space-4);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface-sunken);
  box-shadow: inset 0 0 0 1.5px var(--line);
}

.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  line-height: 1.2;
  hyphens: manual;
}

.meta {
  margin-top: var(--space-2);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--space-2);
  row-gap: var(--space-1);
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  font-size: var(--text-xs);
  font-weight: 650;
}

.chip ion-icon {
  width: 16px;
  height: 16px;
}

.chip-public {
  background: var(--water-wash);
  color: var(--ion-text-color);
}

.chip-private {
  background: var(--surface-raised);
  color: var(--ink-soft);
  box-shadow: inset 0 0 0 1px var(--line);
}

.meta > :deep(* + *)::before {
  content: "";
  display: inline-block;
  width: 3px;
  height: 3px;
  margin-right: var(--space-2);
  vertical-align: middle;
  border-radius: 50%;
  background: currentColor;
}

@media (min-width: 900px) {
  .title {
    font-size: var(--text-2xl);
  }
}
</style>
