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
const PlantEditing = () => import("@/views/plants/PlantEditing.vue");

const SubstrateOverview = () =>
  import("@/views/substrates/SubstrateOverview.vue");
const SubstrateDetails = () =>
  import("@/views/substrates/SubstrateDetails.vue");
const SubstrateAdding = () => import("@/views/substrates/SubstrateAdding.vue");
const SubstrateEditing = () =>
  import("@/views/substrates/SubstrateEditing.vue");

const ComponentOverview = () =>
  import("@/views/components/ComponentOverview.vue");

// Helper function to create children routes with the same structure
const createChildRoutes = (
  basePath: string,
  overviewComponent: any,
  detailsComponent: any,
  addingComponent: any,
  editingComponent?: any,
  editingPublicCheck: boolean = false
) => {
  const routes = [
    {
      path: "overview",
      name: `${basePath}-overview`,
      component: overviewComponent,
    },
    {
      path: `${basePath}/:id`,
      name: basePath,
      component: detailsComponent,
      props: true,
    },
    {
      path: "adding",
      name: `${basePath}-adding`,
      component: addingComponent,
    },
  ];

  if (editingComponent) {
    let path = "editing/:id";
    if (editingPublicCheck) {
      path = "editing/:id/:isPublic";
    }
    routes.push({
      path: path,
      name: `${basePath}-editing`,
      component: editingComponent,
      props: true,
    });
  }

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
          PlantAdding,
          PlantEditing,
          true
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
          SubstrateAdding,
          SubstrateEditing
        ),
      },
      {
        path: "components",
        redirect: { name: "component-overview" },
        component: WrapperComponent,
        children: createChildRoutes(
          "component",
          ComponentOverview,
          SubstrateDetails,
          SubstrateAdding,
          SubstrateEditing
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
router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth && !AuthUtils.isAuthenticated()) {
    return next({ name: "login" });
  }
  next();
});

export default router;
