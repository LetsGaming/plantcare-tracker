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
          <ion-accordion v-if="info.links">
            <ion-item slot="header" class="component-header">
              <ion-label>Links</ion-label>
            </ion-item>
            <div slot="content" class="component-wrapper">
              <template v-if="info.links.length > 0">
                <InfoNote
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
      setTimeout(() => {
        if (this.infos.length === 0) {
          this.notFound = true;
          this.loading = false;
        }
      }, 3000); // Set timeout for notFound message

      this.infos = await MoreInfoService.getMoreInfo(this.plantName);
      this.loading = false;
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

<style scoped>
.info-loading,
.info-not-found {
  text-align: center;
  font-size: 1.1rem;
  padding: 10px;
  color: var(--ion-text-color);
}
</style>
