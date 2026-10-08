<template>
  <ion-popover :is-open="isOpen" :event="event" @didDismiss="onDismiss">
    <ion-content class="ion-padding">
      <div class="popover-body">
        <div class="popover-head">
          <h3 class="popover-title">{{ title }}</h3>
          <IconButton
            v-if="showEditButton"
            :icon="create"
            :label="editLabel"
            @press="onEditClick"
          />
        </div>

        <slot v-if="$slots.default" />

        <dl v-else class="popover-fields">
          <div v-for="(field, index) in fields" :key="index" class="popover-field">
            <dt>{{ field.label }}</dt>
            <dd>{{ field.value }}</dd>
          </div>
        </dl>
      </div>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts">
import { IonPopover, IonContent } from "@ionic/vue";
import { create } from "ionicons/icons";
import { defineComponent } from "vue";
import IconButton from "@/components/ui/IconButton.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "Popover",
  emits: ["edit-click", "dismiss"],
  components: {
    IonPopover,
    IonContent,
    IconButton,
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
  computed: {
    editLabel(): string {
      return localizationService.t("a11y.edit", undefined, "Edit");
    },
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
  --width: 350px;
  --border-radius: var(--radius-md);
}

.popover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.popover-title {
  font-size: var(--text-md);
  overflow-wrap: anywhere;
}

.popover-fields {
  display: grid;
  gap: var(--space-2);
  margin: var(--space-3) 0 0;
}

.popover-field {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}

.popover-field dt {
  font-weight: 650;
}

.popover-field dd {
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
}
</style>
