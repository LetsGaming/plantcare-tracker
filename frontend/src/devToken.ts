/**
 * Development only: scripts/dev-up.mjs opens the app with `?devToken=` to sign in without the
 * login screen. The hash router rewrites the url when it is created, so the value is captured
 * here, in a module main.ts imports before the router.
 */
export const devToken: string | null = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get("devToken")
  : null;
