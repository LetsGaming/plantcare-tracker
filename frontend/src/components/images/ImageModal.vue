<template>
  <ion-modal :is-open="isOpen" @did-dismiss="closeModal">
    <editing-header
      :header-title="label"
      :show-edit-button="showEditButton"
      @edit-click="onEditClick"
      @close="closeModal"
    />
    <ion-content class="ion-padding">
      <div class="enlarged-image-container">
        <div
          class="zoomable-image-wrapper"
          ref="imageContainer"
          @wheel.prevent="onWheelZoom"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseUp"
          @touchstart="onTouchStart"
          @touchmove="onTouchMove"
        >
          <ion-img
            :src="imageUrl"
            class="enlarged-image"
            ref="zoomableImage"
            :style="{
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoomScale})`,
            }"
          />
        </div>
        <IonLabel class="enlarged-image-label">{{ label }}</IonLabel>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import {
  IonModal,
  IonContent,
  IonImg,
  IonIcon,
  IonLabel,
  IonItem,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
} from "@ionic/vue";
import { defineComponent, PropType, ref } from "vue";
import { create } from "ionicons/icons";

import EditingHeader from "../modal/EditingHeader.vue";

export default defineComponent({
  name: "ImageModal",
  emits: ["close"],
  components: {
    IonModal,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonContent,
    IonItem,
    IonImg,
    IonIcon,
    IonLabel,
    EditingHeader,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      default: "Image",
    },
    showEditButton: {
      type: Boolean,
      default: false,
    },
    onEditClick: {
      type: Function as PropType<() => void>,
      required: false,
    },
  },
  setup() {
    const zoomScale = ref(1);
    const offsetX = ref(0);
    const offsetY = ref(0);
    const lastX = ref(0);
    const lastY = ref(0);
    const isDragging = ref(false);
    let startDistance = 0;
    let startOffsetX = 0;
    let startOffsetY = 0;

    // Get distance between two touch points (for pinch zoom)
    const getDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    // Handle touch start (for pinch zoom)
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        startDistance = getDistance(event.touches);
        startOffsetX = offsetX.value;
        startOffsetY = offsetY.value;
      }
    };

    // Handle pinch-to-zoom
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        const newDistance = getDistance(event.touches);
        if (startDistance > 0) {
          const scaleChange = newDistance / startDistance;
          zoomScale.value = Math.min(
            Math.max(1, zoomScale.value * scaleChange),
            3
          );

          // Find the pinch center
          const centerX =
            (event.touches[0].clientX + event.touches[1].clientX) / 2 -
            window.innerWidth / 2;
          const centerY =
            (event.touches[0].clientY + event.touches[1].clientY) / 2 -
            window.innerHeight / 2;

          // Adjust offsets based on zoom center
          offsetX.value = startOffsetX + centerX * (zoomScale.value - 1);
          offsetY.value = startOffsetY + centerY * (zoomScale.value - 1);
        }
      }
    };

    // Handle mouse scroll zoom with correct positioning
    const onWheelZoom = (event: WheelEvent) => {
      event.preventDefault();

      const zoomFactor = 1.2;
      const newScale =
        event.deltaY < 0
          ? zoomScale.value * zoomFactor
          : zoomScale.value / zoomFactor;
      const limitedScale = Math.min(Math.max(1, newScale), 3); // Limit between 1 and 3

      // Get image bounding box
      const target = event.currentTarget as HTMLElement;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Adjust offsets dynamically when zooming
      if (limitedScale > 1) {
        offsetX.value -=
          (mouseX - rect.width / 2) * (limitedScale - zoomScale.value);
        offsetY.value -=
          (mouseY - rect.height / 2) * (limitedScale - zoomScale.value);
      } else {
        // If fully zoomed out, reset position to center
        offsetX.value = 0;
        offsetY.value = 0;
      }

      zoomScale.value = limitedScale;
    };

    // Handle mouse drag start
    const onMouseDown = (event: MouseEvent) => {
      if (zoomScale.value > 1) {
        isDragging.value = true;
        lastX.value = event.clientX;
        lastY.value = event.clientY;
      }
    };

    // Handle mouse dragging
    const onMouseMove = (event: MouseEvent) => {
      if (isDragging.value && zoomScale.value > 1) {
        // Prevent movement at scale 1
        offsetX.value += event.clientX - lastX.value;
        offsetY.value += event.clientY - lastY.value;
        lastX.value = event.clientX;
        lastY.value = event.clientY;
      }
    };

    // Handle mouse drag end
    const onMouseUp = () => {
      isDragging.value = false;
    };

    return {
      create,
      zoomScale,
      offsetX,
      offsetY,
      onWheelZoom,
      onTouchStart,
      onTouchMove,
      onMouseDown,
      onMouseMove,
      onMouseUp,
    };
  },
  methods: {
    closeModal() {
      this.$emit("close");
    },
  },
});
</script>

<style scoped>
.enlarged-image-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}

.zoomable-image-wrapper {
  overflow: hidden;
  touch-action: none;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  position: relative;
  cursor: grab;
}

.zoomable-image-wrapper:active {
  cursor: grabbing;
}

.enlarged-image {
  width: 90%;
  transition: transform 0.2s ease-in-out;
}

.enlarged-image-label {
  position: absolute;
  top: 35dvh;
  left: 2dvw;
  font-size: 24px;
}

@media (max-width: 768px) {
  .enlarged-image-label {
    top: 75dvh;
    font-size: 24px;
  }
}
</style>
