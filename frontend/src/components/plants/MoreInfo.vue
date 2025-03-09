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
                  style="width: 100%"
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
                  <ion-label>
                    <div v-html="formatText(info.ai)" class="info-text"></div>
                  </ion-label>
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
    formatText(text: string) {
      return (
        text
          // Bold (**text**) -> <strong> with Ionic primary color
          .replace(
            /\*\*(.*?)\*\*/g,
            "<strong style='color: var(--ion-color-primary);'>$1</strong>"
          )

          // Italic (*text* or _text_) -> <em> with Ionic secondary color
          .replace(
            /(\*|_)(.*?)\1/g,
            "<em style='color: var(--ion-color-secondary);'>$2</em>"
          )

          // Inline code (`code`) -> <code> with Ionic tertiary color and styling
          .replace(
            /`(.*?)`/g,
            "<code style='background: var(--ion-color-tertiary); padding: 2px 4px; border-radius: 4px; font-family: monospace;'>$1</code>"
          )

          // Headings (### Heading) -> <h3> with Ionic styling
          .replace(
            /### (.*?)(\n|$)/g,
            "<h3 style='color: var(--ion-color-primary); font-size: 1.2em;'>$1</h3>"
          )
          .replace(
            /## (.*?)(\n|$)/g,
            "<h2 style='color: var(--ion-color-primary); font-size: 1.5em;'>$1</h2>"
          )
          .replace(
            /# (.*?)(\n|$)/g,
            "<h1 style='color: var(--ion-color-primary); font-size: 1.8em;'>$1</h1>"
          )

          // Unordered lists (- item) -> <ul><li>item</li></ul> with Ionic styling
          .replace(
            /\n- (.*?)/g,
            "<li style='color: var(--ion-color-medium); margin-left: 20px;'>$1</li>"
          )
          .replace(/(<li>.*<\/li>)/g, "<ul style='padding-left: 15px;'>$1</ul>") // Wraps <li> in <ul>

          // New lines -> <br>
          .replace(/\n\n/g, "<br><br>")
          .replace(/\n/g, "<br>")
      );
    },
  },
});
</script>

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
