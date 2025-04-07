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
        fertilizerType: null,
      } as EditWateringRecord,
      isLoading: false,
      fertilizerOptions: [] as { label: string; value: string }[],
    };
  },
  async mounted() {
    const types = await WateringService.getFertilizerTypes();
    this.fertilizerOptions = types.map((t) => ({
      label: t.name,
      value: t.id,
    }));

    this.editWateringRecord = {
      date: this.record.date_millis,
      usedFertilizer: this.record.usedFertilizer,
      fertilizerTypeId: this.record.fertilizerTypeId,
    };
  },
  computed: {
    formFields() {
      return [
        { label: "Datum", type: "date", modelKey: "date" },
        {
          type: "radio",
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
      if (this.editWateringRecord.fertilizerTypeId === "none") {
        this.editWateringRecord.fertilizerTypeId = null;
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
