import { createRouter, createWebHashHistory } from "@ionic/vue-router";
import { RouteRecordRaw } from "vue-router";

import Utils from "@/utils/utils";
import UserService from "@/services/UserService";

// Dynamic imports for lazy loading
const Login = () => import("@/views/Login.vue");
const TabsPage = () => import("@/views/TabsPage.vue");
const Profile = () => import("@/views/Profile.vue");

const PlantOverview = () => import("@/views/plants/PlantOverview.vue");
const PlantDetails = () => import("@/views/plants/PlantDetails.vue");

const SubstrateOverview = () =>
  import("@/views/substrates/SubstrateOverview.vue");
const SubstrateDetails = () =>
  import("@/views/substrates/SubstrateDetails.vue");

const ComponentOverview = () =>
  import("@/views/components/ComponentOverview.vue");
const ComponentDetails = () =>
  import("@/views/components/ComponentDetails.vue");

const authMeta = { requiresAuth: true };

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    redirect: "/login",
  },
  {
    path: "/login",
    name: "login",
    component: Login,
    meta: authMeta,
  },
  {
    path: "/profile",
    name: "profile",
    component: Profile,
    meta: authMeta,
  },
  {
    path: "/tabs",
    component: TabsPage,
    children: [
      {
        name: "plant-overview",
        path: "plants/overview",
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
    const isAuthed = await UserService.isAuthenticated();

    if (to.meta.requiresAuth && !isAuthed) {
      return next({ name: "login" });
    }

    next();
  } catch (error) {
    console.error("Auth check failed:", error);
    next({ name: "login" });
  }
});

export default router;
