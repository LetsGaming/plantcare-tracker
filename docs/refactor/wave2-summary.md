# Wave 2 summary: frontend redesign

Input: the UX audit (`wave2-ux-audit.md`, about 140 findings) and the design critique (17/40, specificity
1/4, a generic Ionic starter). Direction: warm and botanical, watering as the hero, every state tells the
user what to do next. Visual system: `DESIGN.md`; implementation notes: `frontend/docs/design-system.md`.

## What changed

| Area | Result |
|------|--------|
| Identity | Leaf, clay and water-teal palette on a sage-white (light) or moss-black (dark) ground; Bricolage Grotesque headings, Figtree body, both self-hosted; plant-tag cards; authored botanical placeholders replace broken-image glyphs |
| Dark mode | One mechanism: the `ion-palette-dark` class, applied before mount; no OS media queries |
| Plant detail | Watering first: status band with "Jetzt gießen" (optimistic, Undo), photos, calendar with shape plus color markers, substrate, care guide with an inline error and retry |
| Lists | Tag cards, per-plant watering line and Zum Gießen / Überfällig chip, thirstiest first, search, loading, empty, error and no-result states with the next action |
| States | `StateBlock` for loading, empty, error and not found on every list and detail; detail screens refetch on entry and support pull to refresh; editability follows ownership, not the url |
| Forms | Real forms, inline validation with asterisks, outlined fields, input modes, discard guard, no reset on a failed save, typed confirmation for account deletion, Login with redirect, distinct errors, upload validation |
| Feedback | Failure toasts always resolved and localized, deduped, with Retry where possible; one toast per failure |
| Navigation | Sales is a tab (new-count badge); persistent side menu with navigation from 992px; admin tools and logout in the menu; logout and delete confirmed; deep links and back targets fixed |
| Accessibility | Every icon-only control is a named 44px `IconButton`; zoom allowed; primary contrast 6.5:1; reduced motion; one outline icon family; German and English parity |
| PWA and performance | Service worker (precache, navigation fallback, `/uploads/` images; never authenticated API responses; caches cleared on logout), offline banner, maskable icons, legacy build removed (dist 4.97 MB to 3.2 MB), vendor chunks, 494 KB placeholder removed |
| Developer tooling | `scripts/dev-up.mjs` and `dev-down.mjs`: isolated stack with mock shops, mock AI guide and seeded data |

## Fixed on the way

- Backend: `@fastify/cors` v11 defaults to GET, HEAD and POST, so cross-origin PUT, PATCH and DELETE
  preflights were rejected after the Fastify migration (the old Express setup allowed them). The methods
  are now explicit and a contract test sends preflights.
- Image edit sent no replacement file (the form wrote `image`, the submit read `file`); substrate edit
  offered an image field nothing uploaded; account deletion was unreachable; the failure toast printed a
  literal `{action}`.

## Verification

Backend 572 tests, lint, typecheck, build. Frontend 357 tests (391 after round 2), lint (0 errors), vue-tsc,
build. Detector clean on views, components and `index.html`. An independent finish review (screenshots at
390 and 1440, light and dark) scored the eight material findings of its first pass resolved and shipped the
build.

## Round 2: modals, admin screens and the Sales list

A second critique of these three areas scored 24/40 (authored shell, Ionic-default interior). Fixes, shipped
by an independent finish review:

- One dialog system (typed confirmation for account deletion, consequences named, Undo for watering record
  deletes) and one field shell for every form field; one modal header; edit and add forms match; substrate
  wizard with steps; reminders explain a missing category and link to its settings.
- Admin: named recheck buttons, the recheck result shown inline (a failing source is a result, not an error),
  status strip with failing first, "Alle prüfen", technical details disclosure, dashboard merged with the
  health overview, refresh failure banner.
- Sales list: price and discount on cards, header count of new items, mark-all hidden when nothing is new,
  muted placeholder tiles, capped desktop hero, price history hint. The NEU pill rule stays: every unseen item
  keeps its pill (owner decision).
- German copy: enum labels, plurals and number formats, one `du` voice, one date formatter, localized Ionic
  defaults; dark-mode scrollbars; 44px targets.
- Seed data now covers every watering state, a second public owner and link-search source health, so each
  feature can be tested (see `CLAUDE.md`).

## Not covered or open

- Not captured in the final reviews: the Sales stream loading state, the admin refresh-failure banner,
  component edit and delete as admin, desktop dark passes beyond one modal.
- The delete dialog and the Undo toast overlap in one capture, probably the dismiss animation; not confirmed.
- The tag has no paper or paint texture (flat vector). Water motion has no dark-mode capture.
- The "gerade eben" wording for times under ten seconds is covered by a unit test only.
