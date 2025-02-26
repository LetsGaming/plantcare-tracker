import { createRouter, createWebHistory } from "@ionic/vue-router";
import { RouteRecordRaw } from "vue-router";

import AuthUtils from "@/utils/authUtils";
import Utils from "@/utils/utils";

// Dynamic imports for lazy loading
const Login = () => import("@/views/Login.vue");
const TabsPage = () => import("@/views/TabsPage.vue");
const WrapperComponent = () => import("@/views/WrapperComponent.vue");

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

// Helper function to create children routes with the same structure
const createChildRoutes = (
  basePath: string,
  overviewComponent: any,
  detailsComponent: any,
) => {
  const routes = [
    {
      path: "overview",
      name: `${basePath}-overview`,
      component: overviewComponent,
    },
    {
      path: `${basePath}/:id/:public`,
      name: basePath,
      component: detailsComponent,
      props: true,
    },
  ];

  return routes.map((route) => ({
    ...route,
    meta: { requiresAuth: true },
  }));
};

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
    path: "/tabs",
    component: TabsPage,
    children: [
      {
        path: "plants",
        redirect: { name: "plant-overview" },
        component: WrapperComponent,
        children: createChildRoutes(
          "plant",
          PlantOverview,
          PlantDetails,
        ),
      },
      {
        path: "substrates",
        redirect: { name: "substrate-overview" },
        component: WrapperComponent,
        children: createChildRoutes(
          "substrate",
          SubstrateOverview,
          SubstrateDetails,
        ),
      },
      {
        path: "components",
        redirect: { name: "component-overview" },
        component: WrapperComponent,
        children: createChildRoutes(
          "component",
          ComponentOverview,
          ComponentDetails,
        ),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Global navigation guard
router.beforeEach(async (to, from, next) => {
  await Utils.closeAllOpenModals();

  const isAuthed = await AuthUtils.isAuthenticated();
  if (to.meta.requiresAuth && !isAuthed) {
    return next({ name: "login" });
  }
  next();
});

export default router;
