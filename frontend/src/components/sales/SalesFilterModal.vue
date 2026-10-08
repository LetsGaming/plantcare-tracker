<template>
  <ion-modal v-if="mounted" :is-open="isOpen" @didDismiss="onDidDismiss">
    <modal-header :header-title="t('sales.filter.title')" @close="$emit('close')" />

    <ion-content>
      <div class="filter-column">
        <section v-if="sellers.length > 1" class="filter-card">
          <h2 class="filter-heading">{{ t("sales.filter.shops") }}</h2>
          <ion-list lines="none">
            <ion-item v-for="seller in sellers" :key="seller">
              <ion-checkbox
                justify="space-between"
                :checked="draft.shops.includes(seller)"
                @ionChange="toggleShop(seller, $event.detail.checked)"
              >
                {{ seller }}
              </ion-checkbox>
            </ion-item>
          </ion-list>
        </section>

        <section class="filter-card">
          <ion-item lines="none">
            <ion-toggle
              justify="space-between"
              :checked="draft.onlyNew"
              @ionChange="draft.onlyNew = $event.detail.checked"
            >
              {{ t("sales.filter.only_new") }}
            </ion-toggle>
          </ion-item>
        </section>

        <section class="filter-card">
          <h2 class="filter-heading">{{ t("sales.filter.min_discount") }}</h2>
          <ion-segment
            :value="draft.minDiscount"
            @ionChange="draft.minDiscount = Number($event.detail.value)"
          >
            <ion-segment-button v-for="step in steps" :key="step" :value="step">
              <ion-label>{{ step === 0 ? t("sales.filter.any") : `${step} %` }}</ion-label>
            </ion-segment-button>
          </ion-segment>
        </section>

        <section class="filter-card">
          <h2 class="filter-heading">{{ t("sales.filter.price_range") }}</h2>
          <div class="price-row">
            <ion-input
              type="number"
              inputmode="decimal"
              min="0"
              :label="t('sales.filter.min_price')"
              label-placement="stacked"
              fill="outline"
              :value="priceText.min"
              @ionInput="priceText.min = String($event.detail.value ?? '')"
            />
            <ion-input
              type="number"
              inputmode="decimal"
              min="0"
              :label="t('sales.filter.max_price')"
              label-placement="stacked"
              fill="outline"
              :value="priceText.max"
              @ionInput="priceText.max = String($event.detail.value ?? '')"
            />
          </div>
          <p v-if="priceInvalid" class="price-error" role="alert">
            {{ t("sales.filter.price_invalid") }}
          </p>
        </section>
      </div>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <div class="footer-actions">
          <ion-button fill="outline" color="medium" @click="$emit('reset')">
            {{ t("sales.filter.reset") }}
          </ion-button>
          <ion-button :disabled="priceInvalid" @click="apply">
            {{ t("sales.filter.apply") }}
          </ion-button>
        </div>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
  IonModal,
  IonContent,
  IonList,
  IonItem,
  IonCheckbox,
  IonToggle,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonInput,
  IonButton,
  IonFooter,
  IonToolbar,
} from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import { useMountWhileOpen } from "@/components/modal/useMountWhileOpen";
import localizationService from "@/services/general/LocalizationService";
import { DISCOUNT_STEPS, type SalesQuery } from "@/utils/salesQuery";

const toText = (value: number | null): string => (value === null ? "" : String(value));

const toPrice = (text: string): number | null => {
  const parsed = Number(text.replace(",", "."));
  return text.trim() === "" || !Number.isFinite(parsed) || parsed < 0 ? null : parsed;
};

export default defineComponent({
  name: "SalesFilterModal",
  components: {
    IonModal,
    IonContent,
    IonList,
    IonItem,
    IonCheckbox,
    IonToggle,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonInput,
    IonButton,
    IonFooter,
    IonToolbar,
    ModalHeader,
  },
  props: {
    isOpen: { type: Boolean, required: true },
    query: { type: Object as PropType<SalesQuery>, required: true },
    sellers: { type: Array as PropType<string[]>, default: () => [] },
  },
  emits: ["close", "apply", "reset"],
  setup(props) {
    return useMountWhileOpen(() => props.isOpen);
  },
  data() {
    return {
      steps: DISCOUNT_STEPS,
      draft: { ...this.query, shops: [...this.query.shops] } as SalesQuery,
      priceText: { min: toText(this.query.minPrice), max: toText(this.query.maxPrice) },
    };
  },
  computed: {
    priceInvalid(): boolean {
      const min = toPrice(this.priceText.min);
      const max = toPrice(this.priceText.max);
      return min !== null && max !== null && min > max;
    },
  },
  watch: {
    isOpen(open: boolean) {
      if (!open) return;
      this.draft = { ...this.query, shops: [...this.query.shops] };
      this.priceText = { min: toText(this.query.minPrice), max: toText(this.query.maxPrice) };
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    toggleShop(seller: string, checked: boolean) {
      const rest = this.draft.shops.filter((shop) => shop !== seller);
      this.draft.shops = checked ? [...rest, seller] : rest;
    },
    apply() {
      if (this.priceInvalid) return;
      this.$emit("apply", {
        ...this.draft,
        minPrice: toPrice(this.priceText.min),
        maxPrice: toPrice(this.priceText.max),
      });
    },
    onDidDismiss() {
      this.release();
      this.$emit("close");
    },
  },
});
</script>

<style scoped>
.filter-column {
  display: grid;
  gap: var(--space-4);
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-4);
}

.filter-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}

.filter-heading {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-md);
}

.price-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.price-error {
  margin: 0;
  color: var(--ion-color-danger);
  font-size: var(--text-sm);
}

.footer-actions {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
}

.footer-actions ion-button {
  flex: 1;
  margin: 0;
}
</style>
