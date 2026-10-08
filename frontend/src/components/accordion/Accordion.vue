<template>
  <li class="accordion-item">
    <div class="accordion-row">
      <button
        type="button"
        class="accordion-toggle ion-activatable ion-focusable"
        :aria-expanded="isOpen"
        :aria-controls="panelId"
        @click="toggle"
      >
        <ion-ripple-effect mode="md" />
        <span class="accordion-title">{{ item.name }}</span>
        <ion-icon
          :icon="chevronDown"
          class="toggle-icon"
          :class="{ open: isOpen }"
          aria-hidden="true"
        />
      </button>
      <icon-button
        v-if="!isGuest && showEditButton"
        :icon="create"
        :label="t('a11y.edit', 'Edit')"
        @press="onEditClick"
      />
    </div>

    <div :id="panelId" class="accordion-content-wrapper" :class="{ open: isOpen }" :inert="!isOpen">
      <div class="accordion-content">
        <template v-if="item.details && Object.keys(item.details).length > 0">
          <p v-for="(value, key) in item.details" :key="key">
            <strong>{{ key }}:</strong> {{ value }}
          </p>
        </template>

        <template v-if="item.components && item.components.length > 0">
          <div class="components-container">
            <component v-for="(component, index) in item.components" :key="index" :is="component" />
          </div>
        </template>

        <p v-else>
          {{ t("accordion.no_details", "No details available.") }}
        </p>
      </div>
    </div>
  </li>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";
import { IonIcon, IonRippleEffect } from "@ionic/vue";
import { create, chevronDown } from "ionicons/icons";
import IconButton from "@/components/ui/IconButton.vue";
import { mapState } from "pinia";
import { useSessionStore } from "@/stores/session";
import localizationService from "@/services/general/LocalizationService";

let accordionCount = 0;

export default defineComponent({
  name: "Accordion",
  components: {
    IonIcon,
    IonRippleEffect,
    IconButton,
  },
  emits: ["edit-click"],
  props: {
    item: {
      type: Object as () => AccordionItem,
      required: true,
    },
    showEditButton: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    const isOpen = ref(false);
    const panelId = `accordion-panel-${++accordionCount}`;

    function toggle() {
      isOpen.value = !isOpen.value;
    }

    return {
      isOpen,
      panelId,
      toggle,
      create,
      chevronDown,
    };
  },
  computed: {
    ...mapState(useSessionStore, ["isGuest"]),
  },
  methods: {
    t(key: string, defaultValue: string): string {
      return localizationService.t(key, undefined, defaultValue);
    },
    onEditClick() {
      this.$emit("edit-click", this.item);
    },
  },
});
</script>

<style scoped>
.accordion-item {
  width: 100%;
  list-style: none;
  border-bottom: 1px solid var(--line);
}

.accordion-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.accordion-toggle {
  position: relative;
  overflow: hidden;
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  padding: var(--space-3) var(--space-4);
  border: 0;
  background: none;
  font: inherit;
  font-size: var(--text-md);
  font-weight: 600;
  text-align: left;
  color: var(--ion-text-color);
  cursor: pointer;
}

.toggle-icon {
  flex: none;
  width: 20px;
  height: 20px;
  transition: transform 280ms var(--ease-out);
}

.toggle-icon.open {
  transform: rotate(180deg);
}

.accordion-content-wrapper {
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transition:
    max-height 280ms var(--ease-out),
    opacity 200ms var(--ease-out);
}

.accordion-content-wrapper.open {
  max-height: 1000px;
  opacity: 1;
}

.accordion-content {
  padding: 0 var(--space-4) var(--space-3);
  font-size: var(--text-sm);
  color: var(--ink-soft);
}

.components-container {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-2);
}
</style>
