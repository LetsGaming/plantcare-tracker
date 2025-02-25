<template>
  <transition-group name="fade" tag="ul" class="accordion-list">
    <li v-for="item in items" :key="item.id" class="accordion-item card">
      <button
        class="accordion-toggle"
        @click="toggleDetails(item.id)"
        :aria-expanded="isDetailsVisible(item.id)"
      >
        <span class="accordion-title">{{ item.name }}</span>
        <span class="toggle-icon" :class="{ open: isDetailsVisible(item.id) }">
          ▼
        </span>
      </button>

      <transition name="slide-fade">
        <div v-if="isDetailsVisible(item.id)" class="accordion-content">
          <p v-for="(value, key) in item.details" :key="key">
            <strong>{{ key }}:</strong> {{ value }}
          </p>
        </div>
      </transition>
    </li>
  </transition-group>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  name: "CustomAccordion",
  props: {
    items: {
      type: Array as PropType<AccordionItem[]>,
      required: true,
    },
  },
  data() {
    return {
      visibleDetails: {} as Record<string | number, boolean>,
    };
  },
  methods: {
    toggleDetails(id: number | string) {
      this.$data.visibleDetails[id] = !this.visibleDetails[id];
    },
    isDetailsVisible(id: number | string) {
      return !!this.visibleDetails[id];
    },
  },
});
</script>

<style scoped>
:root {
  --background-color: var(--ion-color-light);
  --card-background-color: var(--ion-color-white);
  --header-background-color: var(--ion-color-light-tint);
  --text-color: var(--ion-color-dark);
  --detail-text-color: var(--ion-color-medium);
  --accent-color: var(--ion-color-primary);
}

.card {
  background: var(--card-background-color);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
}

.accordion-list {
  padding: 0;
  max-height: 250px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.accordion-toggle {
  width: 100%;
  background: none;
  border: none;
  text-align: left;
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: color 0.3s ease;
  padding: 10px 0;
}

.accordion-toggle:focus {
  outline: 2px solid var(--accent-color);
}

.accordion-toggle:hover {
  color: var(--accent-color);
}

.toggle-icon {
  transition: transform 0.3s ease;
}

.toggle-icon.open {
  transform: rotate(180deg);
}

.accordion-item {
  list-style: none;
  padding: 15px;
  border-bottom: 1px solid var(--ion-color-light);
}

.accordion-content {
  margin-top: 10px;
  padding-left: 20px;
  font-size: 0.9rem;
  color: var(--detail-text-color);
  border-radius: 6px;
}
</style>
