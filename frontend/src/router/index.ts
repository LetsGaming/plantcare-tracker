import { createRouter, createWebHistory } from "@ionic/vue-router";
import { RouteRecordRaw } from "vue-router";

import AuthUtils from "@/utils/authUtils";

// Dynamic imports for lazy loading
const Login = () => import("@/views/Login.vue");
const TabsPage = () => import("@/views/TabsPage.vue");
const WrapperComponent = () => import("@/views/WrapperComponent.vue");
const PlantOverview = () => import("@/views/plants/PlantOverview.vue");
const PlantDetails = () => import("@/views/plants/PlantDetails.vue");
const PlantAdding = () => import("@/views/plants/PlantAdding.vue");
const SubstrateOverview = () => import("@/views/substrates/SubstrateOverview.vue");
const SubstrateDetails = () => import("@/views/substrates/SubstrateDetails.vue");

// Helper function to create children routes with the same structure
const createChildRoutes = (basePath: string, overviewComponent: any, detailsComponent: any, detailsName: string) => [
  {
    path: "overview",
    name: `${basePath}-overview`,
    component: overviewComponent,
    meta: { requiresAuth: true },
  },
  {
    path: `:id`,
    name: detailsName,
    component: detailsComponent,
    props: true,
    meta: { requiresAuth: true },
  },
];

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    redirect: "/login",
  },
  {
    path: "/login",
    name: "Login",
    component: Login,
    meta: { requiresAuth: false },
  },
  {
    path: "/tabs",
    component: TabsPage,
    children: [
      {
        path: "plants",
        redirect: { name: "plant-overview" },
        component: WrapperComponent,
        children: [
          ...createChildRoutes("plant", PlantOverview, PlantDetails, "plant"),
          {
            path: "adding",
            name: "plant-adding",
            component: PlantAdding,
            meta: { requiresAuth: true },
          },
        ],
      },
      {
        path: "substrates",
        redirect: { name: "substrate-overview" },
        component: WrapperComponent,
        children: createChildRoutes("substrate", SubstrateOverview, SubstrateDetails, "substrate"),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Global navigation guard
router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth && !AuthUtils.isAuthenticated()) {
    return next({ name: "Login" });
  }
  next();
});

export default router;
