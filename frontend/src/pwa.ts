export function registerServiceWorker(): void {
  if (import.meta.env.DEV || typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  void import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}

/** Deletes every Cache Storage entry except the workbox precache. */
export async function clearRuntimeCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(
    names.filter((name) => !name.includes("precache")).map((name) => caches.delete(name)),
  );
}
