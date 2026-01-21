<template>
  <div class="gallery-container">
    <div class="gallery" ref="gallery">
      <div
        v-for="(image, index) in sortedImages"
        :key="index"
        class="gallery-item"
      >
        <ion-img
          :src="image.url"
          alt="Gallery image"
          class="gallery-image"
          @click="enlargeImage(image)"
          @ion-error="($event) => ($event.target.src = '/no-image.png')"
        />
        <div v-if="image.date" class="image-date">{{ image.date }}</div>
      </div>
    </div>

    <!-- Use Ion Modal -->
    <ImageModal
      v-if="enlargedImage"
      :isOpen="isModalVisible"
      :imageUrl="enlargedImage.url"
      :label="enlargedImage.date"
      :showEditButton="showEditButton"
      @close="closeModal"
      @editClick="editClick"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonImg } from "@ionic/vue";
import ImageModal from "../images/ImageModal.vue";
import UserService from "@/services/UserService";

export default defineComponent({
  name: "HorizontalGallery",
  emits: ["edit-click"],
  components: {
    IonImg,
    ImageModal,
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
  },
  data() {
    return {
      enlargedImage: null as Image | null,
      isModalVisible: false,
      showEditButton: false,
    };
  },
  computed: {
    sortedImages() {
      return [...this.images].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    },
  },
  async mounted() {
    await this.setShowEdit();
  },
  methods: {
    async setShowEdit() {
      this.showEditButton = !this.isPublic && !(await UserService.isGuest());
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

.gallery-image::part(image) {
  width: 350px;
  height: 300px;
  object-fit: cover;
}

.image-date {
  position: absolute;
  bottom: 5px;
  left: 5px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 5px;
  border-radius: 5px;
  font-size: 24px;
}
</style>
