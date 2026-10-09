<template>
  <ion-modal
    v-if="mounted"
    class="snap-sheet"
    :is-open="isOpen"
    :breakpoints="[0, 0.65, 1]"
    :initial-breakpoint="0.65"
    :can-dismiss="!busy"
    @didDismiss="onDismiss"
  >
    <ion-content>
      <div class="sheet">
        <div v-if="state === 'matching'" class="matching" role="status">
          <ion-spinner name="crescent" />
          <p>{{ t("water.snap_matching") }}</p>
        </div>

        <template v-else-if="state === 'candidates'">
          <h2 class="sheet-title">{{ heading }}</h2>
          <ul v-if="shown.length" class="candidates">
            <li v-for="(candidate, index) in shown" :key="candidate.plantId">
              <button
                type="button"
                class="candidate"
                :class="{ highlight: confident && index === 0 }"
                :disabled="busy"
                @click="pick(candidate.plantId)"
              >
                <span class="thumb" aria-hidden="true">
                  <img v-if="candidate.imageUrl" :src="candidate.imageUrl" alt="" />
                  <ion-icon v-else :icon="icons.plant" />
                </span>
                <span class="text">
                  <span class="name break-words">{{ candidate.name }}</span>
                  <span
                    v-if="candidate.tone !== 'ok'"
                    class="tone-chip"
                    :class="`tone-${candidate.tone}`"
                  >
                    {{ t(`plantlist.${candidate.tone}`) }}
                  </span>
                </span>
              </button>
            </li>
          </ul>
          <ion-button
            class="other-button"
            expand="block"
            fill="outline"
            size="large"
            :disabled="busy"
            @click="$emit('other')"
          >
            {{ t("water.snap_other") }}
          </ion-button>
        </template>

        <template v-else>
          <h2 class="sheet-title">{{ t("water.snap_logged", { name: loggedName }) }}</h2>
          <div v-if="fertilizerTypes.length" class="chips">
            <button
              v-for="type in fertilizerTypes"
              :key="type.id"
              type="button"
              class="fertilizer-chip"
              :class="{ selected: type.id === selectedFertilizerId }"
              :aria-pressed="type.id === selectedFertilizerId"
              :disabled="busy"
              @click="$emit('fertilize', type.id)"
            >
              {{ fertilizerLabel(type.name) }}
            </button>
          </div>
          <div class="actions">
            <ion-button
              class="undo-button"
              fill="outline"
              size="large"
              :disabled="busy"
              @click="$emit('undo')"
            >
              {{ t("plantdetail.undo") }}
            </ion-button>
            <ion-button class="done-button" size="large" :disabled="busy" @click="$emit('close')">
              {{ t("water.snap_done") }}
            </ion-button>
          </div>
        </template>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import { IonButton, IonContent, IonIcon, IonModal, IonSpinner } from "@ionic/vue";
import localizationService from "@/services/general/LocalizationService";
import { useMountWhileOpen } from "@/components/modal/useMountWhileOpen";
import { icons } from "@/theme/icons";
import { fertilizerLabel } from "@/utils/enumLabels";
import type { WateringTone } from "@/utils/wateringStats";

export interface SnapCandidate {
  plantId: number;
  name: string;
  imageUrl?: string;
  tone: WateringTone;
}

const MAX_SHOWN = 3;

export default defineComponent({
  name: "SnapMatchSheet",
  components: { IonButton, IonContent, IonIcon, IonModal, IonSpinner },
  props: {
    isOpen: { type: Boolean, required: true },
    state: {
      type: String as PropType<"matching" | "candidates" | "logged">,
      required: true,
    },
    candidates: { type: Array as PropType<SnapCandidate[]>, default: () => [] },
    confident: { type: Boolean, default: false },
    busy: { type: Boolean, default: false },
    loggedName: { type: String, default: "" },
    selectedFertilizerId: { type: Number as PropType<number | null>, default: null },
    fertilizerTypes: { type: Array as PropType<FertilizerType[]>, default: () => [] },
  },
  emits: ["close", "pick", "other", "fertilize", "undo"],
  setup(props) {
    return { icons, ...useMountWhileOpen(() => props.isOpen) };
  },
  computed: {
    shown(): SnapCandidate[] {
      return this.candidates.slice(0, MAX_SHOWN);
    },
    heading(): string {
      if (!this.shown.length) return this.t("water.snap_no_match");
      return this.t(this.confident ? "water.snap_is_this" : "water.snap_not_sure");
    },
  },
  methods: {
    fertilizerLabel,
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    pick(plantId: number) {
      if (!this.busy) this.$emit("pick", plantId);
    },
    onDismiss() {
      this.release();
      this.$emit("close");
    },
  },
});
</script>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}

.sheet-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 700;
}

.matching {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) 0;
  color: var(--ink-soft);
}

.candidates {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.candidate {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 64px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--ion-border-color);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.candidate.highlight {
  border-color: var(--ion-color-primary);
  border-width: 2px;
}

.candidate:disabled {
  opacity: 0.5;
  cursor: default;
}

.thumb {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex: none;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  color: var(--ink-soft);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  min-width: 0;
}

.name {
  font-weight: 600;
}

.other-button {
  margin: 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.fertilizer-chip {
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: 1px solid var(--ion-color-primary);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--ion-color-primary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.fertilizer-chip.selected {
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
}

.fertilizer-chip:disabled {
  opacity: 0.5;
  cursor: default;
}

.actions {
  display: flex;
  gap: var(--space-2);
}

.actions ion-button {
  flex: 1;
  margin: 0;
}
</style>
