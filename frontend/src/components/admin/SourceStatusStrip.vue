<template>
  <ul class="strip" :aria-label="t('admin3.strip_label')">
    <li
      v-for="chip in chips"
      :key="chip.status"
      class="chip"
      :class="[`tone-${chip.tone}`, { empty: chip.count === 0 }]"
    >
      <ion-icon :icon="chip.icon" aria-hidden="true" />
      {{ t(`admin3.chip.${chip.status}`, { count: chip.count }) }}
    </li>
  </ul>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonIcon } from "@ionic/vue";
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  helpCircleOutline,
  warningOutline,
} from "ionicons/icons";

import localizationService from "@/services/general/LocalizationService";
import { countByStatus, statusTone, type StatusTone } from "@/utils/sourceStatus";

interface Chip {
  status: SourceStatus;
  tone: StatusTone;
  count: number;
  icon: string;
}

const ICONS: Record<SourceStatus, string> = {
  failing: alertCircleOutline,
  degraded: warningOutline,
  ok: checkmarkCircleOutline,
  unknown: helpCircleOutline,
};

/** Three count chips (failing, degraded, working) plus one for unchecked sources when there are any. */
export default defineComponent({
  name: "SourceStatusStrip",
  components: { IonIcon },
  props: {
    sources: { type: Array as PropType<SourceHealth[]>, required: true },
  },
  computed: {
    chips(): Chip[] {
      const counts = countByStatus(this.sources);
      const order: SourceStatus[] = ["failing", "degraded", "ok"];
      if (counts.unknown > 0) order.push("unknown");
      return order.map((status) => ({
        status,
        tone: statusTone(status),
        count: counts[status],
        icon: ICONS[status],
      }));
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
  },
});
</script>

<style scoped>
.strip {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 32px;
  padding: 0 var(--space-3);
  border-radius: 999px;
  font-size: var(--text-sm);
  font-weight: 650;
}

.chip ion-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.tone-danger {
  background: var(--ion-color-danger);
  color: var(--ion-color-danger-contrast);
}

.tone-warning {
  background: var(--ion-color-warning);
  color: var(--ion-color-warning-contrast);
}

.tone-success {
  background: var(--ion-color-success);
  color: var(--ion-color-success-contrast);
}

.tone-neutral {
  background: var(--ion-color-medium);
  color: var(--ion-color-medium-contrast);
}

.chip.empty {
  background: var(--surface-raised);
  color: var(--ink-soft);
  box-shadow: inset 0 0 0 1px var(--line);
}
</style>
