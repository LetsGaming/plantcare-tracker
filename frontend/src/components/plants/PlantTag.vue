<template>
  <header class="tag">
    <span class="hole" aria-hidden="true" />
    <div class="tag-text">
      <h1 class="tag-name break-words">{{ name }}</h1>
      <p v-if="species" class="tag-species break-words">{{ species }}</p>
    </div>
    <span class="chip" :class="isPublic ? 'chip-public' : 'chip-private'">
      <ion-icon :icon="isPublic ? earthOutline : lockClosedOutline" aria-hidden="true" />
      {{ isPublic ? t("plantdetail.public") : t("plantdetail.private") }}
    </span>
  </header>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonIcon } from "@ionic/vue";
import { earthOutline, lockClosedOutline } from "ionicons/icons";
import localizationService from "@/services/general/LocalizationService";

/** The plant's painted tag: name in the display face, species and visibility. */
export default defineComponent({
  name: "PlantTag",
  components: { IonIcon },
  props: {
    name: { type: String, required: true },
    species: { type: String, default: "" },
    isPublic: { type: Boolean, default: false },
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
.tag {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) var(--space-4) var(--space-7);
  border-radius: var(--radius-md) var(--radius-lg) var(--radius-lg) var(--radius-md);
  background: var(--leaf-wash);
  color: var(--ion-text-color);
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

.tag-text {
  min-width: 0;
}

.tag-name {
  font-size: var(--text-xl);
  hyphens: manual;
}

.tag-species {
  margin: var(--space-1) 0 0;
  font-style: italic;
  color: var(--ink-soft);
}

.chip {
  justify-self: start;
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

@media (min-width: 900px) {
  .tag {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .tag-name {
    font-size: var(--text-2xl);
  }
}
</style>
