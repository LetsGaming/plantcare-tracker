<template>
  <ion-popover :is-open="isOpen" :event="event" @didDismiss="onDismiss">
    <ion-content class="ion-padding">
      <div>
        <ion-toolbar>
          <ion-title class="record-header">{{ title }}</ion-title>
          <ion-icon
            v-if="showEditButton"
            slot="end"
            :icon="create"
            @click="onEditClick"
          />
        </ion-toolbar>

        <!-- Custom slot content -->
        <slot v-if="$slots.default" />

        <!-- Fallback to dynamic field rendering -->
        <template v-else>
          <span v-for="(field, index) in fields" :key="index" style="display: flex;">
            <p style="width: 50%;">
              <strong>{{ field.label }}:</strong>
            </p>
            <p style="width: 50%; text-align: right;">
              {{ field.value }}
            </p>
          </span>
        </template>
      </div>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts">
import {
  IonPopover,
  IonContent,
  IonToolbar,
  IonTitle,
  IonIcon,
} from "@ionic/vue";
import { create } from "ionicons/icons";
import { defineComponent } from "vue";

export default defineComponent({
  name: "Popover",
  emits: ["edit-click", "dismiss"],
  components: {
    IonPopover,
    IonContent,
    IonToolbar,
    IonTitle,
    IonIcon,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    event: {
      type: Object as () => Event | null,
      required: false,
    },
    title: {
      type: String,
      default: "Details",
    },
    showEditButton: {
      type: Boolean,
      default: false,
    },
    fields: {
      type: Array as () => PopoverField[],
      required: false,
      default: () => [],
    },
  },
  setup() {
    return {
      create,
    };
  },
  methods: {
    onEditClick() {
      this.$emit("edit-click");
    },
    onDismiss() {
      this.$emit("dismiss");
    },
  },
});
</script>

<style scoped>
ion-popover {
  --width: auto !important;
}

.record-header {
  font-weight: bold;
}
</style>
