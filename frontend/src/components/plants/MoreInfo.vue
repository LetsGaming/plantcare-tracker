<template>
  <ion-card class="info-card sidenote">
    <ion-card-header>
      <ion-toolbar>
        <ion-title>{{ t("moreinfo.title") }}</ion-title>
      </ion-toolbar>
    </ion-card-header>
    <ion-card-content>
      <div v-if="loading && infos.length === 0" class="info-loading">
        <ion-label>{{ t("moreinfo.loading") }}</ion-label>
        <ion-spinner style="padding-left: 15px" />
      </div>

      <div v-else-if="notFound" class="info-not-found">
        <ion-label>{{ t("moreinfo.no_info") }}</ion-label>
      </div>

      <div
        v-else
        v-for="(info, index) in infos"
        :key="index"
        class="info-links"
      >
        <ion-accordion-group :multiple="true">
          <ion-accordion value="links" v-if="info.links.length > 0">
            <ion-item slot="header" class="component-header">
              <ion-label>{{ t("moreinfo.links") }}</ion-label>
            </ion-item>
            <div slot="content" class="component-wrapper">
              <InfoNote
                class="disclaimer"
                :note="t('moreinfo.disclaimer_links')"
              />
              <a
                v-for="(link, lIndex) in info.links"
                :key="lIndex"
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
            </div>
          </ion-accordion>

          <ion-accordion value="ai" v-if="info.ai">
            <ion-item slot="header" class="component-header">
              <ion-label>{{ t("moreinfo.ai_title") }}</ion-label>
              <ion-spinner
                v-if="loading"
                name="dots"
                slot="end"
                style="width: 20px"
              />
            </ion-item>
            <div slot="content" class="component-wrapper">
              <InfoNote
                class="disclaimer"
                :note="t('moreinfo.disclaimer_ai')"
              />
              <ion-item class="info-content">
                <div v-html="formatStreamingHtml(info.ai)" class="info-text" />
              </ion-item>
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
import localizationService from "@/services/general/LocalizationService";

/**
 * Authors: { name: "LetsGamingDE", id: 272402865874534400n}
 */

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
      infos: [] as any[],
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
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
    async getLinks() {
      this.loading = true;
      this.notFound = false;
      this.infos = [];

      try {
        this.infos = await MoreInfoService.getMoreInfo(this.plantName, {
          forceUpdate: false,
          onUpdate: (updatedInfos: any[]) => {
            // Update the data silently in the background
            this.infos = updatedInfos;
            this.notFound = false;
          },
        });

        if (this.infos.length === 0) {
          this.notFound = true;
        }
      } catch (error: any) {
        console.error("Failed to fetch more info:", error);
        this.notFound = true;
      } finally {
        this.loading = false;
      }
    },
    /**
     * Fixes formatting by ensuring all parsed elements receive the correct classes.
     * Updated to handle the nested structure of the new service parser.
     */
    formatStreamingHtml(content: string): string {
      if (!content) return "";

      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/html");

      const mapping = [
        { sel: "ul", cls: "info-list" },
        { sel: "li", cls: "info-item" },
        { sel: "p", cls: "info-text-paragraph" },
        { sel: "h1, h2, h3, h4, h5, h6", cls: "info-header" },
        { sel: "strong", cls: "info-strong" },
        { sel: "em", cls: "info-em" },
      ];

      mapping.forEach(({ sel, cls }) => {
        // Look through the whole document for these tags
        doc.querySelectorAll(sel).forEach((el) => {
          el.classList.add(cls);
        });
      });

      return doc.body.innerHTML;
    },
  },
});
</script>

<style scoped>
.info-text {
  width: 100%;
  /* Fix for ionic items padding issues with v-html content */
  --inner-padding-end: 0;
  --padding-start: 0;
}

.info-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
</style>

<style>
/**
 * Authors: { name: "LetsGamingDE", id: 272402865874534400n}
 */

/* Header styling */
.info-header {
  color: var(--ion-color-primary);
  margin-top: 1.2rem;
  margin-bottom: 0.5rem;
}

h1.info-header {
  font-size: 1.5em;
  font-weight: bold;
}

/* Ensure strong elements inside headers don't change color */
.info-header strong,
.info-header .info-strong {
  color: inherit !important;
}

/* Emphasized text styling (Italics) */
.info-em {
  color: var(--ion-color-tertiary);
  font-style: italic;
}

/* Strong element styling (General/Values) */
.info-strong {
  color: var(--ion-color-dark-tint);
}

/* Item styling - First strong element (The Label) */
.info-item .info-strong:first-of-type {
  color: var(--ion-color-primary-tint) !important;
  font-weight: 700;
}

/* Paragraph styling */
.info-text-paragraph {
  margin-left: 15px !important;
  padding: 0;
  font-size: 0.9em !important;
  line-height: 1.5;
  margin-bottom: 10px;
}

/* List container adjustments to align with the paragraph margin */
.info-list {
  margin-left: 15px !important;
  padding-left: 1rem;
  list-style-type: disc;
}

.info-item {
  margin-bottom: 6px;
  font-size: 0.9em;
}

</style>
