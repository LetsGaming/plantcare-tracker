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
        <ion-accordion-group :multiple="true" :value="['links', 'ai']">
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
                <div v-html="addClassesToHtml(info.ai)" class="info-text" />
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
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
    async getLinks() {
      this.loading = true;
      this.notFound = false;
      this.infos = [];

      try {
        /**
         * UPDATED: Using getMoreInfo which matches SalesService logic.
         * The stream is handled internally by the service.
         */
        this.infos = await MoreInfoService.getMoreInfo(this.plantName, {
          forceUpdate: false,
          onUpdate: (updatedInfos: MoreInfo[]) => {
            // Update the UI in real-time as chunks arrive
            this.infos = updatedInfos;
            this.notFound = false;
          },
        });

        // If after the stream finishes we still have nothing
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
    addClassesToHtml(content: string): string {
      if (!content) return "";
      const div = document.createElement("div");
      div.innerHTML = content;

      div.querySelectorAll("ul").forEach((ul) => ul.classList.add("info-list"));
      div.querySelectorAll("li").forEach((li) => li.classList.add("info-item"));
      div
        .querySelectorAll("p")
        .forEach((p) => p.classList.add("info-text-paragraph"));
      div
        .querySelectorAll("h1, h2, h3, h4, h5, h6")
        .forEach((h) => h.classList.add("info-header"));
      div
        .querySelectorAll("strong")
        .forEach((s) => s.classList.add("info-strong"));
      div.querySelectorAll("em").forEach((em) => em.classList.add("info-em"));

      return div.innerHTML;
    },
  },
});
</script>
