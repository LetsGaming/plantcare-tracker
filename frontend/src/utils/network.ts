import { reactive } from "vue";

export interface NetworkState {
  online: boolean;
}

export const networkState = reactive<NetworkState>({
  online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
});

export function setOnline(value: boolean): void {
  networkState.online = value;
}

/** Subscribes to browser connectivity events; returns the unsubscribe function. */
export function watchConnectivity(target: Window = window): () => void {
  const goOnline = () => setOnline(true);
  const goOffline = () => setOnline(false);
  target.addEventListener("online", goOnline);
  target.addEventListener("offline", goOffline);
  setOnline(target.navigator.onLine !== false);
  return () => {
    target.removeEventListener("online", goOnline);
    target.removeEventListener("offline", goOffline);
  };
}
