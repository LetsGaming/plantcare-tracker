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
        <button type="button" class="gallery-open" @click="enlargeImage(image)">
          <span class="gallery-image">
            <progressive-image
              :src="image.url"
              :alt="altFor(image)"
              :seed="`${plantName}:${image.id}`"
            />
          </span>
          <span v-if="image.date" class="image-date">{{ captionFor(image) }}</span>
        </button>
      </li>
    </ul>

    <ImageModal
      v-if="enlargedImage"
      :isOpen="isModalVisible"
      :imageUrl="enlargedImage.url"
      :label="enlargedImage.date"
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
import ProgressiveImage from "@/components/ProgressiveImage.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import { useSessionStore } from "@/stores/session";
import localizationService from "@/services/general/LocalizationService";

let galleryCount = 0;

export default defineComponent({
  name: "HorizontalGallery",
  emits: ["edit-click", "upload-click"],
  components: {
    ImageModal,
    ProgressiveImage,
    StateBlock,
  },
  props: {
    images: {
      type: Array as () => Image[],
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
      enlargedImage: null as Image | null,
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
    sortedImages(): Image[] {
      return [...this.images].sort((a, b) => b.date_millis - a.date_millis || b.id - a.id);
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    captionFor(image: Image): string {
      if (!image.date_millis) return image.date;
      return new Intl.DateTimeFormat(localizationService.getLocale(), {
        dateStyle: "medium",
      }).format(new Date(image.date_millis));
    },
    altFor(image: Image): string {
      return this.t("plantdetail.gallery_alt", {
        name: this.plantName,
        date: this.captionFor(image),
      });
    },
    enlargeImage(image: Image) {
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

.gallery-open {
  display: grid;
  gap: var(--space-1);
  padding: 0;
  margin: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.gallery-image {
  display: block;
  width: 168px;
  height: 168px;
  overflow: hidden;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
}

.image-date {
  font-size: var(--text-xs);
  color: var(--ink-soft);
}

.gallery-empty {
  margin: 0;
  max-width: none;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
}

@media (min-width: 900px) {
  .gallery-image {
    width: 148px;
    height: 148px;
  }
}
</style>
