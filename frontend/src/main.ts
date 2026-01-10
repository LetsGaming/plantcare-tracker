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
import localizationService from '@/services/general/LocalizationService'

// register locale loaders (lazy-loaded bundles)
// Auto-register locale loaders from the `src/locales` directory.
// Uses Vite's `import.meta.glob` to keep bundles lazy and maintainable.
const localeLoaders = import.meta.glob('./locales/*.{ts,js}');
for (const p in localeLoaders) {
  const m = localeLoaders[p] as () => Promise<any>;
  const match = p.match(/\.\/locales\/([^\.\/]+)\./);
  if (!match) continue;
  const localeKey = match[1];
  localizationService.registerLoader(localeKey, () => m().then((mod) => mod.default));
}

async function initializeApp() {
  document.title = Utils.getAppTitle();

  // Create the Vue app with IonicVue and the router
  const app = createApp(App).use(IonicVue).use(router);

  // Wait until the router is ready before mounting the app
  await router.isReady();
  // Ensure current locale bundle is loaded before mount (best-effort)
  try {
    await localizationService.resolveInitialLocale();
  } catch (_) {}
  app.mount("#app");
}

initializeApp();
