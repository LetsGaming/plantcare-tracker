<template>
  <base-modal
    :is-open="isOpen"
    modal-title="Komponente bearbeiten"
    :form-data="editComponentData"
    :form-fields="[
      { type: 'input', modelKey: 'name', label: 'Name', required: false },
      {
        type: 'input',
        modelKey: 'fineness',
        label: 'Feinheit',
        required: false,
      },
    ]"
    form-title="Komponenten Informationen"
    submit-label="Komponente editieren"
    @submit="editComponent"
    @close="$emit('close')"
    @delete-handler="deleteComponent"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import BaseModal from "../modal/BaseModal.vue";

import ComponentService from "@/services/ComponentService";

export default defineComponent({
  name: "ComponentEditingModal",
  emits: ["close", "edited"],
  components: {
    BaseModal,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    component: {
      type: Object as PropType<SubstrateComponent>,
      required: true,
    },
  },
  data() {
    return {
      editComponentData: {
        name: "",
        fineness: "",
      } as EditComponent,
    };
  },
  mounted() {
    this.editComponentData = {
      name: this.component.name,
      fineness: this.component.fineness,
    };
  },
  methods: {
    async editComponent() {
      try {
        if (this.editComponentData.name === "") {
          this.editComponentData.name = this.component.name;
        }
        if (this.editComponentData.fineness === "") {
          this.editComponentData.fineness = this.component.fineness;
        }
        await ComponentService.editComponent(
          this.component.id,
          this.editComponentData
        );
        this.$emit("edited");
      } catch (error) {
        console.error(error);
      }
    },
    async deleteComponent() {
      try {
        await ComponentService.deleteComponent(this.component.id);
        this.$emit("close");
        this.$router.push({ name: "component-overview" });
      } catch (error) {
        console.error(error);
      }
    },
  },
});
</script>
