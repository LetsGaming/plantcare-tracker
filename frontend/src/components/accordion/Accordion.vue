<template>
  <li class="accordion-item">
    <div
      class="accordion-toggle ion-activatable ion-focusable"
      role="button"
      tabindex="0"
      :aria-expanded="isOpen"
      @click="toggle"
      @keydown.enter.space.prevent="toggle"
    >
      <!-- REAL Ionic ripple -->
      <ion-ripple-effect mode="md" />

      <span class="accordion-title">{{ item.name }}</span>

      <span class="icons-container">
        <ion-icon
          v-if="!isGuest && showEditButton"
          :icon="create"
          style="width: 24px; height: 24px"
          @click.stop="onEditClick"
        />
        <span class="toggle-icon" :class="{ open: isOpen }">▼</span>
      </span>
    </div>

    <div class="accordion-content-wrapper" :class="{ open: isOpen }">
      <div class="accordion-content">
        <template v-if="item.details && Object.keys(item.details).length > 0">
          <p v-for="(value, key) in item.details" :key="key">
            <strong>{{ key }}:</strong> {{ value }}
          </p>
        </template>

        <template v-if="item.components && item.components.length > 0">
          <div class="components-container">
            <component
              v-for="(component, index) in item.components"
              :key="index"
              :is="component"
            />
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
import { create } from "ionicons/icons";
import UserService from "@/services/UserService";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "Accordion",
  components: {
    IonIcon,
    IonRippleEffect,
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

    function toggle() {
      isOpen.value = !isOpen.value;
    }

    return {
      isOpen,
      toggle,
      create,
    };
  },
  data() {
    return {
      isGuest: false,
    };
  },
  async mounted() {
    this.isGuest = await UserService.isGuest();
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
/* Ionic-style list item */
.accordion-item {
  width: 100%;
  list-style: none;
  border-bottom: 1px solid var(--ion-color-light);
}

/* Activation surface (matches ion-item) */
.accordion-toggle {
  position: relative;
  overflow: hidden;

  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 14px 16px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-text-color);
  cursor: pointer;
}

/* Icons */
.icons-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Arrow animation */
.toggle-icon {
  display: inline-block;
  transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-icon.open {
  transform: rotate(180deg);
}

/* Ionic accordion animation */
.accordion-content-wrapper {
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transition:
    max-height 280ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.accordion-content-wrapper.open {
  max-height: 1000px;
  opacity: 1;
}

/* Content */
.accordion-content {
  padding: 0 16px 12px 16px;
  font-size: 0.95rem;
  color: var(--ion-color-medium);
}

/* Dynamic components */
.components-container {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
}
</style>
