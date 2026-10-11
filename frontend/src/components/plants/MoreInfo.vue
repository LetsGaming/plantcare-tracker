<template>
  <section class="guide" :aria-labelledby="headingId">
    <h2 :id="headingId" class="guide-title">{{ t("moreinfo2.guide_title") }}</h2>

    <div class="guide-status-row" :class="{ 'is-idle': !statusText }">
      <p class="guide-status" role="status">
        <ion-spinner v-if="status === 'loading'" name="dots" aria-hidden="true" />
        {{ statusText }}
      </p>
      <ion-button v-if="status === 'loading'" size="small" fill="outline" @click="stop">
        {{ t("moreinfo2.stop") }}
      </ion-button>
      <ion-button v-else-if="status === 'stopped'" size="small" fill="outline" @click="load(true)">
        {{ t("state.retry") }}
      </ion-button>
    </div>

    <div v-if="status === 'error'" class="guide-error" role="alert">
      <p class="guide-error-title">{{ t("moreinfo2.error") }}</p>
      <p v-if="hasContent" class="guide-error-note">{{ t("moreinfo2.error_partial") }}</p>
      <ion-button size="small" fill="outline" @click="load(true)">
        {{ t("state.retry") }}
      </ion-button>
    </div>

    <p v-else-if="status === 'ready' && !hasContent" class="guide-empty">
      {{ t("moreinfo2.empty") }}
    </p>

    <template v-if="hasContent">
      <p class="note">
        <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
        <span>{{ noteText }}</span>
      </p>

      <div v-if="ai" class="guide-body">
        <div v-html="ai" class="guide-text" :aria-busy="status === 'loading'" />
      </div>

      <div v-if="links.length > 0" class="guide-links">
        <h3 class="links-title">{{ t("moreinfo.links") }}</h3>
        <ul class="link-list">
          <li v-for="link in links" :key="link">
            <a
              class="link"
              :href="link"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="t('moreinfo2.open_link', { link })"
            >
              <span class="link-text break-words">{{ link }}</span>
              <ion-icon :icon="openOutline" aria-hidden="true" />
            </a>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonButton, IonIcon, IonSpinner } from "@ionic/vue";
import { informationCircleOutline, openOutline } from "ionicons/icons";
import { mapActions, mapState } from "pinia";
import { moreInfoKey, useMoreInfoStore } from "@/stores/moreInfo";
import localizationService from "@/services/general/LocalizationService";

type GuideStatus = "loading" | "error" | "ready" | "stopped";

const DONE_NOTICE_MS = 4000;

let guideCount = 0;

export default defineComponent({
  name: "MoreInfo",
  components: {
    IonButton,
    IonIcon,
    IonSpinner,
  },
  props: {
    plantName: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      status: "loading" as GuideStatus,
      loadToken: 0,
      stopped: false,
      streamed: false,
      doneNotice: false,
      doneTimer: null as number | null,
      headingId: `care-guide-${++guideCount}`,
    };
  },
  setup() {
    return { informationCircleOutline, openOutline };
  },
  async mounted() {
    await this.load();
  },
  beforeUnmount() {
    this.loadToken++;
    this.clearDoneNotice();
  },
  watch: {
    isStreaming(active: boolean) {
      if (active) this.streamed = true;
    },
    plantName() {
      void this.load();
    },
  },
  computed: {
    ...mapState(useMoreInfoStore, ["infoFor", "streaming"]),
    isStreaming(): boolean {
      return !!this.streaming[moreInfoKey(this.plantName, localizationService.getLocale())];
    },
    /** The guide for this plant; the store updates it while the stream runs. */
    infos(): MoreInfo[] {
      return this.infoFor(this.plantName);
    },
    ai(): string {
      return this.infos
        .map((info) => info.ai)
        .filter(Boolean)
        .join("");
    },
    links(): string[] {
      return [...new Set(this.infos.flatMap((info) => info.links))];
    },
    hasContent(): boolean {
      return this.ai.length > 0 || this.links.length > 0;
    },
    statusText(): string {
      if (this.status === "loading") return this.t("moreinfo2.writing");
      if (this.status === "stopped") return this.t("moreinfo2.stopped");
      return this.doneNotice ? this.t("moreinfo2.done") : "";
    },
    noteText(): string {
      const parts: string[] = [];
      if (this.ai) parts.push(this.t("moreinfo2.disclaimer_ai"));
      if (this.links.length > 0) parts.push(this.t("moreinfo2.disclaimer_links"));
      return parts.join(" ");
    },
  },
  methods: {
    ...mapActions(useMoreInfoStore, ["ensureInfo", "stopInfo"]),
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    async load(force = false) {
      const token = ++this.loadToken;
      this.clearDoneNotice();
      this.stopped = false;
      this.streamed = this.isStreaming;
      this.status = "loading";
      try {
        await this.ensureInfo(this.plantName, { force });
        if (token !== this.loadToken) return;
        if (this.stopped) {
          this.status = "stopped";
          return;
        }
        this.status = "ready";
        if (this.streamed) this.showDoneNotice();
      } catch (error) {
        console.error("Failed to fetch more info:", error);
        if (token === this.loadToken) this.status = "error";
      }
    },
    stop() {
      this.stopped = true;
      this.stopInfo(this.plantName);
    },
    showDoneNotice() {
      this.doneNotice = true;
      this.doneTimer = window.setTimeout(() => this.clearDoneNotice(), DONE_NOTICE_MS);
    },
    clearDoneNotice() {
      if (this.doneTimer !== null) window.clearTimeout(this.doneTimer);
      this.doneTimer = null;
      this.doneNotice = false;
    },
  },
});
</script>

<style scoped>
.guide {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  box-shadow: var(--shadow-card);
}

.guide-title {
  font-size: var(--text-lg);
}

.guide-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.guide-status-row.is-idle {
  display: contents;
}

.guide-status-row.is-idle .guide-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.guide-status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--ink-soft);
}

.guide-status ion-spinner {
  width: 24px;
  height: 24px;
  color: var(--ion-color-primary);
}

.guide-error {
  display: grid;
  justify-items: start;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--danger-wash);
  color: var(--ion-text-color);
}

.guide-error p {
  margin: 0;
}

.guide-error-title {
  font-weight: 650;
}

.guide-error-note,
.guide-empty {
  font-size: var(--text-sm);
  color: var(--ink-soft);
}

.guide-empty {
  margin: 0;
}

.guide-body,
.guide-links {
  display: grid;
  gap: var(--space-3);
}

.links-title {
  font-size: var(--text-md);
}

.note {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  color: var(--ink-soft);
  font-size: var(--text-xs);
}

.note ion-icon {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 1px;
}

.link-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: var(--tap-min);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ion-color-primary);
  font-size: var(--text-sm);
  text-decoration: none;
}

.link:hover {
  background: var(--surface-sunken);
}

.link ion-icon {
  flex: none;
}

.guide-text {
  max-width: 68ch;
  font-size: var(--text-sm);
}
</style>

<style>
.guide-text .info-header {
  margin: var(--space-4) 0 var(--space-2);
  font-size: var(--text-md);
  font-family: var(--font-display);
  color: var(--ion-text-color);
}

.guide-text .info-text-paragraph {
  margin: 0 0 var(--space-2);
  line-height: 1.55;
}

.guide-text .info-list {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-5);
  list-style: disc;
}

.guide-text .info-item {
  margin-bottom: var(--space-1);
}

.guide-text .info-strong {
  color: var(--ion-text-color);
}

.guide-text .info-em {
  font-style: italic;
}
</style>
