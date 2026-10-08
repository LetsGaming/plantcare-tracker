<template>
  <section class="state" :class="`state-${kind}`" :aria-busy="kind === 'loading'" role="status">
    <template v-if="kind === 'loading'">
      <div class="skeleton-grid" aria-hidden="true">
        <div v-for="n in skeletons" :key="n" class="skeleton-card">
          <div class="skeleton-image" />
          <div class="skeleton-line" />
          <div class="skeleton-line short" />
        </div>
      </div>
      <span class="sr-only">{{ title }}</span>
    </template>

    <template v-else>
      <PlantPlaceholder :kind="placeholderKind" :seed="kind" class="art" />
      <h2 class="title">{{ title }}</h2>
      <p v-if="message" class="message">{{ message }}</p>
      <ion-button v-if="actionLabel" class="action" @click="$emit('action')">
        {{ actionLabel }}
      </ion-button>
    </template>
  </section>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonButton } from "@ionic/vue";
import PlantPlaceholder, { PlaceholderKind } from "./PlantPlaceholder.vue";

export type StateKind = "loading" | "empty" | "error" | "not-found";

/** Loading, empty, error and not-found for any list or detail screen, always with the next step when there is one. */
export default defineComponent({
  name: "StateBlock",
  components: { IonButton, PlantPlaceholder },
  props: {
    kind: { type: String as PropType<StateKind>, required: true },
    title: { type: String, default: "" },
    message: { type: String, default: "" },
    actionLabel: { type: String, default: "" },
    placeholderKind: { type: String as PropType<PlaceholderKind>, default: "plant" },
    skeletons: { type: Number, default: 4 },
  },
  emits: ["action"],
});
</script>

<style scoped>
.state {
  width: 100%;
  max-width: 520px;
  margin: var(--space-6) auto;
  padding: 0 var(--space-4);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3);
}

.state-loading {
  max-width: var(--content-max);
}

.art {
  width: 148px;
  height: 148px;
  min-height: 0;
  border-radius: var(--radius-lg);
}

.title {
  font-size: var(--text-lg);
}

.message {
  margin: 0;
  color: var(--ink-soft);
}

.action {
  margin-top: var(--space-2);
}

.state-error .art {
  filter: grayscale(0.6);
}

.skeleton-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-4);
}

.skeleton-card {
  background: var(--surface-raised);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: grid;
  gap: var(--space-2);
}

.skeleton-image,
.skeleton-line {
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--surface-sunken) 25%,
    var(--line) 50%,
    var(--surface-sunken) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s var(--ease-out) infinite;
}

.skeleton-image {
  aspect-ratio: 1 / 1;
}

.skeleton-line {
  height: 14px;
}

.skeleton-line.short {
  width: 60%;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
</style>
