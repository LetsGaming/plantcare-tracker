import { onBeforeUnmount, ref, watch } from "vue";

/** Ionic re-parents a dismissed inline overlay shortly after didDismiss; unmount only after that. */
const SETTLE_MS = 50;

/**
 * Keeps an overlay out of the DOM while it is closed. `mounted` turns on as soon
 * as the overlay opens and turns off once it has been dismissed and the parent
 * has set `isOpen` back to false, whichever of the two happens last.
 */
export const useMountWhileOpen = (isOpen: () => boolean) => {
  const mounted = ref(isOpen());
  let dismissed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const unmountSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!isOpen()) mounted.value = false;
    }, SETTLE_MS);
  };

  watch(isOpen, (open) => {
    if (open) {
      clearTimeout(timer);
      dismissed = false;
      mounted.value = true;
    } else if (dismissed) {
      unmountSoon();
    }
  });

  const release = () => {
    if (isOpen()) dismissed = true;
    else unmountSoon();
  };

  onBeforeUnmount(() => clearTimeout(timer));

  return { mounted, release };
};
