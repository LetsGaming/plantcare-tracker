const open = new Set<EventTarget>();
let listening = false;

const onPresent = (event: Event): void => {
  if (event.target) open.add(event.target);
};
const onDismiss = (event: Event): void => {
  if (event.target) open.delete(event.target);
};

/** Idempotent; called on import so the registry sees every modal from the first one. */
export const startOverlayRegistry = (): void => {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("ionModalDidPresent", onPresent);
  document.addEventListener("ionModalDidDismiss", onDismiss);
};

/** Presented modals still attached to the document; a host removed without a dismiss event does not count. */
export const openOverlayCount = (): number => {
  for (const target of open) {
    if (target instanceof Node && !target.isConnected) open.delete(target);
  }
  return open.size;
};

export const resetOverlayRegistry = (): void => {
  open.clear();
};

startOverlayRegistry();
