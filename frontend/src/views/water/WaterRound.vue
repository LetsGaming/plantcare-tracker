<template>
  <ion-page>
    <overview-header :title="t('water.title')" :show-add-button="false" />

    <ion-content>
      <div class="round">
        <state-block
          v-if="isGuest"
          kind="empty"
          :title="t('water.title')"
          :message="t('state.guest_hint')"
          :action-label="t('water.guest_cta')"
          @action="signIn"
        />
        <state-block v-else-if="loading" kind="loading" :title="t('state.loading')" />
        <state-block
          v-else-if="loadError"
          kind="error"
          :title="t('state.error_title')"
          :message="t('water.load_error')"
          :action-label="t('state.retry')"
          @action="load"
        />
        <state-block
          v-else-if="!rows.length"
          kind="empty"
          :title="t('state.empty_plants_title')"
          :message="t('water.empty')"
          :action-label="t('water.empty_cta')"
          @action="$router.push('/tabs/plants')"
        />
        <template v-else>
          <div class="controls">
            <search-bar class="search-field" :placeholder="t('water.search')" @search="onSearch" />
          </div>

          <div v-if="fertilizerTypes.length" class="round-fertilizer">
            <span :id="segmentLabelId" class="label">{{ t("water.round_fertilizer") }}</span>
            <ion-segment
              :value="segmentValue"
              :aria-labelledby="segmentLabelId"
              scrollable
              @ionChange="onRoundFertilizer"
            >
              <ion-segment-button value="none">
                <ion-label>{{ t("water.fertilizer_none") }}</ion-label>
              </ion-segment-button>
              <ion-segment-button
                v-for="type in fertilizerTypes"
                :key="type.id"
                :value="String(type.id)"
                :data-kind="fertilizerKind(type.name)"
              >
                <ion-label>{{ fertilizerLabel(type.name) }}</ion-label>
              </ion-segment-button>
            </ion-segment>
          </div>

          <div v-if="lastRound" class="last-round" role="status">
            <span>{{ t("water.last_round", { count: lastRound.count }) }}</span>
            <ion-button class="last-round-undo" fill="clear" size="small" @click="undoLastRound">
              {{ t("plantdetail.undo") }}
            </ion-button>
          </div>

          <p v-if="!visibleRows.length" class="empty empty-search">
            {{ t("water.no_match") }}
          </p>
          <round-list
            v-else
            :rows="visibleRows"
            :fertilizer-types="fertilizerTypes"
            @toggle="toggle"
            @set-fertilizer="setFertilizer"
          />
        </template>
      </div>
    </ion-content>

    <ion-footer v-if="!isGuest && rows.length">
      <ion-toolbar>
        <div class="footer-actions">
          <p v-if="hiddenCheckedCount" class="hidden-ticked" role="status">
            {{ t("water.hidden_ticked", { hidden: hiddenCheckedCount }) }}
          </p>
          <div class="action-row">
            <snap-button
              v-if="showSnap"
              ref="snap"
              fill="outline"
              :disabled="sheet.open"
              @photo="onPhoto"
              @invalid="onInvalidPhoto"
            />
            <ion-button
              class="log-button"
              size="large"
              color="tertiary"
              :disabled="checkedCount === 0 || saving"
              @click="save"
            >
              <ion-spinner v-if="saving" name="crescent" slot="start" />
              <ion-icon v-else :icon="icons.water" slot="start" aria-hidden="true" />
              {{ saveLabel }}
            </ion-button>
          </div>
        </div>
      </ion-toolbar>
    </ion-footer>

    <snap-match-sheet
      :is-open="sheet.open"
      :state="sheet.state"
      :candidates="sheetCandidates"
      :confident="confident"
      :busy="snapBusy"
      :logged-name="logged?.name ?? ''"
      :logged-image-url="loggedImageUrl"
      :logged-plant-id="logged?.plantId ?? null"
      :selected-fertilizer-id="logged?.fertilizerTypeId ?? null"
      :fertilizer-types="fertilizerTypes"
      @close="closeSheet"
      @pick="onPick"
      @other="pickerOpen = true"
      @fertilize="onFertilize"
      @undo="onUndo"
    />
    <plant-picker-modal :is-open="pickerOpen" @close="pickerOpen = false" @pick="onPickerPick" />
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapActions, mapState } from "pinia";
import {
  IonButton,
  IonContent,
  IonFooter,
  IonIcon,
  IonLabel,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonToolbar,
} from "@ionic/vue";
import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import SearchBar from "@/components/SearchBar.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import RoundList from "@/components/water/RoundList.vue";
import SnapButton from "@/components/water/SnapButton.vue";
import SnapMatchSheet, { type SnapCandidate } from "@/components/water/SnapMatchSheet.vue";
import PlantPickerModal from "@/components/water/PlantPickerModal.vue";
import { nextFieldId } from "@/components/formcomponent/fieldShared";
import { icons } from "@/theme/icons";
import { fertilizerKind, fertilizerLabel } from "@/utils/enumLabels";
import { usePlantsStore } from "@/stores/plants";
import { useSessionStore } from "@/stores/session";
import { useWateringStore } from "@/stores/watering";
import { useSnapSettingsStore } from "@/stores/snapSettings";
import RecognitionService from "@/services/RecognitionService";
import ImageService from "@/services/ImageService";
import ToastService from "@/services/general/ToastService";
import { UNDO_TOAST_MS } from "@/utils/undo";
import localizationService from "@/services/general/LocalizationService";
import {
  buildBatchEntries,
  buildRoundRows,
  rerankCandidates,
  type RoundRow,
} from "@/utils/waterRound";

const LAST_ROUND_MS = 5 * 60 * 1000;

interface LastRound {
  ids: number[];
  plantIds: number[];
  count: number;
}

export default defineComponent({
  name: "WaterRound",
  components: {
    IonButton,
    IonContent,
    IonFooter,
    IonIcon,
    IonLabel,
    IonPage,
    IonSegment,
    IonSegmentButton,
    IonSpinner,
    IonToolbar,
    OverviewHeader,
    SearchBar,
    StateBlock,
    RoundList,
    SnapButton,
    SnapMatchSheet,
    PlantPickerModal,
  },
  setup() {
    return { icons };
  },
  data() {
    return {
      segmentLabelId: nextFieldId("round-fertilizer"),
      query: "",
      loading: true,
      loadError: false,
      saving: false,
      roundFertilizer: null as number | null,
      overrides: {} as Record<number, Partial<RoundRow>>,
      recognitionAvailable: false,
      sheet: { open: false, state: "matching" as "matching" | "candidates" | "logged" },
      pickerOpen: false,
      snapBusy: false,
      snapshotId: null as string | null,
      rawTopId: null as number | null,
      candidates: [] as RecognitionCandidate[],
      threshold: 1,
      logged: null as {
        plantId: number;
        name: string;
        recordId: number | null;
        imageId: number | null;
        fertilizerTypeId: number | null;
      } | null,
      matchToken: 0,
      lastRound: null as LastRound | null,
      lastRoundTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    };
  },
  computed: {
    ...mapState(usePlantsStore, ["personalPlants"]),
    ...mapState(useWateringStore, ["recordsFor", "fertilizerTypes"]),
    ...mapState(useSessionStore, ["isGuest"]),
    ...mapState(useSnapSettingsStore, ["keepPhoto"]),
    loggedImageUrl(): string {
      const plant = this.personalPlants.find((p) => p.id === this.logged?.plantId);
      return plant?.images?.[0]?.url ?? plant?.imageUrl ?? "";
    },
    showSnap(): boolean {
      return this.recognitionAvailable && !this.isGuest && this.rows.length > 0;
    },
    sheetCandidates(): SnapCandidate[] {
      return this.candidates.flatMap((candidate) => {
        const row = this.rows.find((r) => r.plantId === candidate.plantId);
        return row
          ? [{ plantId: row.plantId, name: row.name, imageUrl: row.imageUrl, tone: row.tone }]
          : [];
      });
    },
    confident(): boolean {
      // The rerank only orders the list; confidence needs the server's own best match shown first.
      const first = this.sheetCandidates[0];
      if (!first || first.plantId !== this.rawTopId) return false;
      const raw = this.candidates.find((candidate) => candidate.plantId === first.plantId);
      return !!raw && raw.score >= this.threshold;
    },
    rows(): RoundRow[] {
      return buildRoundRows(this.personalPlants, this.recordsFor).map((row) => ({
        ...row,
        ...this.overrides[row.plantId],
      }));
    },
    visibleRows(): RoundRow[] {
      const needle = this.query.trim().toLowerCase();
      return needle
        ? this.rows.filter((row) => row.name.toLowerCase().includes(needle))
        : this.rows;
    },
    hiddenCheckedCount(): number {
      const visible = new Set(this.visibleRows.map((row) => row.plantId));
      return this.rows.filter((row) => row.checked && !visible.has(row.plantId)).length;
    },
    checkedCount(): number {
      return this.rows.filter((row) => row.checked).length;
    },
    segmentValue(): string {
      return this.roundFertilizer === null ? "none" : String(this.roundFertilizer);
    },
    saveLabel(): string {
      return this.t("water.log_count", { count: this.checkedCount });
    },
  },
  async created() {
    void RecognitionService.status().then((available) => {
      this.recognitionAvailable = available;
    });
    await this.load();
  },
  beforeUnmount() {
    clearTimeout(this.lastRoundTimer);
  },
  methods: {
    fertilizerKind,
    fertilizerLabel,
    ...mapActions(usePlantsStore, ["ensureLoaded", "getPlant"]),
    ...mapActions(useSessionStore, { logUserOut: "logout" }),
    ...mapActions(useWateringStore, [
      "addBatch",
      "removeBatch",
      "ensureRecordsFor",
      "ensureRecords",
      "ensureFertilizerTypes",
      "editRecord",
      "deleteRecord",
    ]),
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    async load() {
      this.loading = true;
      this.loadError = false;
      try {
        await Promise.all([this.ensureLoaded(), this.ensureFertilizerTypes()]);
        await this.ensureRecordsFor(this.personalPlants.map((plant) => plant.id));
      } catch (error) {
        console.error("Failed to load the watering round:", error);
        this.loadError = true;
      } finally {
        this.loading = false;
      }
    },
    signIn() {
      return this.logUserOut();
    },
    onSearch(value: string) {
      this.query = value;
    },
    onRoundFertilizer(event: CustomEvent<{ value?: string | number }>) {
      const value = event.detail.value;
      this.roundFertilizer = value === undefined || value === "none" ? null : Number(value);
    },
    toggle(plantId: number) {
      const row = this.rows.find((candidate) => candidate.plantId === plantId);
      if (row) this.overrides[plantId] = { ...this.overrides[plantId], checked: !row.checked };
    },
    setFertilizer(plantId: number, fertilizerTypeId: number | null | undefined) {
      this.overrides[plantId] = { ...this.overrides[plantId], fertilizerTypeId };
    },
    async save() {
      if (this.saving || this.checkedCount === 0) return;
      const entries = buildBatchEntries(this.rows, this.roundFertilizer);
      const plantIds = entries.map((entry) => entry.plantId);
      this.saving = true;
      try {
        const ids = await this.addBatch(entries);
        for (const plantId of plantIds) delete this.overrides[plantId];
        this.rememberRound({ ids, plantIds, count: ids.length });
        ToastService.showToastWithAction(
          { key: "water.round_logged", vars: { count: ids.length } },
          this.t("plantdetail.undo"),
          () => void this.undoRound(ids, plantIds),
          UNDO_TOAST_MS,
        );
      } catch (error) {
        console.error("Logging the watering round failed:", error);
      } finally {
        this.saving = false;
      }
    },
    onInvalidPhoto(problem: "type" | "size") {
      ToastService.showError(
        this.t(problem === "type" ? "water.snap_bad_type" : "water.snap_too_large"),
      );
    },
    closeSheet() {
      if (this.snapBusy) return;
      this.matchToken += 1;
      this.sheet.open = false;
      this.snapshotId = null;
      this.rawTopId = null;
      this.focusSnapButton();
    },
    focusSnapButton() {
      void this.$nextTick(() => {
        (this.$refs.snap as { focusButton?: () => void } | undefined)?.focusButton?.();
      });
    },
    async onPhoto(file: File) {
      const token = ++this.matchToken;
      this.snapshotId = null;
      this.rawTopId = null;
      this.sheet = { open: true, state: "matching" };
      let match: MatchResult;
      try {
        match = await RecognitionService.match(file);
      } catch {
        if (token === this.matchToken) this.sheet.open = false;
        return;
      }
      if (token !== this.matchToken) return;
      const toneOf = (id: number) => this.rows.find((row) => row.plantId === id)?.tone;
      this.snapshotId = match.snapshotId;
      this.rawTopId = match.candidates[0]?.plantId ?? null;
      this.candidates = rerankCandidates(match.candidates, toneOf);
      this.threshold = match.threshold;
      this.sheet.state = "candidates";
    },
    onPickerPick(plantId: number) {
      this.pickerOpen = false;
      return this.onPick(plantId);
    },
    async onPick(plantId: number) {
      const snapshotId = this.snapshotId;
      if (!snapshotId || this.snapBusy) return;
      this.snapBusy = true;
      this.snapshotId = null;
      this.rawTopId = null;
      try {
        const result = await RecognitionService.confirm(snapshotId, {
          plantId,
          keepPhoto: this.keepPhoto,
        });
        const name = this.rows.find((row) => row.plantId === plantId)?.name ?? "";
        this.logged = { plantId, name, fertilizerTypeId: null, ...result };
        try {
          await Promise.all([
            this.ensureRecords(plantId, { force: true }),
            this.getPlant(plantId, true),
          ]);
        } catch (error) {
          console.error("Refreshing the plant after a snap failed:", error);
        }
        if (this.sheet.open) {
          this.sheet.state = "logged";
        } else {
          ToastService.showToastWithAction(
            { key: "water.snap_logged", vars: { name } },
            this.t("plantdetail.undo"),
            () => void this.onUndo(),
            UNDO_TOAST_MS,
          );
        }
      } catch {
        this.sheet.open = false;
      } finally {
        this.snapBusy = false;
      }
    },
    async onFertilize(typeId: number) {
      const logged = this.logged;
      if (!logged || logged.recordId === null || this.snapBusy) return;
      this.snapBusy = true;
      try {
        await this.editRecord(logged.plantId, logged.recordId, {
          usedFertilizer: true,
          fertilizerTypeId: typeId,
        });
        logged.fertilizerTypeId = typeId;
      } catch (error) {
        console.error("Adding fertilizer to the snapped watering failed:", error);
      } finally {
        this.snapBusy = false;
      }
    },
    async onUndo() {
      const logged = this.logged;
      if (!logged || this.snapBusy) return;
      this.snapBusy = true;
      try {
        if (logged.recordId !== null) {
          await this.deleteRecord(logged.plantId, logged.recordId);
          logged.recordId = null;
        }
        if (logged.imageId) {
          try {
            await ImageService.deleteImage(logged.imageId);
          } catch (error) {
            console.error("Removing the snapped photo failed:", error);
          }
        }
        try {
          await this.getPlant(logged.plantId, true);
        } catch (error) {
          console.error("Refreshing the plant after undo failed:", error);
        }
        this.logged = null;
        this.sheet.open = false;
        this.focusSnapButton();
      } catch (error) {
        console.error("Undoing the snapped watering failed:", error);
      } finally {
        this.snapBusy = false;
      }
    },
    rememberRound(round: LastRound) {
      clearTimeout(this.lastRoundTimer);
      this.lastRound = round;
      this.lastRoundTimer = setTimeout(() => {
        this.lastRound = null;
      }, LAST_ROUND_MS);
    },
    async undoLastRound() {
      const round = this.lastRound;
      if (!round) return;
      await this.undoRound(round.ids, round.plantIds);
    },
    async undoRound(ids: number[], plantIds: number[]) {
      try {
        await this.removeBatch(ids, plantIds);
        if (this.lastRound?.ids.join() === ids.join()) {
          clearTimeout(this.lastRoundTimer);
          this.lastRound = null;
        }
        ToastService.showSuccess({ key: "plantdetail.undone" });
      } catch (error) {
        console.error("Undoing the watering round failed:", error);
      }
    },
  },
});
</script>

<style scoped>
.round {
  display: flex;
  flex-direction: column;
  max-width: var(--content-max);
  margin: 0 auto;
  padding-bottom: var(--space-4);
}

.controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4) 0;
}

.search-field {
  flex: 1;
  padding: 0;
}

.round-fertilizer {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-4);
}

.label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--ink-soft);
}

.last-round {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin: var(--space-2) var(--space-4) 0;
  padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

.empty {
  padding: var(--space-4);
  text-align: center;
  color: var(--ink-soft);
}

.footer-actions {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-2) var(--space-4);
}

.hidden-ticked {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--ink-soft);
  text-align: center;
}

.action-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.action-row > .snap-button {
  flex: 0 1 auto;
}

.log-button {
  flex: 1 1 0;
  min-width: 0;
  min-height: var(--tap-min);
}

.footer-actions ion-button {
  margin: 0;
}
</style>
