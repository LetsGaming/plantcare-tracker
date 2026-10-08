<template>
  <ion-header>
    <ion-toolbar class="header-toolbar">
      <ion-buttons slot="start">
        <ion-menu-button :aria-label="t('a11y.menu')" />
      </ion-buttons>
      <ion-title>{{ translateTitle(title) }}</ion-title>
      <ion-buttons slot="end">
        <icon-button
          v-if="showToolbarAdd"
          :icon="addIcon ?? ''"
          :label="t('a11y.add')"
          @press="onAddClick"
        />
        <icon-button :icon="icons.logout" :label="t('a11y.logout')" @press="confirmLogout" />
      </ion-buttons>
    </ion-toolbar>

    <ion-toolbar v-if="showSegments" class="segment-toolbar">
      <div class="segment-row">
        <ion-segment v-model="segmentValue" class="segment" @ionChange="handleSegmentChange">
          <ion-segment-button
            v-for="segment in visibleSegments"
            :key="segment.value"
            :value="segment.value"
          >
            <ion-icon :icon="segment.icon" aria-hidden="true" />
            <ion-label>{{ translateSegmentLabel(segment.label) }}</ion-label>
          </ion-segment-button>
        </ion-segment>

        <icon-button
          v-if="canAdd"
          :icon="addIcon ?? ''"
          :label="t('a11y.add')"
          fill="solid"
          color="primary"
          class="add-button"
          @press="onAddClick"
        />
      </div>
    </ion-toolbar>
  </ion-header>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonIcon,
  IonButtons,
  IonMenuButton,
} from "@ionic/vue";
import { icons } from "@/theme/icons";
import { mapActions, mapState } from "pinia";
import { useSessionStore } from "@/stores/session";
import localizationService from "@/services/general/LocalizationService";
import IconButton from "@/components/ui/IconButton.vue";
import { confirmLogout } from "@/utils/confirmLogout";

export default defineComponent({
  name: "OverviewHeader",
  components: {
    IonHeader,
    IonToolbar,
    IonTitle,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonIcon,
    IonButtons,
    IonMenuButton,
    IconButton,
  },
  props: {
    title: {
      type: String,
      required: true,
    },
    segments: {
      type: Array as PropType<
        Array<{
          value: string;
          label: string;
          icon: string;
          hideFromGuests?: boolean;
        }>
      >,
      default: () => [],
    },
    showAddButton: {
      type: Boolean,
      default: true,
    },
    addIcon: {
      type: String,
      required: false,
    },
    startingSegment: {
      type: String,
      default: "",
    },
    onSegmentChange: {
      type: Function as PropType<(value: string) => void>,
      required: false,
    },
    onAddClick: {
      type: Function as PropType<() => void>,
      required: false,
    },
  },
  data() {
    return {
      segmentValue: this.startingSegment,
    };
  },
  computed: {
    ...mapState(useSessionStore, ["isGuest"]),
    visibleSegments(): Array<{ value: string; label: string; icon: string }> {
      return this.segments.filter((segment) => !segment.hideFromGuests || !this.isGuest);
    },
    showSegments(): boolean {
      return this.visibleSegments.length > 1;
    },
    canAdd(): boolean {
      return !this.isGuest && this.showAddButton && !!this.onAddClick && !!this.addIcon;
    },
    showToolbarAdd(): boolean {
      return this.canAdd && !this.showSegments;
    },
  },
  setup() {
    return { icons };
  },
  mounted() {
    if (this.isGuest) {
      // A guest cannot see hidden segments, so the first visible one is selected.
      const visibleSegments = this.segments.filter((segment) => !segment.hideFromGuests);
      if (visibleSegments.length > 0) {
        this.segmentValue = visibleSegments[0].value;
        this.handleSegmentChange({
          detail: { value: this.segmentValue },
        });
      }
    }
  },
  methods: {
    ...mapActions(useSessionStore, { logUserOut: "logout" }),
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback || key);
    },
    confirmLogout() {
      return confirmLogout(() => this.logUserOut());
    },
    handleSegmentChange(event: any) {
      this.onSegmentChange?.(event.detail.value);
    },
    translateTitle(value: string) {
      return localizationService.t(value, undefined, value);
    },
    translateSegmentLabel(value: string) {
      return localizationService.t(value, undefined, value);
    },
  },
});
</script>

<style scoped>
.header-toolbar {
  --background: var(--ion-color-primary);
  --color: var(--ion-color-primary-contrast);
  --border-width: 0;
}

.header-toolbar ion-title {
  color: var(--ion-color-primary-contrast);
}

.header-toolbar ion-menu-button,
.header-toolbar .icon-button {
  --color: var(--ion-color-primary-contrast);
  color: var(--ion-color-primary-contrast);
}

.segment-toolbar {
  --background: var(--ion-background-color);
  --border-width: 0;
  position: sticky;
  top: 0;
  z-index: 10;
}

.segment-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  max-width: 1200px;
  margin: 0 auto;
}

.segment {
  flex: 1;
}

.add-button {
  flex-shrink: 0;
}
</style>
