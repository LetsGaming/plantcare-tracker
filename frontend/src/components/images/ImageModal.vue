<template>
  <ion-modal v-if="mounted" :is-open="isOpen" :aria-label="dialogLabel" @did-dismiss="closeModal">
    <editing-header
      :header-title="dialogLabel"
      :show-edit-button="showEditButton"
      @edit-click="onEditClick"
      @close="closeModal"
    />
    <ion-content class="ion-padding">
      <div class="zoom-toolbar">
        <icon-button
          :icon="icons.zoomOut"
          :label="zoomOutLabel"
          :disabled="zoomScale <= zoomMin"
          @press="zoomOut"
        />
        <icon-button
          :icon="icons.zoomReset"
          :label="zoomResetLabel"
          :disabled="zoomScale <= zoomMin"
          @press="resetZoom"
        />
        <icon-button
          :icon="icons.zoomIn"
          :label="zoomInLabel"
          :disabled="zoomScale >= zoomMax"
          @press="zoomIn"
        />
      </div>
      <div class="enlarged-image-container">
        <div
          class="zoomable-image-wrapper"
          ref="imageContainer"
          tabindex="0"
          role="group"
          :aria-label="dialogLabel"
          @keydown="onKeyDown"
          @wheel.prevent="onWheelZoom"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseUp"
          @touchstart="onTouchStart"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchEnd"
        >
          <ion-img
            :src="imageUrl"
            :alt="alt || label"
            class="enlarged-image"
            ref="zoomableImage"
            :style="{
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoomScale})`,
            }"
          />
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import { IonModal, IonContent, IonImg } from "@ionic/vue";
import { defineComponent, PropType, ref, watch } from "vue";
import EditingHeader from "../modal/EditingHeader.vue";
import IconButton from "@/components/ui/IconButton.vue";
import { icons } from "@/theme/icons";
import { PAN_STEP, ZOOM_MAX, ZOOM_MIN, clampZoom, stepZoom } from "@/utils/zoom";
import { useMountWhileOpen } from "@/components/modal/useMountWhileOpen";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "ImageModal",
  emits: ["close"],
  components: {
    IonModal,
    IonContent,
    IonImg,
    EditingHeader,
    IconButton,
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
      default: "",
    },
    alt: {
      type: String,
      default: "",
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
  setup(props) {
    const { mounted, release } = useMountWhileOpen(() => props.isOpen);
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

    const onTouchEnd = () => {
      startDistance = 0;
      isDragging.value = false;
    };

    const resetZoom = () => {
      zoomScale.value = ZOOM_MIN;
      offsetX.value = 0;
      offsetY.value = 0;
    };

    const applyZoom = (next: number) => {
      if (next <= ZOOM_MIN) {
        resetZoom();
        return;
      }
      zoomScale.value = next;
    };

    const zoomIn = () => applyZoom(stepZoom(zoomScale.value, 1));
    const zoomOut = () => applyZoom(stepZoom(zoomScale.value, -1));

    const panOffsets: Record<string, [number, number]> = {
      ArrowLeft: [PAN_STEP, 0],
      ArrowRight: [-PAN_STEP, 0],
      ArrowUp: [0, PAN_STEP],
      ArrowDown: [0, -PAN_STEP],
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        resetZoom();
      } else if (event.key in panOffsets && zoomScale.value > ZOOM_MIN) {
        event.preventDefault();
        const [dx, dy] = panOffsets[event.key];
        offsetX.value += dx;
        offsetY.value += dy;
      }
    };

    watch(() => props.imageUrl, resetZoom);

    // Handle pinch-to-zoom
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        const newDistance = getDistance(event.touches);
        if (startDistance > 0) {
          const scaleChange = newDistance / startDistance;
          zoomScale.value = clampZoom(zoomScale.value * scaleChange);

          // Find the pinch center
          const centerX =
            (event.touches[0].clientX + event.touches[1].clientX) / 2 - window.innerWidth / 2;
          const centerY =
            (event.touches[0].clientY + event.touches[1].clientY) / 2 - window.innerHeight / 2;

          // Adjust offsets based on zoom center
          offsetX.value = startOffsetX + centerX * (zoomScale.value - 1);
          offsetY.value = startOffsetY + centerY * (zoomScale.value - 1);
        }
      }

      // Reset position when zooming out completely
      if (zoomScale.value === 1) {
        offsetX.value = 0;
        offsetY.value = 0;
      }
    };

    // Handle mouse scroll zoom with correct positioning
    const onWheelZoom = (event: WheelEvent) => {
      event.preventDefault();

      const zoomFactor = 1.2;
      const newScale =
        event.deltaY < 0 ? zoomScale.value * zoomFactor : zoomScale.value / zoomFactor;
      const limitedScale = clampZoom(newScale);

      // Get image bounding box
      const target = event.currentTarget as HTMLElement;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Adjust offsets dynamically when zooming
      if (limitedScale > 1) {
        offsetX.value -= (mouseX - rect.width / 2) * (limitedScale - zoomScale.value);
        offsetY.value -= (mouseY - rect.height / 2) * (limitedScale - zoomScale.value);
      } else {
        // Reset position when zooming out completely
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
      mounted,
      release,
      icons,
      zoomMin: ZOOM_MIN,
      zoomMax: ZOOM_MAX,
      zoomScale,
      offsetX,
      offsetY,
      onWheelZoom,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onKeyDown,
      zoomIn,
      zoomOut,
      resetZoom,
      onMouseDown,
      onMouseMove,
      onMouseUp,
    };
  },
  computed: {
    dialogLabel(): string {
      const key = this.label || "a11y.image_dialog";
      return localizationService.t(key, undefined, key);
    },
    zoomInLabel(): string {
      return localizationService.t("a11y.zoom_in", undefined, "a11y.zoom_in");
    },
    zoomOutLabel(): string {
      return localizationService.t("a11y.zoom_out", undefined, "a11y.zoom_out");
    },
    zoomResetLabel(): string {
      return localizationService.t("a11y.zoom_reset", undefined, "a11y.zoom_reset");
    },
  },
  methods: {
    closeModal() {
      this.resetZoom();
      this.$emit("close");
      this.release();
    },
  },
});
</script>

<style scoped>
.zoom-toolbar {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
}

.enlarged-image-container {
  height: calc(100% - var(--tap-min));
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
</style>
