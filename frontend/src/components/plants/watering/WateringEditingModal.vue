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
    record: { type: Object as () => WateringRecord, required: true },
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
  watch: {
    record(newRecord: WateringRecord) {
      this.setRecord(newRecord);
    },
  },
  async mounted() {
    const types = await WateringService.getFertilizerTypes();
    this.fertilizerOptions = types.map((t) => ({
      label: t.name,
      value: t.id,
    }));

    this.setRecord(this.record);
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
            { value: -1, label: "Kein Dünger" },
          ],
          defaultValue: this.editWateringRecord.fertilizerTypeId || -1,
        },
      ];
    },
  },
  methods: {
    setRecord(newRecord: WateringRecord) {
      this.editWateringRecord = {
        date: newRecord.date_millis,
        usedFertilizer: newRecord.usedFertilizer,
        fertilizerTypeId: newRecord.fertilizerTypeId || -1,
      };
    },
    async editRecord() {
      if (this.editWateringRecord.fertilizerTypeId === -1) {
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
