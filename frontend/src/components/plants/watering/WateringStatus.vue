<template>
  <section
    class="status"
    :class="{ 'just-watered': justWatered }"
    :aria-labelledby="headingId"
    :aria-busy="loading"
  >
    <h2 :id="headingId" class="status-heading">{{ t("plantdetail.watering_status") }}</h2>

    <dl class="facts">
      <div class="fact fact-main">
        <dt>{{ t("plantdetail.last_watered") }}</dt>
        <dd class="fact-value">{{ lastWateredText }}</dd>
      </div>
      <div class="fact">
        <dt>{{ t("plantdetail.interval_label") }}</dt>
        <dd>{{ intervalText }}</dd>
      </div>
    </dl>

    <div v-if="canWater" class="actions">
      <ion-button class="water-now" color="tertiary" :disabled="pending" @click="waterNow">
        <ion-spinner v-if="pending" name="crescent" slot="start" />
        <ion-icon v-else :icon="water" slot="start" aria-hidden="true" />
        {{ pending ? t("plantdetail.watering_saving") : t("plantdetail.water_now") }}
      </ion-button>
      <ion-button class="with-details" fill="clear" @click="$emit('add-details')">
        {{ t("plantdetail.add_with_details") }}
      </ion-button>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapActions, mapState } from "pinia";
import { IonButton, IonIcon, IonSpinner } from "@ionic/vue";
import { water } from "ionicons/icons";
import { useWateringStore } from "@/stores/watering";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import { calendarDaysBetween } from "@/utils/localDate";
import {
  averageIntervalDays,
  describeInterval,
  latestWateringMillis,
  relativeDaysText,
} from "@/utils/wateringStats";

const SETTLE_MS = 650;
let statusCount = 0;

export default defineComponent({
  name: "WateringStatus",
  components: { IonButton, IonIcon, IonSpinner },
  props: {
    plantId: { type: Number, required: true },
    plantName: { type: String, required: true },
    canWater: { type: Boolean, default: false },
  },
  emits: ["add-details"],
  setup() {
    return { water };
  },
  data() {
    return {
      loading: true,
      pending: false,
      justWatered: false,
      settleTimer: undefined as ReturnType<typeof setTimeout> | undefined,
      headingId: `watering-status-${++statusCount}`,
    };
  },
  async mounted() {
    try {
      await this.ensureRecords(this.plantId);
    } catch (error) {
      console.error("Failed to load watering records:", error);
    } finally {
      this.loading = false;
    }
  },
  beforeUnmount() {
    clearTimeout(this.settleTimer);
  },
  computed: {
    ...mapState(useWateringStore, ["recordsFor"]),
    records(): WateringRecord[] {
      return this.recordsFor(this.plantId);
    },
    lastWateredText(): string {
      const latest = latestWateringMillis(this.records);
      if (latest === null) return this.loading ? "" : this.t("plantdetail.never_watered");
      return relativeDaysText(
        Math.max(0, calendarDaysBetween(latest, Date.now())),
        localizationService.getLocale(),
      );
    },
    intervalText(): string {
      const average = averageIntervalDays(this.records);
      if (average === null) return this.loading ? "" : this.t("plantdetail.interval_unknown");
      const { unit, count } = describeInterval(average);
      return this.t(`watering.records.frequency.${unit}`, { count });
    },
  },
  methods: {
    ...mapActions(useWateringStore, {
      ensureRecords: "ensureRecords",
      createRecord: "addRecord",
      removeRecord: "deleteRecord",
    }),
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    async waterNow() {
      if (this.pending) return;
      this.pending = true;
      try {
        const record = await this.createRecord(this.plantId, {
          date: Date.now(),
          usedFertilizer: false,
          fertilizerTypeId: undefined,
        });
        this.playWateredMoment();
        ToastService.showToastWithAction(
          { key: "plantdetail.watered_toast", vars: { name: this.plantName } },
          this.t("plantdetail.undo"),
          () => void this.undo(record.id),
          6000,
        );
      } catch (error) {
        console.error("Water now failed:", error);
        ToastService.showToastWithAction(
          { key: "plantdetail.water_failed" },
          this.t("toast.retry"),
          () => void this.waterNow(),
          6000,
        );
      } finally {
        this.pending = false;
      }
    },
    playWateredMoment() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      clearTimeout(this.settleTimer);
      this.justWatered = false;
      void this.$nextTick(() => {
        this.justWatered = true;
        this.settleTimer = setTimeout(() => (this.justWatered = false), SETTLE_MS);
      });
    },
    async undo(recordId: number) {
      try {
        await this.removeRecord(this.plantId, recordId);
        ToastService.showSuccess({ key: "plantdetail.undone" });
      } catch (error) {
        console.error("Undo watering failed:", error);
      }
    },
  },
});
</script>

<style scoped>
.status {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--water-wash);
  color: var(--ion-text-color);
}

.status-heading {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-3);
  margin: 0;
}

.fact dt {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--ink-soft);
}

.fact dd {
  margin: 0;
  font-size: var(--text-md);
  min-height: 1.5em;
}

.fact-value {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 650;
  line-height: 1.2;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.water-now {
  flex: 1 1 200px;
  min-height: 52px;
  font-size: var(--text-md);
}

.with-details {
  flex: 0 1 auto;
}

.status.just-watered::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: rgba(var(--ion-color-tertiary-rgb), 0.28);
  transform-origin: bottom;
  animation: water-fill 650ms var(--ease-out) both;
}

.status.just-watered .fact-value {
  animation: value-settle 550ms var(--ease-out) both;
}

@keyframes water-fill {
  from {
    transform: scaleY(0);
    opacity: 1;
  }
  to {
    transform: scaleY(1);
    opacity: 0;
  }
}

@keyframes value-settle {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
</style>
