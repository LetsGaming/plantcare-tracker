import { createPinia, type Pinia, type Store } from "pinia";
import { l2Persistence } from "./persistence";

/** Every store created on the app's pinia, so a logout can reset them all. */
const liveStores = new Set<Store>();

/** Creates the app's pinia; tests build their own with `createTestingPinia`. */
export const createAppPinia = (): Pinia => {
  const pinia = createPinia();
  pinia.use(l2Persistence);
  pinia.use(({ store }) => {
    liveStores.add(store);
  });
  return pinia;
};

/** Returns every store to its initial state (called when a session ends). */
export const resetAllStores = (): void => {
  for (const store of liveStores) store.$reset();
};

export const pinia = createAppPinia();
