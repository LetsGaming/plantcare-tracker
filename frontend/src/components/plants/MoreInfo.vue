<template>
  <ion-card class="info-card sidenote">
    <ion-card-header>
      <ion-toolbar>
        <ion-title>Mehr Infos zur Pflanze</ion-title>
      </ion-toolbar>
    </ion-card-header>
    <ion-card-content>
      <div v-if="loading" class="info-loading">
        <ion-label>Lade Informationen...</ion-label>
        <ion-spinner style="padding-left: 15px" />
      </div>
      <div v-else-if="notFound" class="info-not-found">
        <ion-label>Keine weiteren Informationen gefunden.</ion-label>
      </div>
      <div
        v-else
        v-for="(info, index) in infos"
        :key="index"
        class="info-links"
      >
        <ion-accordion-group>
          <ion-accordion v-if="info.links.length > 0">
            <ion-item slot="header" class="component-header">
              <ion-label>Links</ion-label>
            </ion-item>
            <div slot="content" class="component-wrapper">
              <template v-if="info.links.length > 0">
                <InfoNote
                  class="disclaimer"
                  note="Disclaimer: Links können fehlerhaft oder veraltet sein. Keine Gewähr für deren Richtigkeit."
                />
                <a
                  v-for="(link, index) in info.links"
                  :key="index"
                  :href="link"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="width: 100%; font-size: 20px"
                >
                  <ion-item class="info-link">
                    <ion-label>{{ link }}</ion-label>
                    <ion-icon :icon="openOutline" slot="end" />
                  </ion-item>
                </a>
              </template>
            </div>
          </ion-accordion>
          <ion-accordion v-if="info.ai">
            <ion-item slot="header" class="component-header">
              <ion-label>KI-Pflanzenpflege</ion-label>
            </ion-item>
            <div slot="content" class="component-wrapper">
              <template v-if="info.ai.length > 0">
                <InfoNote
                  class="disclaimer"
                  note="Disclaimer: AI-Modelle können fehlerhaft sein. Keine Gewähr für deren Richtigkeit."
                />
                <ion-item class="info-content">
                  <div v-html="addClassesToHtml(info.ai)" class="info-text" />
                </ion-item>
              </template>
            </div>
          </ion-accordion>
        </ion-accordion-group>
      </div>
    </ion-card-content>
  </ion-card>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonCard,
  IonCardHeader,
  IonCardContent,
  IonLabel,
  IonItem,
  IonIcon,
  IonAccordion,
  IonAccordionGroup,
  IonToolbar,
  IonTitle,
  IonSpinner,
} from "@ionic/vue";
import InfoNote from "@/components/InfoNote.vue";
import MoreInfoService from "@/services/MoreInfoService";
import { openOutline } from "ionicons/icons";

export default defineComponent({
  name: "MoreInfo",
  components: {
    IonCard,
    IonCardHeader,
    IonCardContent,
    IonLabel,
    IonItem,
    IonIcon,
    IonAccordion,
    IonAccordionGroup,
    IonToolbar,
    IonTitle,
    IonSpinner,
    InfoNote,
  },
  props: {
    plantName: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      infos: [] as MoreInfo[],
      loading: true,
      notFound: false,
    };
  },
  setup() {
    return {
      openOutline,
    };
  },
  async mounted() {
    await this.getLinks();
  },
  methods: {
    async getLinks() {
      this.loading = true;
      this.notFound = false; // reset at the start

      let timeoutReached = false;

      // Timeout to mark "not found" after 10s if no data
      const timeout = setTimeout(() => {
        timeoutReached = true;

        // If infos is empty or null, mark notFound
        if (!this.infos || this.infos.length === 0) {
          this.notFound = true;
          return;
        }

        // Check if any info actually contains links or AI data
        const hasData = this.infos.some(
          (info) => (info.links?.length || 0) > 0 || (info.ai?.length || 0) > 0
        );

        this.notFound = !hasData;
      }, 10000);

      try {
        const data = await MoreInfoService.getMoreInfo(this.plantName);

        // Ensure data is always an array
        this.infos = Array.isArray(data) ? data : [];

        // Immediately check if we actually got any data
        const hasData = this.infos.some(
          (info) => (info.links?.length || 0) > 0 || (info.ai?.length || 0) > 0
        );

        this.notFound = !hasData;
      } catch (error) {
        console.error("Error fetching more info:", error);
        this.infos = [];
        this.notFound = true; // mark notFound on error
      } finally {
        clearTimeout(timeout);
        this.loading = false;
      }
    },
    addClassesToHtml(content: string): string {
      const div = document.createElement("div");
      div.innerHTML = content;

      div.querySelectorAll("ul").forEach((ul) => ul.classList.add("info-list"));
      div.querySelectorAll("li").forEach((li) => li.classList.add("info-item"));
      div
        .querySelectorAll("p")
        .forEach((p) => p.classList.add("info-text-paragraph"));
      div
        .querySelectorAll("h1")
        .forEach((h1) => h1.classList.add("info-header"));
      div
        .querySelectorAll("strong")
        .forEach((strong) => strong.classList.add("info-strong"));
      div.querySelectorAll("em").forEach((em) => em.classList.add("info-em"));

      return div.innerHTML;
    },
  },
});
</script>

<style>
/* Header styling */
.info-header {
  color: var(--ion-color-primary);
}

.info-header strong {
  color: inherit; /* Ensure the strong element inherits the color from its parent */
}

/* Emphasized text styling */
.info-em {
  color: var(--ion-color-tertiary);
}

/* Item styling */
.info-item .info-strong {
  color: var(
    --ion-color-primary-tint
  ) !important; /* Ensures this is not overridden */
}

/* Strong element styling */
.info-strong {
  color: var(--ion-color-dark-tint);
}
</style>

<style scoped>
/* General card styling */
.disclaimer {
  padding-left: 15px;
}

.card-title {
  font-size: 1.2em;
  font-weight: bold;
  color: var(--ion-text-color);
  margin: 0;
  padding-bottom: 8px;
}

/* Links and icon styling */
.info-loading,
.info-not-found {
  text-align: center;
  font-size: 1.1rem;
  padding: 10px;
}

.info-links {
  margin-top: 8px;
}

.info-item {
  margin-bottom: 6px;
}

.info-link {
  display: flex;
  align-items: center;
  padding: 5px 8px;
  font-size: 0.85em;
  --color: var(--ion-text-color);
}

.info-link ion-icon {
  margin-left: 8px;
  font-size: 1.1em;
}

.component-header {
  font-weight: bold;
  font-size: 1.1rem;
}

.info-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.info-text {
  margin-bottom: 8px;
}
.info-list {
  padding-left: 16px;
  list-style-type: disc;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .card-title {
    color: var(--ion-text-color);
  }

  .info-link {
    --color: var(--ion-text-color);
  }

  .info-link ion-icon {
    color: var(--ion-text-color);
  }
}
</style>
