<template>
  <div class="gallery-container">
    <div class="gallery" ref="gallery">
      <div v-for="(image, index) in images" :key="index" class="gallery-item">
        <img
          :src="image.url"
          alt="Gallery image"
          class="gallery-image"
          @click="enlargeImage(image.url, image.date)"
        />
        <div v-if="image.date" class="image-date">{{ image.date }}</div>
      </div>
    </div>

    <!-- Use Ion Modal -->
    <ImageModal
      :isOpen="isModalVisible"
      :imageUrl="enlargedImageUrl"
      :label="enlargedImageLabel"
      @close="closeModal"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";
import ImageModal from "./ImageModal.vue"; // Adjust path as necessary

export default defineComponent({
  name: "ImageGallery",
  components: {
    ImageModal,
  },
  props: {
    images: {
      type: Array as () => Array<{ url: string; date?: string }>,
      required: true,
    },
  },
  setup() {
    const enlargedImageUrl = ref("");
    const enlargedImageLabel = ref("");
    const isModalVisible = ref(false);

    const enlargeImage = (url: string, label?: string) => {
      enlargedImageUrl.value = url;
      isModalVisible.value = true;

      if (label) enlargedImageLabel.value = label;
    };

    const closeModal = () => {
      isModalVisible.value = false;
      enlargedImageUrl.value = "";
    };

    return {
      enlargedImageUrl,
      enlargedImageLabel,
      isModalVisible,
      enlargeImage,
      closeModal,
    };
  },
});
</script>

<style scoped>
.gallery-container {
  display: flex;
  justify-content: center;
  padding: 10px;
  overflow: hidden; /* Prevent overflow */
}

.gallery {
  display: flex;
  overflow-x: auto; /* Allow horizontal scrolling */
  scroll-behavior: smooth; /* Enables smooth scrolling */
  white-space: nowrap; /* Prevent items from wrapping */
  padding: 10px 0;
}

.gallery-item {
  position: relative;
  margin: 0 5px; /* Adjust spacing between items */
  flex: 0 0 auto; /* Prevent flex items from shrinking */
}

.gallery-image {
  width: 350px; /* Adjust the width of images */
  height: 300px; /* Adjust the height of images */
  border-radius: 10px; /* Modern rounded corners */
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2); /* Shadow effect */
  cursor: pointer; /* Pointer cursor for clickable images */
}

.image-date {
  position: absolute;
  bottom: 5px;
  left: 5px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 5px;
  border-radius: 5px;
  font-size: 24px; /* Adjust font size as needed */
}
</style>
