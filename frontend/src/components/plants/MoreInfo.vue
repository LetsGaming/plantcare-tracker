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
          <ion-accordion>
            <ion-item slot="header" class="component-header">
              <ion-label>Links</ion-label>
            </ion-item>
            <div slot="content" class="component-wrapper">
              <a
                v-for="(link, index) in info.links"
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
