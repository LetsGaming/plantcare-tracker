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
        <template v-if="item.details && Object.keys(item.details).length > 0">
          <p v-for="(value, key) in item.details" :key="key">
            <strong>{{ key }}:</strong> {{ value }}
          </p>
        </template>
        <template v-if="item.components && item.components.length > 0">
          <div style="display: flex; justify-content: space-evenly;">
            <template
              v-for="(component, index) in item.components"
              :key="index"
            >
              <component :is="component" />
            </template>
          </div>
        </template>
        <p v-else>No details available.</p>
      </div>
    </transition>
  </li>
</template>

<script lang="ts">
import UserService from "@/services/UserService";
import { defineComponent, ref } from "vue";
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
      default: false,
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
    this.isGuest = await UserService.isGuest();
  },
  methods: {
    onEditClick() {
      this.$emit("edit-click", this.item);
    },
  },
});
</script>

<style scoped>
.card {
  background: var(--ion-color-white);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
}

.accordion-toggle {
  color: var(--ion-text-color);
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

.accordion-toggle:hover {
  color: var(--ion-color-primary);
}

.icons-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-icon {
  font-size: 1.2rem;
  color: var(--ion-color-primary);
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
  color: var(--ion-color-medium);
  border-radius: 6px;
}
</style>
