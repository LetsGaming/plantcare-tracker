import { createRouter, createWebHistory } from "@ionic/vue-router";
import { RouteRecordRaw } from "vue-router";

import AuthUtils from "@/utils/authUtils";

import Login from "@/views/Login.vue";
import TabsPage from "@/views/TabsPage.vue";
import PlantMain from "@/views/plants/PlantMain.vue";
import PlantOverview from "@/views/plants/PlantOverview.vue";
import PlantDetails from "@/views/plants/PlantDetails.vue";
import PlantAdding from "@/views/plants/PlantAdding.vue";

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
        component: PlantMain,
        children: [
          {
            name: "plant-overview",
            path: "overview",
            component: PlantOverview,
          },
          {
            name: "plant",
            path: "plant/:id",
            component: PlantDetails,
            props: true,
          },
          {
            name: "plant-adding",
            path: "adding",
            component: PlantAdding,
          },
        ],
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Add global navigation guards if needed
router.beforeEach((to, from, next) => {
  // Example guard
  if (to.meta.requiresAuth && !AuthUtils.isAuthenticated()) {
    next({ name: 'Login' });
  } else {
    next();
  }
});

export default router;
