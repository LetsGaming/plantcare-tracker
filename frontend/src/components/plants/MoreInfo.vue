<template>
  <ion-card v-if="infos.length > 0" class="info-card sidenote">
    <ion-card-header>
      <ion-toolbar>
        <ion-title>Mehr Infos zur Pflanze</ion-title>
      </ion-toolbar>
    </ion-card-header>
    <ion-card-content>
      <div v-for="(info, index) in infos" :key="index" class="info-links">
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
                  style="width: 100%; font-size: 20px;"
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
  IonRow,
  IonLabel,
  IonItem,
  IonIcon,
  IonCardTitle,
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
    IonCardTitle,
    IonRow,
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
    };
  },
  setup() {
    return {
      openOutline,
    };
  },
  async mounted() {
    this.getLinks();
  },
  methods: {
    async getLinks() {
      this.infos = await MoreInfoService.getMoreInfo(this.plantName);
    },
    addClassesToHtml(content: string): string {
      // Create a temporary div element to parse the HTML content
      const div = document.createElement("div");
      div.innerHTML = content;

      // Add classes to specific elements
      // Example: Adding classes to <ul>, <li>, <h1>, <p>, etc.

      // Add class to all <ul> elements
      const ulElements = div.querySelectorAll("ul");
      ulElements.forEach((ul) => {
        ul.classList.add("info-list");
      });

      // Add class to all <li> elements
      const liElements = div.querySelectorAll("li");
      liElements.forEach((li) => {
        li.classList.add("info-item");
      });

      // Add class to all <p> elements
      const pElements = div.querySelectorAll("p");
      pElements.forEach((p) => {
        p.classList.add("info-text-paragraph");
      });

      // Add class to all <h1> elements
      const h1Elements = div.querySelectorAll("h1");
      h1Elements.forEach((h1) => {
        h1.classList.add("info-header");
      });

      // Add class to all <strong> elements
      const strongElements = div.querySelectorAll("strong");
      strongElements.forEach((strong) => {
        strong.classList.add("info-strong");
      });

      // Add class to all <em> elements
      const emElements = div.querySelectorAll("em");
      emElements.forEach((em) => {
        em.classList.add("info-em");
      });

      // Return the modified HTML content
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
.info-item {
  color: var(
    --ion-color-primary-tint
  ) !important; /* Ensures this is not overridden */
}

.info-item strong {
  color: inherit; /* Inherit color from the parent .info-item */
}

/* Strong element styling */
.info-strong {
  color: var(--ion-color-dark-tint);
}
</style>

<style scoped>
/* General card styling */
.info-card.sidenote {
  margin: 8px;
  box-shadow: none;
  background-color: var(--ion-card-background, #fff);
}

.card-title {
  font-size: 1.2em;
  font-weight: bold;
  color: var(--ion-text-color);
  margin: 0;
  padding-bottom: 8px;
}

/* Links and icon styling */
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
.component-wrapper {
  padding: 10px;
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
  .info-card.sidenote {
    background-color: var(--ion-card-background, #333);
    color: var(--ion-text-color);
  }

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
