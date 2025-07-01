<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader headerTitle="Wässerung bearbeiten" @close="$emit('close')" />
    <IonContent>
      <form-component
        :item="editWateringRecord"
        :formFields="formFields"
        cardTitle="Wässerungsinformationen"
        submitLabel="Wässerung editieren"
        :is-loading="isLoading"
        @submit-click="editRecord"
        @delete-click="deleteRecord"
      ></form-component>
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonModal, IonContent } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import FormComponent from "@/components/formcomponent/FormComponent.vue";
import WateringService from "@/services/WateringService";

export default defineComponent({
  name: "WateringEditModal",
  emits: ["close", "edited"],
  components: { IonModal, IonContent, ModalHeader, FormComponent },
  props: {
    isOpen: { type: Boolean, required: true },
    record: { type: Object as PropType<WateringRecord>, required: true },
    plantId: { type: Number, required: true },
  },
  data() {
    return {
      editWateringRecord: {
        date: undefined,
        usedFertilizer: false,
        fertilizerTypeId: undefined,
      } as EditWateringRecord,
      isLoading: false,
      fertilizerOptions: [] as { label: string; value: number }[],
    };
  },
  async mounted() {
    const types = await WateringService.getFertilizerTypes();
    this.fertilizerOptions = types.map((t) => ({
      label: t.name,
      value: t.id,
    }));

    const fertilizerTypeId = types.find(
      (t) => t.name === this.record.fertilizerType
    )?.id;
    this.editWateringRecord = {
      date: this.record.date_millis,
      usedFertilizer: this.record.usedFertilizer,
      fertilizerTypeId: fertilizerTypeId || undefined,
    };
  },
  computed: {
    formFields(): FormField[] {
      return [
        { label: "Datum", type: "date" as const, modelKey: "date" },
        {
          type: "radio" as const,
          modelKey: "fertilizerTypeId",
          label: "Düngertyp",
          options: [
            ...this.fertilizerOptions,
            { value: "none", label: "Kein Dünger" },
          ],
          defaultValue: this.editWateringRecord.fertilizerTypeId || "none",
        },
      ];
    },
  },
  methods: {
    async editRecord() {
      if (String(this.editWateringRecord.fertilizerTypeId) === "none") {
        this.editWateringRecord.fertilizerTypeId = undefined;
        this.editWateringRecord.usedFertilizer = false;
      } else {
        this.editWateringRecord.usedFertilizer = true;
      }

      this.isLoading = true;
      const recordId = this.record.id;
      const response = await WateringService.editWateringRecord(
        this.plantId,
        recordId,
        this.editWateringRecord
      );
      if (response) {
        this.isLoading = false;
        this.$emit("edited");
      }
    },
    async deleteRecord() {
      this.isLoading = true;
      const recordId = this.record.id;
      const response = await WateringService.deleteWateringRecord(
        this.plantId,
        recordId
      );
      if (response) {
        this.isLoading = false;
        this.$emit("close");
        await this.$router.push({ name: "plant-overview" });
      }
    },
  },
});
</script>
