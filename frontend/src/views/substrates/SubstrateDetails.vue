<template>
  <ion-page>
    <details-header
      :show-edit-button="!isPublic && !!substrate"
      @edit-click="showEditModal = true"
      :show-upload-button="!isPublic && !!substrate"
      @upload-click="toggleUpload"
      default-back-href="/tabs/substrates"
    ></details-header>

    <ion-content>
      <pull-refresher :handler="refresh" />

      <div v-if="substrate" class="detail-column">
        <detail-hero
          :title="substrate.name"
          :image-url="substrate.imageUrl"
          :image-alt="t('subdetail.image_alt', { name: substrate.name })"
          kind="substrate"
          :is-public="substrate.isPublic"
        >
          <span v-if="substrate.created_at">
            {{ t("subdetail.created", { date: substrate.created_at }) }}
          </span>
        </detail-hero>

        <div class="detail-body">
          <SubstrateContainer :substrate="substrate"></SubstrateContainer>
        </div>
      </div>

      <state-block
        v-else-if="phase === 'loading'"
        kind="loading"
        :title="t('subdetail.loading')"
        :skeletons="2"
      />
      <state-block
        v-else-if="phase === 'not-found'"
        kind="not-found"
        placeholder-kind="substrate"
        :title="t('state.not_found_title')"
        :message="t('state.not_found_message')"
        :action-label="t('state.back_to_list')"
        @action="goToList"
      />
      <state-block
        v-else
        kind="error"
        placeholder-kind="substrate"
        :title="t('state.error_title')"
        :message="t('state.error_message')"
        :action-label="t('state.retry')"
        @action="reload"
      />

      <ImageUploadModal
        :is-open="showUploadModal"
        :card-title="t('image.upload.for_name', { name: substrate?.name })"
        @close="showUploadModal = false"
        @submit="onImageUpload"
        :is-loading="isLoading"
      />

      <SubstrateEditingModal
        v-if="substrate"
        :is-open="showEditModal"
        :substrate="substrate"
        :available-components="availableComponents"
        :is-loading="isSubmitting"
        @close="showEditModal = false"
        @save="handleSubstrateUpdate"
        @delete="handleSubstrateDelete"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonContent } from "@ionic/vue";
import { mapActions, mapState } from "pinia";
import { useSubstratesStore } from "@/stores/substrates";
import { useComponentsStore } from "@/stores/components";
import { useSessionStore } from "@/stores/session";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

import DetailsHeader from "@/components/details/DetailsHeader.vue";
import DetailHero from "@/components/ui/DetailHero.vue";
import PullRefresher from "@/components/ui/PullRefresher.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import { LoadPhase, phaseFromError } from "@/utils/loadPhase";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";
import ImageUploadModal from "@/components/images/ImageUploadModal.vue";
import SubstrateEditingModal from "@/components/substrates/SubstrateEditingModal.vue";

export default defineComponent({
  name: "SubstrateDetails",
  components: {
    IonPage,
    IonContent,
    DetailsHeader,
    DetailHero,
    StateBlock,
    PullRefresher,
    SubstrateContainer,
    ImageUploadModal,
    SubstrateEditingModal,
  },
  props: {
    id: { type: String, required: true },
    public: { type: String, default: "0" },
  },
  data() {
    return {
      showUploadModal: false,
      showEditModal: false,
      isLoading: false, // For image upload
      isSubmitting: false, // For substrate editing
      phase: "loading" as LoadPhase,
    };
  },
  computed: {
    ...mapState(useSubstratesStore, ["byId"]),
    ...mapState(useSessionStore, ["userId"]),
    ...mapState(useComponentsStore, { allComponents: "items" }),
    /** This page's substrate, straight from the store so every update repaints it. */
    substrate(): Substrate | null {
      return this.byId(this.substrateId) ?? null;
    },
    availableComponents(): SubstrateComponent[] {
      return this.allComponents
        .map((comp: Component) => ({
          ...comp,
          description: comp.fineness || "",
          parts: 0,
        }))
        .sort((a: SubstrateComponent, b: SubstrateComponent) =>
          a.name.localeCompare(b.name, localizationService.getLocale()),
        );
    },
    substrateId(): number {
      return Number.parseInt(this.id);
    },
    isPublic(): boolean {
      return this.substrate ? this.substrate.userId !== this.userId : this.public === "1";
    },
  },
  async ionViewWillEnter() {
    await this.reload();
  },
  methods: {
    ...mapActions(useSubstratesStore, {
      loadSubstrate: "getSubstrate",
      saveSubstrateComponents: "editSubstrateComponents",
      saveSubstrate: "editSubstrate",
      removeSubstrate: "deleteSubstrate",
      uploadSubstrateImage: "uploadSubstrateImage",
    }),
    ...mapActions(useComponentsStore, { ensureComponentsLoaded: "ensureLoaded" }),

    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },

    async reload(forceUpdate = false) {
      if (!this.substrate) this.phase = "loading";
      const [substrateResult] = await Promise.allSettled([
        this.loadSubstrate(this.substrateId, forceUpdate),
        this.ensureComponentsLoaded(),
      ]);
      if (substrateResult.status === "rejected") {
        this.phase = phaseFromError(substrateResult.reason);
        return;
      }
      this.phase = this.substrate ? "ready" : "not-found";
    },

    refresh() {
      return this.reload(true);
    },

    goToList() {
      this.$router.replace({ name: "substrate-overview" });
    },

    toggleUpload() {
      this.showUploadModal = !this.showUploadModal;
    },

    async handleSubstrateUpdate(payload: {
      meta: any;
      componentIds: number[];
      parts: Record<number, number>;
    }) {
      if (!this.substrate) return;

      const { meta, componentIds, parts } = payload;

      const metaChanged = this.hasMetaChanged(meta);
      const componentsChanged = this.haveComponentsChanged(componentIds, parts);

      if (!metaChanged && !componentsChanged) {
        return ToastService.showWarning({ key: "substrate.no_changes" });
      }

      this.isSubmitting = true;
      try {
        // The store upserts the server-confirmed substrate; this page repaints from it.
        await this.updateSubstrate(metaChanged, componentsChanged, meta, componentIds, parts);
        this.showEditModal = false;
      } catch (error) {
        // handleRequest has already shown the error toast.
        console.error("Substrate update failed:", error);
      } finally {
        this.isSubmitting = false;
      }
    },

    /** Check if meta data changed */
    hasMetaChanged(meta: any): boolean {
      return (
        meta.name !== this.substrate?.name ||
        meta.isPublic !== this.substrate?.isPublic ||
        !!meta.image
      );
    },

    /** Check if component list changed */
    haveComponentsChanged(componentIds: number[], parts: Record<number, number>): boolean {
      const currentComps = this.sortedComponents(componentIds, parts);
      const oldComps = this.sortedComponentsFromSubstrate();
      return JSON.stringify(currentComps) !== JSON.stringify(oldComps);
    },

    /** Sort and map new components */
    sortedComponents(componentIds: number[], parts: Record<number, number>) {
      return componentIds
        .map((id) => ({ componentId: id, parts: parseFloat(String(parts[id])) || 1 }))
        .sort((a, b) => a.componentId - b.componentId);
    },

    /** Sort and map existing substrate components */
    sortedComponentsFromSubstrate() {
      return this.substrate?.components
        .map((c) => ({ componentId: c.id, parts: c.parts }))
        .sort((a, b) => a.componentId - b.componentId);
    },

    /** Perform the actual update */
    async updateSubstrate(
      metaChanged: boolean,
      componentsChanged: boolean,
      meta: any,
      componentIds: number[],
      parts: Record<number, number>,
    ) {
      const tasks = [];

      if (componentsChanged) {
        tasks.push(
          this.saveSubstrateComponents(
            this.substrate?.id || -1,
            this.sortedComponents(componentIds, parts),
          ),
        );
      }

      if (metaChanged) {
        tasks.push(
          this.saveSubstrate(this.substrate?.id || -1, {
            name: meta.name,
            isPublic: meta.isPublic,
          }),
        );
      }

      await Promise.all(tasks);

      const toastKey =
        metaChanged && componentsChanged
          ? "substrate.updated_both"
          : componentsChanged
            ? "substrate.components_updated"
            : "substrate.updated";

      ToastService.showSuccess({ key: toastKey });
    },
    async handleSubstrateDelete(id: number) {
      try {
        this.isSubmitting = true;
        await this.removeSubstrate(id);
        ToastService.showSuccess({ key: "substrate.deleted" });
        this.showEditModal = false;
        this.$router.replace({ name: "substrate-overview" });
      } catch (error) {
        // handleRequest has already shown the error toast.
        console.error("Substrate delete failed:", error);
      } finally {
        this.isSubmitting = false;
      }
    },

    async onImageUpload(fileItem: any) {
      if (!this.substrate) return;
      try {
        this.isLoading = true;
        // The store refreshes this substrate itself; the page re-renders from it.
        await this.uploadSubstrateImage(this.substrate.id, fileItem.file, fileItem.date);
        this.showUploadModal = false;
      } catch (error) {
        console.error("Error uploading image:", error);
      } finally {
        this.isLoading = false;
      }
    },
  },
});
</script>

<style scoped>
.detail-column {
  width: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
  padding-bottom: var(--space-6);
}

.detail-body {
  padding: var(--space-5) var(--space-4) 0;
}
</style>
