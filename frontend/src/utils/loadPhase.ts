export type LoadPhase = "loading" | "ready" | "error" | "not-found";

/** A missing record is a not-found state; any other failure is an error the user can retry. */
export function phaseFromError(error: unknown): LoadPhase {
  const status = (error as { status?: number } | null)?.status;
  return status === 404 ? "not-found" : "error";
}
