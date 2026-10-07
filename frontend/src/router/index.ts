import { createRouter, createWebHashHistory } from "@ionic/vue-router";
import { RouteRecordRaw } from "vue-router";

import Utils from "@/utils/utils";
import { pinia } from "@/stores/pinia";
import { useSessionStore } from "@/stores/session";
import { resolveAccess } from "./guards";

// Dynamic imports for lazy loading
const Login = () => import("@/views/Login.vue");
const TabsPage = () => import("@/views/TabsPage.vue");
const Profile = () => import("@/views/Profile.vue");
const NotFound = () => import("@/views/NotFound.vue");

const PlantOverview = () => import("@/views/plants/PlantOverview.vue");
const PlantDetails = () => import("@/views/plants/PlantDetails.vue");

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

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    redirect: "/login",
  },
  {
    path: "/login",
    name: "login",
    component: Login,
    meta: { requiresAuth: false },
  },
  {
    path: "/profile",
    name: "profile",
    component: Profile,
    meta: authMeta,
  },
  {
    path: "/:catchAll(.*)",
    name: "not-found",
    component: NotFound,
    meta: { requiresAuth: false },
  },

  {
    path: "/tabs",
    component: TabsPage,
    name: "tabs",
    redirect: "/tabs/plants",
    children: [
      {
        name: "debug",
        path: "debug",
        meta: authMeta,
        component: Debug,
      },
      {
        name: "plant-overview",
        path: "plants",
        meta: authMeta,
        component: PlantOverview,
      },
      {
        name: "plant-details",
        path: "plants/details/:id/:public",
        meta: authMeta,
        props: true,
        component: PlantDetails,
      },
      {
        name: "substrate-overview",
        path: "substrates",
        meta: authMeta,
        component: SubstrateOverview,
      },
      {
        name: "substrate-details",
        path: "substrates/details/:id/:public",
        meta: authMeta,
        props: true,
        component: SubstrateDetails,
      },
      {
        name: "component-overview",
        path: "components",
        meta: authMeta,
        component: ComponentOverview,
      },
      {
        name: "component-details",
        path: "components/details/:id/:public",
        meta: authMeta,
        props: true,
        component: ComponentDetails,
      },
      {
        path: "/sales",
        name: "sales",
        component: SalesOverview,
        meta: authMeta,
      },
      {
        name: "sales-details",
        path: "/sales/details/:id",
        meta: authMeta,
        props: true,
        component: SalesDetails,
      },
      {
        name: "admin-dashboard",
        path: "admin",
        meta: adminMeta,
        component: AdminDashboard,
      },
      {
        name: "admin-scrapers",
        path: "admin/scrapers",
        meta: adminMeta,
        component: ScraperHealth,
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

    if (decision === "login") return next({ name: "login" });
    if (decision === "home") return next({ name: "plant-overview" });

    next();
  } catch (error) {
    console.error("Auth check failed:", error);
    next({ name: "login" });
  }
});

export default router;
