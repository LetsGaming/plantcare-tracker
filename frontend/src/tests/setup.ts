import { afterEach } from "vitest";
import { cancelPendingPersistence } from "./helpers";

afterEach(() => {
  cancelPendingPersistence();
});
