<template>
  <ion-page>
    <details-header
      :show-edit-button="isAdmin && !!component"
      @edit-click="showEditingModal = true"
      default-back-href="/tabs/components"
    />
    <ion-content>
      <pull-refresher :handler="refresh" />

      <div v-if="component" class="detail-column">
        <detail-hero
          :title="component.name"
          :image-url="component.imageUrl"
          :image-alt="t('compdetail.image_alt', { name: component.name })"
          kind="component"
        />

        <div class="detail-body">
          <section class="facts" aria-labelledby="component-facts">
            <h2 id="component-facts" class="section-title">
              {{ t("component.details.title") }}
            </h2>
            <dl class="fact-list">
              <div class="fact">
                <dt>{{ t("compdetail.fineness") }}</dt>
                <dd>{{ finenessLabel(component.fineness) }}</dd>
              </div>
            </dl>
          </section>

          <section class="used-in" aria-labelledby="component-used-in">
            <h2 id="component-used-in" class="section-title">{{ t("compdetail.used_in") }}</h2>
            <ul v-if="usingSubstrates.length" class="substrate-list">
              <li v-for="substrate in usingSubstrates" :key="substrate.id">
                <router-link
                  class="substrate-link"
                  :to="{
                    name: 'substrate-details',
                    params: { id: substrate.id, public: substrate.isPublic ? '1' : '0' },
                  }"
                  :aria-label="t('compdetail.open_substrate', { name: substrate.name })"
                >
                  {{ substrate.name }}
                </router-link>
              </li>
            </ul>
            <p v-else class="text-soft">{{ t("compdetail.used_in_none") }}</p>
          </section>
        </div>
      </div>

      <state-block
        v-else-if="phase === 'loading'"
        kind="loading"
        :title="t('compdetail.loading')"
        :skeletons="2"
      />
      <state-block
        v-else-if="phase === 'not-found'"
        kind="not-found"
        placeholder-kind="component"
        :title="t('state.not_found_title')"
        :message="t('state.not_found_message')"
        :action-label="t('state.back_to_list')"
        @action="goToList"
      />
      <state-block
        v-else
        kind="error"
        placeholder-kind="component"
        :title="t('state.error_title')"
        :message="t('state.error_message')"
        :action-label="t('state.retry')"
        @action="reload"
      />

      <component-editing-modal
        v-if="component"
        :is-open="showEditingModal"
        :component="component"
        :is-loading="isEditing"
        @close="showEditingModal = false"
        @save="handleComponentSave"
        @delete="handleComponentDelete"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonContent } from "@ionic/vue";
import DetailsHeader from "@/components/details/DetailsHeader.vue";
import DetailHero from "@/components/ui/DetailHero.vue";
import PullRefresher from "@/components/ui/PullRefresher.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import { LoadPhase, phaseFromError } from "@/utils/loadPhase";
import ComponentEditingModal from "@/components/components/ComponentEditingModal.vue";
import { mapActions, mapState } from "pinia";
import { useComponentsStore } from "@/stores/components";
import { useSubstratesStore } from "@/stores/substrates";
import { useSessionStore } from "@/stores/session";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import { finenessLabel } from "@/utils/enumLabels";

export default defineComponent({
  name: "ComponentDetails",
  components: {
    IonPage,
    IonContent,
    DetailsHeader,
    DetailHero,
    PullRefresher,
    StateBlock,
    ComponentEditingModal,
  },
  props: { id: { type: String, required: true } },
  data() {
    return {
      showEditingModal: false,
      isEditing: false,
      phase: "loading" as LoadPhase,
    };
  },
  async ionViewWillEnter() {
    await this.reload();
  },
  computed: {
    ...mapState(useSessionStore, ["isAdmin"]),
    ...mapState(useComponentsStore, ["byId"]),
    ...mapState(useSubstratesStore, { allSubstrates: "items" }),
    usingSubstrates(): Substrate[] {
      const locale = localizationService.getLocale();
      return this.allSubstrates
        .filter((substrate: Substrate) =>
          substrate.components.some((c) => c.id === this.componentId),
        )
        .sort((a: Substrate, b: Substrate) => a.name.localeCompare(b.name, locale));
    },
    /** This page's component, straight from the store so every update repaints it. */
    component(): Component | null {
      return this.byId(this.componentId) ?? null;
    },
    componentId() {
      return Number(this.id);
    },
  },
  methods: {
    finenessLabel,
    ...mapActions(useComponentsStore, {
      loadComponent: "getComponent",
      saveComponent: "editComponent",
      removeComponent: "deleteComponent",
    }),
    ...mapActions(useSubstratesStore, { ensureSubstratesLoaded: "ensureLoaded" }),
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    async reload(forceUpdate = false) {
      if (!this.component) this.phase = "loading";
      const [componentResult] = await Promise.allSettled([
        this.loadComponent(this.componentId, forceUpdate),
        this.ensureSubstratesLoaded(),
      ]);
      if (componentResult.status === "rejected") {
        this.phase = phaseFromError(componentResult.reason);
        return;
      }
      this.phase = this.component ? "ready" : "not-found";
    },
    refresh() {
      return this.reload(true);
    },
    goToList() {
      this.$router.replace({ name: "component-overview" });
    },
    async handleComponentSave(updated: EditComponent) {
      if (!this.component) return;
      this.isEditing = true;
      try {
        await this.saveComponent(this.component.id, updated);
        this.showEditingModal = false;
        ToastService.showSuccess({
          key: "components.edit.success",
          fallback: "Component edited successfully",
        });
      } catch {
        // The store already reported the failure.
      } finally {
        this.isEditing = false;
      }
    },
    async handleComponentDelete(id: number) {
      this.isEditing = true;
      try {
        await this.removeComponent(id);
        this.showEditingModal = false;
        ToastService.showSuccess({
          key: "components.delete.success",
          fallback: "Component deleted successfully",
        });
        this.$router.replace({ name: "component-overview" });
      } catch {
        // The store already reported the failure.
      } finally {
        this.isEditing = false;
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
  display: grid;
  gap: var(--space-5);
  align-items: start;
}

.section-title {
  margin: 0 0 var(--space-3);
  font-family: var(--font-display);
  font-size: var(--text-lg);
}

.fact-list {
  margin: 0;
}

.fact {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}

.fact dt {
  color: var(--ink-soft);
}

.fact dd {
  margin: 0;
  font-weight: 600;
}

.substrate-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}

.substrate-link {
  display: flex;
  align-items: center;
  min-height: var(--tap-min);
  padding: var(--space-2) var(--space-4);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  color: inherit;
  font-weight: 600;
  text-decoration: none;
  overflow-wrap: anywhere;
}

@media (min-width: 900px) {
  .detail-body {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
