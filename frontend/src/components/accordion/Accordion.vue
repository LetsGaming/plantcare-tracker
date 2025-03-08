<template>
  <li class="accordion-item card">
    <button class="accordion-toggle" @click="toggle" :aria-expanded="isOpen">
      <span class="accordion-title">{{ item.name }}</span>
      <span class="icons-container">
        <ion-icon
          v-if="!isGuest && showEditButton"
          :icon="create"
          style="width: 32px; height: 32px"
          slot="end"
          @click="onEditClick"
        />
        <span class="toggle-icon" :class="{ open: isOpen }">▼</span>
      </span>
    </button>

    <transition name="slide-fade">
      <div v-if="isOpen" class="accordion-content">
        <p v-for="(value, key) in item.details" :key="key">
          <strong>{{ key }}:</strong> {{ value }}
        </p>
      </div>
    </transition>
  </li>
</template>

<script lang="ts">
import AuthUtils from "@/utils/authUtils";
import { defineComponent, PropType, ref } from "vue";
import { IonIcon } from "@ionic/vue";
import { create } from "ionicons/icons";

export default defineComponent({
  name: "Accordion",
  emits: ["edit-click"],
  components: { IonIcon },
  props: {
    item: {
      type: Object as () => AccordionItem,
      required: true,
    },
    showEditButton: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      isGuest: false,
    };
  },
  setup(props) {
    const isOpen = ref(false);

    function toggle() {
      isOpen.value = !isOpen.value;
    }

    return { isOpen, toggle, create };
  },
  async mounted() {
    this.isGuest = await AuthUtils.isGuest();
  },
  methods: {
    onEditClick() {
      this.$emit("edit-click", this.item);
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

.accordion-toggle {
  width: 100%;
  background: none;
  border: none;
  text-align: left;
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.icons-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-icon {
  font-size: 1.2rem;
  color: var(--accent-color);
  cursor: pointer;
  transition: color 0.3s ease;
}

.edit-icon:hover {
  color: var(--ion-color-dark);
}

.toggle-icon {
  transition: transform 0.3s ease;
}

.toggle-icon.open {
  transform: rotate(180deg);
}

.accordion-item {
  width: 100%;
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
