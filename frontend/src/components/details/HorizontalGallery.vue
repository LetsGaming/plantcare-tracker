<template>
  <section class="gallery-section" :aria-labelledby="headingId">
    <h2 :id="headingId" class="gallery-heading">{{ t("plantdetail.photos_title") }}</h2>

    <state-block
      v-if="sortedImages.length === 0"
      kind="empty"
      class="gallery-empty"
      :title="t('plantdetail.no_photos_title')"
      :message="t('plantdetail.no_photos_message')"
      :action-label="showEditButton ? t('plantdetail.upload_first') : ''"
      @action="$emit('upload-click')"
    />

    <ul v-else class="gallery">
      <li v-for="image in sortedImages" :key="image.id" class="gallery-item">
        <gallery-tile
          :image="image"
          :alt="altFor(image)"
          :caption="image.dateMs ? captionFor(image) : ''"
          :seed="`${plantName}:${image.id}`"
          @open="enlargeImage(image)"
        />
      </li>
    </ul>

    <ImageModal
      v-if="enlargedImage"
      :isOpen="isModalVisible"
      :imageUrl="enlargedImage.url"
      :label="captionFor(enlargedImage)"
      :alt="altFor(enlargedImage)"
      :showEditButton="showEditButton"
      @close="closeModal"
      @editClick="editClick"
    />
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapState } from "pinia";
import ImageModal from "../images/ImageModal.vue";
import GalleryTile from "./GalleryTile.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import { useSessionStore } from "@/stores/session";
import localizationService from "@/services/general/LocalizationService";
import { formatDisplayDate } from "@/utils/localDate";

let galleryCount = 0;

export default defineComponent({
  name: "HorizontalGallery",
  emits: ["edit-click", "upload-click"],
  components: {
    ImageModal,
    GalleryTile,
    StateBlock,
  },
  props: {
    images: {
      type: Array as () => readonly ImageView[],
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    /** Used in the alt text of each photo. */
    plantName: {
      type: String,
      default: "",
    },
  },
  data() {
    return {
      enlargedImage: null as ImageView | null,
      isModalVisible: false,
      headingId: `gallery-heading-${++galleryCount}`,
    };
  },
  computed: {
    ...mapState(useSessionStore, ["isGuest"]),
    showEditButton(): boolean {
      return !this.isPublic && !this.isGuest;
    },
    /** Newest photo first. */
    sortedImages(): ImageView[] {
      return [...this.images].sort((a, b) => b.dateMs - a.dateMs || b.id - a.id);
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    captionFor(image: ImageView): string {
      return formatDisplayDate(image.dateMs, localizationService.getLocale());
    },
    altFor(image: ImageView): string {
      return this.t("plantdetail.gallery_alt", {
        name: this.plantName,
        date: this.captionFor(image),
      });
    },
    enlargeImage(image: ImageView) {
      this.enlargedImage = image;
      this.$nextTick(() => {
        this.isModalVisible = true;
      });
    },
    closeModal() {
      this.isModalVisible = false;
      this.$nextTick(() => {
        this.enlargedImage = null;
      });
    },
    editClick() {
      this.$emit("edit-click", this.enlargedImage);
      this.closeModal();
    },
  },
});
</script>

<style scoped>
.gallery-section {
  display: grid;
  gap: var(--space-3);
}

.gallery-heading {
  font-size: var(--text-lg);
}

.gallery {
  display: flex;
  gap: var(--space-3);
  margin: 0;
  padding: 0 0 var(--space-2);
  list-style: none;
  overflow-x: auto;
  scroll-snap-type: x proximity;
}

.gallery-item {
  flex: 0 0 auto;
  scroll-snap-align: start;
}

.gallery-empty {
  margin: 0;
  max-width: none;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
}
</style>
