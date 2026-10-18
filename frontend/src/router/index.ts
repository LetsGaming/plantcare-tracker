import { createRouter, createWebHashHistory } from "@ionic/vue-router";
import { RouteRecordRaw } from "vue-router";

import Utils from "@/utils/utils";
import { isDevelopment } from "@/utils/devMode";
import { pinia } from "@/stores/pinia";
import { useSessionStore } from "@/stores/session";
import ToastService from "@/services/general/ToastService";
import { resolveAccess } from "./guards";
import { updateDocumentTitle } from "@/utils/pageTitle";

// Dynamic imports for lazy loading
const Login = () => import("@/views/Login.vue");
const TabsPage = () => import("@/views/TabsPage.vue");
const Profile = () => import("@/views/Profile.vue");
const NotFound = () => import("@/views/NotFound.vue");

const PlantOverview = () => import("@/views/plants/PlantOverview.vue");
const PlantDetails = () => import("@/views/plants/PlantDetails.vue");

const WaterRound = () => import("@/views/water/WaterRound.vue");

const SubstrateOverview = () => import("@/views/substrates/SubstrateOverview.vue");
const SubstrateDetails = () => import("@/views/substrates/SubstrateDetails.vue");

const ComponentOverview = () => import("@/views/components/ComponentOverview.vue");
const ComponentDetails = () => import("@/views/components/ComponentDetails.vue");

const SalesOverview = () => import("@/views/sales/SalesOverview.vue");
const SalesDetails = () => import("@/views/sales/SalesDetails.vue");

const AdminDashboard = () => import("@/views/admin/AdminDashboard.vue");
const ScraperHealth = () => import("@/views/admin/ScraperHealth.vue");

const Debug = () => import("@/views/Debug.vue");

const authMeta = { requiresAuth: true };
const adminMeta = { requiresAuth: true, requiresAdmin: true };
const titled = (titleKey: string, base: Record<string, unknown> = authMeta) => ({
  ...base,
  titleKey,
});

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    redirect: "/login",
  },
  {
    path: "/login",
    name: "login",
    component: Login,
    meta: titled("login2.heading_login", { requiresAuth: false }),
  },
  {
    path: "/profile",
    name: "profile",
    component: Profile,
    meta: titled("profile.title"),
  },
  { path: "/water", redirect: "/tabs/plants/water" },
  { path: "/sales", redirect: "/tabs/sales" },
  { path: "/sales/details/:id", redirect: (to) => `/tabs/sales/details/${to.params.id}` },
  {
    path: "/:catchAll(.*)",
    name: "not-found",
    component: NotFound,
    meta: titled("state.not_found_title", { requiresAuth: false }),
  },

  {
    path: "/tabs",
    component: TabsPage,
    name: "tabs",
    redirect: "/tabs/plants",
    children: [
      // The debug tools exist only in development builds.
      ...(isDevelopment
        ? [{ name: "debug", path: "debug", meta: titled("tabs.debug"), component: Debug }]
        : []),
      {
        name: "plant-overview",
        path: "plants",
        meta: titled("plants.title"),
        component: PlantOverview,
      },
      {
        name: "water-round",
        path: "plants/water",
        meta: titled("water.title"),
        component: WaterRound,
      },
      { path: "water", redirect: "/tabs/plants/water" },
      {
        name: "plant-details",
        path: "plants/details/:id/:public",
        meta: titled("page.plant_details"),
        props: true,
        component: PlantDetails,
      },
      {
        name: "substrate-overview",
        path: "substrates",
        meta: titled("substrate.title"),
        component: SubstrateOverview,
      },
      {
        name: "substrate-details",
        path: "substrates/details/:id/:public",
        meta: titled("page.substrate_details"),
        props: true,
        component: SubstrateDetails,
      },
      {
        name: "component-overview",
        path: "components",
        meta: titled("components.title"),
        component: ComponentOverview,
      },
      {
        name: "component-details",
        path: "components/details/:id/:public",
        meta: titled("component.details.title"),
        props: true,
        component: ComponentDetails,
      },
      {
        path: "sales",
        name: "sales",
        component: SalesOverview,
        meta: titled("sales.title"),
      },
      {
        name: "sales-details",
        path: "sales/details/:id",
        meta: titled("sales.details.title"),
        props: true,
        component: SalesDetails,
      },
      {
        name: "admin-dashboard",
        path: "admin",
        meta: titled("admin.title", adminMeta),
        component: AdminDashboard,
      },
      {
        name: "admin-scrapers",
        path: "admin/scrapers",
        meta: titled("admin.scrapers.title", adminMeta),
        component: ScraperHealth,
      },
      {
        name: "tabs-not-found",
        path: ":catchAll(.*)",
        meta: titled("state.not_found_title"),
        component: NotFound,
      },
    ],
  },
];

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
});

// Global navigation guard
router.beforeEach(async (to, from, next) => {
  await Utils.closeAllOpenModals();

  try {
    const session = useSessionStore(pinia);
    const decision = await resolveAccess(
      {
        requiresAuth: to.meta.requiresAuth === true,
        requiresAdmin: to.meta.requiresAdmin === true,
      },
      {
        isAuthenticated: () => session.ensureAuthenticated(),
        isAdmin: async () => session.isAdmin,
      },
    );

    if (decision === "login") {
      return next({ name: "login", query: { redirect: to.fullPath } });
    }
    if (decision === "home") {
      ToastService.showWarning({ key: "admin.no_access" });
      return next({ name: "plant-overview" });
    }

    next();
  } catch (error) {
    console.error("Auth check failed:", error);
    next({ name: "login", query: { redirect: to.fullPath } });
  }
});

router.afterEach((to) => updateDocumentTitle(to));

export default router;
