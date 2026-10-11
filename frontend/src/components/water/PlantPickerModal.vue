<template>
  <ion-modal
    v-if="mounted"
    :is-open="isOpen"
    :aria-label="t('water.picker_title')"
    @didDismiss="onDismiss"
  >
    <modal-header :header-title="t('water.picker_title')" @close="$emit('close')" />
    <ion-content>
      <ion-searchbar :placeholder="t('water.search')" :debounce="150" @ionInput="onInput" />
      <ul class="plants">
        <li v-for="plant in filtered" :key="plant.id">
          <button type="button" class="plant" @click="$emit('pick', plant.id)">
            <span class="thumb" aria-hidden="true">
              <img v-if="plant.imageUrl" :src="plant.imageUrl" alt="" loading="lazy" />
              <plant-placeholder v-else :seed="String(plant.id)" />
            </span>
            <span class="name break-words">{{ plant.name }}</span>
          </button>
        </li>
      </ul>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapState } from "pinia";
import { IonContent, IonModal, IonSearchbar } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import PlantPlaceholder from "@/components/ui/PlantPlaceholder.vue";
import { useMountWhileOpen } from "@/components/modal/useMountWhileOpen";
import localizationService from "@/services/general/LocalizationService";
import { usePlantsStore } from "@/stores/plants";

export default defineComponent({
  name: "PlantPickerModal",
  components: { IonContent, IonModal, IonSearchbar, ModalHeader, PlantPlaceholder },
  props: {
    isOpen: { type: Boolean, required: true },
  },
  emits: ["close", "pick"],
  setup(props) {
    return useMountWhileOpen(() => props.isOpen);
  },
  data() {
    return { query: "" };
  },
  computed: {
    ...mapState(usePlantsStore, ["personalPlants"]),
    filtered(): Plant[] {
      const needle = this.query.trim().toLowerCase();
      const plants = [...this.personalPlants].sort((a, b) => a.name.localeCompare(b.name));
      return needle ? plants.filter((plant) => plant.name.toLowerCase().includes(needle)) : plants;
    },
  },
  watch: {
    isOpen(open: boolean) {
      if (open) this.query = "";
    },
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
    onInput(event: CustomEvent<{ value?: string | null }>) {
      this.query = event.detail.value ?? "";
    },
    onDismiss() {
      this.release();
      this.$emit("close");
    },
  },
});
</script>

<style scoped>
.plants {
  margin: 0;
  padding: 0;
  list-style: none;
}

.plant {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 64px;
  padding: var(--space-2) var(--space-4);
  border: 0;
  border-bottom: 1px solid var(--ion-border-color);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.thumb {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  color: var(--ink-soft);
}

.thumb img,
.thumb :deep(.placeholder) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb :deep(.placeholder) {
  min-height: 0;
}

.name {
  font-weight: 600;
}
</style>
