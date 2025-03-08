<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader headerTitle="Wässerung bearbeiten" @close="$emit('close')" />
    <IonContent>
      <form-component
        :item="editWateringRecord"
        :formFields="[
          {
            label: 'Datum',
            type: 'date',
            modelKey: 'date',
          },
          {
            type: 'radio',
            modelKey: 'fertilizerType',
            label: 'Düngertyp',
            options: [
              { value: 'organic', label: 'Organisch' },
              { value: 'synthetic', label: 'Mineralisch' },
              { value: 'none', label: 'Kein Dünger' },
            ],
            defaultValue: editWateringRecord.fertilizerType || 'none',
          },
        ]"
        cardTitle="Wässerungsinformationen"
        submitLabel="Wässerung editieren"
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
    isOpen: {
      type: Boolean,
      required: true,
    },
    record: {
      type: Object as PropType<WateringRecord>,
      required: true,
    },
    plantId: {
      type: Number,
      required: true,
    },
  },
  data() {
    return {
      editWateringRecord: {
        date: undefined,
        usedFertilizer: false,
        fertilizerType: null,
      } as EditWateringRecord,
    };
  },
  mounted() {
    this.editWateringRecord = {
      date: this.record.date,
      usedFertilizer: this.record.usedFertilizer,
      fertilizerType: this.mapFertilizerType(this.record.fertilizerType || ""),
    };
  },
  methods: {
    mapFertilizerType(type: string): EditWateringRecord["fertilizerType"] {
      switch (type) {
        case "Organisch":
          return "organic";
        case "Mineralisch":
          return "synthetic";
        default:
          return null;
      }
    },
    async editRecord() {
      console.log(this.editWateringRecord);
      if (this.editWateringRecord.fertilizerType === "none") {
        this.editWateringRecord.fertilizerType = null;
        this.editWateringRecord.usedFertilizer = false;
      } else {
        this.editWateringRecord.usedFertilizer = true;
      }

      const recordId = this.record.id;
      const response = await WateringService.editWateringRecord(
        this.plantId,
        recordId,
        this.editWateringRecord
      );
      if (response) {
        this.$emit("edited");
      }
    },
    async deleteRecord() {
      const recordId = this.record.id;
      const response = await WateringService.deleteWateringRecord(
        this.plantId,
        recordId
      );
      if (response) {
        this.$emit("close");
        await this.$router.push({ name: "plant-overview" }); // Redirect to plant list after success
      }
    },
  },
});
</script>
