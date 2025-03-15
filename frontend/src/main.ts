import { createApp, ref } from "vue";
import App from "./App.vue";
import router from "./router";
import { IonicVue } from "@ionic/vue";

/* Core CSS required for Ionic components */
import "@ionic/vue/css/core.css";

/* Basic CSS for apps built with Ionic */
import "@ionic/vue/css/normalize.css";
import "@ionic/vue/css/structure.css";
import "@ionic/vue/css/typography.css";

/* Optional CSS utils */
import "@ionic/vue/css/padding.css";
import "@ionic/vue/css/float-elements.css";
import "@ionic/vue/css/text-alignment.css";
import "@ionic/vue/css/text-transformation.css";
import "@ionic/vue/css/flex-utils.css";
import "@ionic/vue/css/display.css";

/* Dark mode */
import "@ionic/vue/css/palettes/dark.class.css";

/* Theme variables */
import "./theme/variables.css";
import "./theme/custom.css";
import "./theme/scrollbar.css";
import Utils from "./utils/utils";

async function initializeApp() {
  document.title = Utils.getAppTitle();

  // Create the Vue app with IonicVue and the router
  const app = createApp(App).use(IonicVue).use(router);

  // Wait until the router is ready before mounting the app
  await router.isReady();
  app.mount("#app");
}

initializeApp();
