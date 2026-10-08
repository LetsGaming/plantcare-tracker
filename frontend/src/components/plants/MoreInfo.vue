<template>
  <section class="guide" :aria-labelledby="headingId" :aria-busy="status === 'loading'">
    <h2 :id="headingId" class="guide-title">{{ t("moreinfo2.guide_title") }}</h2>

    <p v-if="status === 'loading'" class="guide-status" role="status">
      <ion-spinner name="dots" aria-hidden="true" />
      {{ t("moreinfo2.writing") }}
    </p>

    <div v-else-if="status === 'error'" class="guide-error" role="alert">
      <p class="guide-error-title">{{ t("moreinfo2.error") }}</p>
      <p v-if="hasContent" class="guide-error-note">{{ t("moreinfo2.error_partial") }}</p>
      <ion-button size="small" fill="outline" @click="load(true)">
        {{ t("state.retry") }}
      </ion-button>
    </div>

    <p v-else-if="!hasContent" class="guide-empty">{{ t("moreinfo2.empty") }}</p>

    <template v-if="hasContent">
      <div v-if="ai" class="guide-body">
        <p class="note">
          <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
          <span>{{ t("moreinfo2.disclaimer_ai") }}</span>
        </p>
        <div v-html="formattedAi" class="guide-text" />
      </div>

      <div v-if="links.length > 0" class="guide-links">
        <h3 class="links-title">{{ t("moreinfo.links") }}</h3>
        <p class="note">
          <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
          <span>{{ t("moreinfo2.disclaimer_links") }}</span>
        </p>
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
import { useMoreInfoStore } from "@/stores/moreInfo";
import localizationService from "@/services/general/LocalizationService";

type GuideStatus = "loading" | "error" | "ready";

const CLASS_BY_SELECTOR = [
  { sel: "ul", cls: "info-list" },
  { sel: "li", cls: "info-item" },
  { sel: "p", cls: "info-text-paragraph" },
  { sel: "h1, h2, h3, h4, h5, h6", cls: "info-header" },
  { sel: "strong", cls: "info-strong" },
  { sel: "em", cls: "info-em" },
];

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
  },
  watch: {
    plantName() {
      void this.load();
    },
  },
  computed: {
    ...mapState(useMoreInfoStore, ["infoFor"]),
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
    formattedAi(): string {
      return this.formatStreamingHtml(this.ai);
    },
  },
  methods: {
    ...mapActions(useMoreInfoStore, ["ensureInfo"]),
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    async load(force = false) {
      const token = ++this.loadToken;
      this.status = "loading";
      try {
        await this.ensureInfo(this.plantName, { force });
        if (token === this.loadToken) this.status = "ready";
      } catch (error) {
        console.error("Failed to fetch more info:", error);
        if (token === this.loadToken) this.status = "error";
      }
    },
    /** Adds the style hooks the markdown renderer leaves out. */
    formatStreamingHtml(content: string): string {
      if (!content) return "";

      const doc = new DOMParser().parseFromString(content, "text/html");
      CLASS_BY_SELECTOR.forEach(({ sel, cls }) => {
        doc.querySelectorAll(sel).forEach((el) => el.classList.add(cls));
      });
      return doc.body.innerHTML;
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
  background: var(--clay-wash);
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
  color: var(--ion-color-primary);
}

.guide-text h1.info-header {
  font-size: var(--text-lg);
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
