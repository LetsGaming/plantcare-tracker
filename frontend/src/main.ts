import { createApp, ref } from 'vue';
import App from './App.vue';
import router from './router';
import { IonicVue } from '@ionic/vue';
import AuthUtils from '@/utils/authUtils';

/* Core CSS required for Ionic components */
import '@ionic/vue/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';

/* Optional CSS utils */
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';

/* Dark mode */
import '@ionic/vue/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';
import './theme/custom.css';
import './theme/scrollbar.css';

async function initializeApp() {
  // Create the Vue app with IonicVue and the router
  const app = createApp(App).use(IonicVue).use(router);

  // Create global reactive state for roles
  const isAdmin = ref(false);
  const isGuest = ref(false);

  try {
    // Fetch both role statuses concurrently
    const [adminStatus, guestStatus] = await Promise.all([
      AuthUtils.isAdmin(),
      AuthUtils.isGuest(),
    ]);
    isAdmin.value = adminStatus;
    isGuest.value = guestStatus;
  } catch (error) {
    console.error('Error fetching role statuses:', error);
  }

  // Provide roles globally
  app.provide('isAdmin', isAdmin);
  app.provide('isGuest', isGuest);

  // Wait until the router is ready before mounting the app
  await router.isReady();
  app.mount('#app');
}

initializeApp();
