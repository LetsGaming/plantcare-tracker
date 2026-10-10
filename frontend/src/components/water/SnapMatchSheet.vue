<template>
  <ion-modal
    v-if="mounted"
    class="snap-sheet"
    :is-open="isOpen"
    :aria-label="dialogLabel"
    :handle="false"
    :breakpoints="[0, 0.65, 1]"
    :initial-breakpoint="0.65"
    :can-dismiss="!busy"
    @didDismiss="onDismiss"
  >
    <ion-content>
      <div class="sheet">
        <span class="grabber" aria-hidden="true"></span>
        <div class="sr-status" role="status" aria-live="polite">{{ announcement }}</div>
        <div v-if="state === 'matching'" class="matching" role="status">
          <ion-spinner name="crescent" />
          <p>{{ t("water.snap_matching") }}</p>
        </div>

        <template v-else-if="state === 'candidates'">
          <h2 ref="title" class="sheet-title" tabindex="-1">{{ heading }}</h2>
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
          <div class="logged-head">
            <span class="logged-thumb" aria-hidden="true">
              <img v-if="loggedImageUrl" :src="loggedImageUrl" alt="" />
              <plant-placeholder v-else :seed="String(loggedPlantId ?? '')" />
            </span>
            <h2 ref="title" class="sheet-title break-words" tabindex="-1">
              {{ t("water.snap_logged", { name: loggedName }) }}
            </h2>
          </div>
          <p v-if="fertilizerTypes.length" :id="chipsLabelId" class="chips-label">
            {{ t("water.fertilizer_prompt") }}
          </p>
          <div
            v-if="fertilizerTypes.length"
            class="chips chips-group"
            role="group"
            :aria-labelledby="chipsLabelId"
          >
            <button
              v-for="type in fertilizerTypes"
              :key="type.id"
              type="button"
              class="fertilizer-chip"
              :data-kind="fertilizerKind(type.name)"
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
              fill="clear"
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
import PlantPlaceholder from "@/components/ui/PlantPlaceholder.vue";
import { nextFieldId } from "@/components/formcomponent/fieldShared";
import { icons } from "@/theme/icons";
import { fertilizerKind, fertilizerLabel } from "@/utils/enumLabels";
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
  components: { IonButton, IonContent, IonIcon, IonModal, IonSpinner, PlantPlaceholder },
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
    loggedImageUrl: { type: String, default: "" },
    loggedPlantId: { type: Number as PropType<number | null>, default: null },
    selectedFertilizerId: { type: Number as PropType<number | null>, default: null },
    fertilizerTypes: { type: Array as PropType<FertilizerType[]>, default: () => [] },
  },
  emits: ["close", "pick", "other", "fertilize", "undo"],
  setup(props) {
    return { icons, ...useMountWhileOpen(() => props.isOpen) };
  },
  data() {
    return { announcement: "", chipsLabelId: nextFieldId("snap-chips") };
  },
  computed: {
    dialogLabel(): string {
      if (this.state === "matching") return this.t("water.snap_matching");
      if (this.state === "logged") return this.t("water.snap_logged", { name: this.loggedName });
      return this.heading;
    },
    shown(): SnapCandidate[] {
      return this.candidates.slice(0, MAX_SHOWN);
    },
    heading(): string {
      if (!this.shown.length) return this.t("water.snap_no_match");
      return this.t(this.confident ? "water.snap_is_this" : "water.snap_not_sure");
    },
  },
  watch: {
    state(newState: string, oldState: string) {
      this.announcement =
        newState === "logged" ? this.t("water.snap_logged", { name: this.loggedName }) : "";
      if (oldState && newState !== "matching") {
        void this.$nextTick(() => (this.$refs.title as HTMLElement | undefined)?.focus?.());
      }
    },
  },
  methods: {
    fertilizerKind,
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
.grabber {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--control-border);
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}

.sheet-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 650;
}

.sr-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.sheet-title:focus {
  outline: none;
}

.logged-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.logged-thumb {
  display: block;
  width: 56px;
  height: 56px;
  flex: none;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
}

.logged-thumb img,
.logged-thumb :deep(.placeholder) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chips-label {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--ink-soft);
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

.fertilizer-chip[data-kind="organic"] {
  border-color: var(--feed-organic);
  color: var(--feed-organic);
}

.fertilizer-chip[data-kind="organic"].selected {
  background: var(--feed-organic);
  color: var(--feed-organic-contrast);
}

.fertilizer-chip[data-kind="mineral"] {
  border-color: var(--feed-mineral);
  color: var(--feed-mineral);
}

.fertilizer-chip[data-kind="mineral"].selected {
  background: var(--feed-mineral);
  color: var(--feed-mineral-contrast);
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
