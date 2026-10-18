<template>
  <FieldShell
    :label="translatedLabel"
    :required="field.required"
    :error="error"
    :hint="translatedHint"
    :message-id="messageId"
    :label-id="labelId"
    @label-click="openPicker"
  >
    <button
      type="button"
      class="picker-button"
      :class="{ 'is-empty': !displayName }"
      aria-haspopup="dialog"
      :aria-labelledby="`${labelId} ${valueId}`"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error || translatedHint ? messageId : undefined"
      @click="openPicker"
    >
      <span :id="valueId" class="picker-value break-words">
        {{ displayName || translatedPlaceholder }}
      </span>
      <IonIcon :icon="icons.chevronDown" aria-hidden="true" />
    </button>

    <IonModal
      v-if="mounted"
      :is-open="open"
      :aria-label="t('substrates.picker_title')"
      @didDismiss="onDismiss"
    >
      <ModalHeader :header-title="t('substrates.picker_title')" @close="closePicker" />
      <IonContent>
        <SearchBar :placeholder="t('substrates.picker_search')" @search="onSearch" />
        <ul class="options">
          <li>
            <button
              type="button"
              class="option none"
              :aria-pressed="modelValue === null"
              @click="choose(null)"
            >
              {{ t("plant.field.substrate_none") }}
            </button>
          </li>
        </ul>

        <section v-if="visibleMine.length" aria-labelledby="picker-mine">
          <h3 id="picker-mine" class="section-title">{{ t("segment.private") }}</h3>
          <ul class="options">
            <li v-for="substrate in visibleMine" :key="substrate.id">
              <button
                type="button"
                class="option break-words"
                :aria-pressed="substrate.id === modelValue"
                @click="choose(substrate.id)"
              >
                {{ substrate.name }}
              </button>
            </li>
          </ul>
        </section>

        <section v-if="visiblePublic.length" aria-labelledby="picker-public">
          <h3 id="picker-public" class="section-title">{{ t("segment.public") }}</h3>
          <ul class="options">
            <li v-for="substrate in visiblePublic" :key="substrate.id">
              <button
                type="button"
                class="option break-words"
                :aria-pressed="substrate.id === modelValue"
                @click="choose(substrate.id)"
              >
                {{ substrate.name }}
              </button>
            </li>
          </ul>
        </section>

        <p v-if="showNoResults" class="no-results" role="status">
          {{ t("state.no_results_title", { query: trimmedQuery }) }}
        </p>

        <IonInfiniteScroll :disabled="!canGrow" @ionInfinite="onInfinite">
          <IonInfiniteScrollContent :loading-text="t('list.loading_more')" />
        </IonInfiniteScroll>
      </IonContent>
    </IonModal>
  </FieldShell>
</template>

<script lang="ts">
import { defineComponent, ref, type PropType } from "vue";
import { mapActions, mapState } from "pinia";
import {
  IonContent,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonModal,
} from "@ionic/vue";
import FieldShell from "@/components/formcomponent/FieldShell.vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import SearchBar from "@/components/SearchBar.vue";
import { fieldErrorProp, nextFieldId } from "@/components/formcomponent/fieldShared";
import { useMountWhileOpen } from "@/components/modal/useMountWhileOpen";
import localizationService from "@/services/general/LocalizationService";
import { useSubstratesStore } from "@/stores/substrates";
import { compareText } from "@/utils/intlCache";
import { icons } from "@/theme/icons";

/** Rows mounted per list at first and added per infinite-scroll event. */
export const PICKER_WINDOW_STEP = 40;

interface InfiniteTarget {
  complete: () => unknown;
}

export default defineComponent({
  name: "SubstratePickerField",
  components: {
    FieldShell,
    IonContent,
    IonIcon,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonModal,
    ModalHeader,
    SearchBar,
  },
  emits: ["update:modelValue", "blur"],
  props: {
    field: {
      type: Object as () => SubstratePickerField,
      required: true,
    },
    modelValue: {
      type: Number as PropType<number | null>,
      default: null,
    },
    ...fieldErrorProp,
  },
  setup() {
    const open = ref(false);
    return { open, icons, ...useMountWhileOpen(() => open.value) };
  },
  data() {
    return {
      messageId: nextFieldId("field-msg"),
      labelId: nextFieldId("field-label"),
      valueId: nextFieldId("field-value"),
      query: "",
      mineWindow: PICKER_WINDOW_STEP,
      publicWindow: PICKER_WINDOW_STEP,
      restoredPublicQuery: "",
    };
  },
  computed: {
    ...mapState(useSubstratesStore, ["mine", "public", "byId"]),
    translatedLabel(): string {
      return this.t(this.field.label);
    },
    translatedPlaceholder(): string {
      return this.field.placeholder ? this.t(this.field.placeholder) : "";
    },
    translatedHint(): string {
      return this.field.hint ? this.t(this.field.hint) : "";
    },
    trimmedQuery(): string {
      return this.query.trim();
    },
    displayName(): string {
      if (this.modelValue === null) return "";
      return this.byId(this.modelValue)?.name ?? this.field.selectedName ?? "";
    },
    sortedMine(): SubstrateView[] {
      const compare = compareText(localizationService.getLocale());
      return [...this.mine.items].sort((a, b) => compare(a.name, b.name));
    },
    filteredMine(): SubstrateView[] {
      const needle = this.trimmedQuery.toLowerCase();
      if (!needle) return this.sortedMine;
      return this.sortedMine.filter((s) => (s.searchText ?? s.name.toLowerCase()).includes(needle));
    },
    publicOnly(): SubstrateView[] {
      const own = new Set(this.mine.items.map((s) => s.id));
      return this.public.items.filter((s) => !own.has(s.id));
    },
    visibleMine(): SubstrateView[] {
      return this.filteredMine.slice(0, this.mineWindow);
    },
    visiblePublic(): SubstrateView[] {
      return this.publicOnly.slice(0, this.publicWindow);
    },
    canGrow(): boolean {
      return (
        this.mineWindow < this.filteredMine.length ||
        this.publicWindow < this.publicOnly.length ||
        this.public.nextCursor !== null
      );
    },
    showNoResults(): boolean {
      return (
        this.trimmedQuery !== "" &&
        this.filteredMine.length === 0 &&
        this.publicOnly.length === 0 &&
        this.public.status !== "loading"
      );
    },
  },
  mounted() {
    // A selected substrate that neither list nor the plant can name is fetched by id.
    if (this.modelValue !== null && !this.displayName) {
      void this.getSubstrate(this.modelValue).catch(() => undefined);
    }
  },
  methods: {
    ...mapActions(useSubstratesStore, [
      "ensureMine",
      "ensurePublic",
      "setPublicQuery",
      "loadMorePublic",
      "getSubstrate",
    ]),
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    async openPicker() {
      this.query = "";
      this.mineWindow = PICKER_WINDOW_STEP;
      this.publicWindow = PICKER_WINDOW_STEP;
      this.restoredPublicQuery = this.public.query.q ?? "";
      this.open = true;
      await Promise.allSettled([this.ensureMine(), this.ensurePublic()]);
      if (this.public.query.q) await this.setPublicQuery("");
    },
    closePicker() {
      this.open = false;
    },
    onDismiss() {
      this.open = false;
      this.release();
      if ((this.public.query.q ?? "") !== this.restoredPublicQuery) {
        void this.setPublicQuery(this.restoredPublicQuery);
      }
      this.$emit("blur");
    },
    onSearch(value: string) {
      if (value === this.query) return;
      this.query = value;
      this.mineWindow = PICKER_WINDOW_STEP;
      this.publicWindow = PICKER_WINDOW_STEP;
      void this.setPublicQuery(value.trim());
    },
    choose(id: number | null) {
      this.$emit("update:modelValue", id);
      this.closePicker();
    },
    async onInfinite(event: CustomEvent) {
      const target = event.target as unknown as InfiniteTarget;
      try {
        if (this.mineWindow < this.filteredMine.length) {
          this.mineWindow += PICKER_WINDOW_STEP;
        } else if (this.publicWindow < this.publicOnly.length) {
          this.publicWindow += PICKER_WINDOW_STEP;
        } else if (this.public.nextCursor !== null && !this.public.loadingMore) {
          await this.loadMorePublic();
        }
      } catch (error) {
        console.error("Failed to load more public substrates", error);
      } finally {
        target.complete();
      }
    },
  },
});
</script>

<style scoped>
.picker-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  box-sizing: border-box;
  width: 100%;
  min-height: calc(var(--tap-min) - 3px);
  padding: 0 var(--space-3);
  border: 0;
  background: transparent;
  color: var(--ion-text-color);
  font: inherit;
  font-size: var(--text-md);
  text-align: start;
  cursor: pointer;
}

.picker-button.is-empty {
  color: var(--ink-soft);
}

.options {
  margin: 0;
  padding: 0;
  list-style: none;
}

.section-title {
  margin: var(--space-4) var(--space-4) var(--space-2);
  color: var(--ink-soft);
  font-size: var(--text-sm);
  font-weight: 600;
}

.option {
  display: block;
  width: 100%;
  min-height: var(--tap-min);
  padding: var(--space-2) var(--space-4);
  border: 0;
  border-bottom: 1px solid var(--ion-border-color);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.option[aria-pressed="true"] {
  background: var(--surface-sunken);
  font-weight: 600;
}

.none {
  color: var(--ink-soft);
}

.no-results {
  margin: var(--space-4);
  color: var(--ink-soft);
}
</style>
