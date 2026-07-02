/**
 * core/middleware/asyncHandler.ts
 *
 * Thin re-export of express-async-handler (already a dependency).
 *
 * Every controller handler used to open with `try {` and close with
 * `} catch (err) { next(err); }` — pure noise that also risked being
 * forgotten on new routes. Wrapping handlers in asyncHandler forwards
 * any rejection to the global error handler automatically, so handler
 * bodies contain only the happy path.
 *
 * Note on Express 5: the framework forwards rejected promises from
 * route handlers on its own, but the wrapper is kept deliberately —
 * it makes the intent explicit, keeps parity for any non-route usage,
 * and costs nothing.
 */

import expressAsyncHandler from 'express-async-handler';

export const asyncHandler = expressAsyncHandler;
