# Design system and shared UI

The look of the app lives in tokens and a small set of shared components. Screens compose them; they do
not restyle Ionic controls on their own.

## Tokens

`src/theme/variables.css` remaps Ionic's color roles to the botanical palette and defines everything else
screens read:

| Group | Tokens |
|-------|--------|
| Roles | `--ion-color-primary` (leaf green: brand, primary actions), `secondary` (fired clay: fertilizer, "new"), `tertiary` (water teal: watering), `danger` (brick), `medium` (sage), `dark` (moss ink) |
| Surfaces and ink | `--ion-background-color`, `--surface-raised`, `--surface-sunken`, `--ink-soft`, `--line`, `--focus-ring`, `--water-wash`, `--clay-wash`, `--leaf-wash` |
| Placeholder tints | `--tint-1` to `--tint-5`, `--tint-ink` |
| Charts | `--chart-1` to `--chart-6`, `--chart-text-color`, `--chart-grid-color`, `--chart-line-color`, `--chart-fill-color` |
| Type | `--font-display` (Bricolage Grotesque), `--font-body` (Figtree), `--text-xs` to `--text-2xl`; fonts are self-hosted through `@fontsource-variable` (`theme/fonts.ts`) |
| Space and shape | `--space-1` to `--space-7`, `--radius-sm|md|lg`, `--shadow-card`, `--shadow-lift`, `--tap-min` (44px), `--content-max`, `--ease-out` |

Text pairs meet WCAG AA in both themes (primary on white is 6.5:1). Use tokens only: no hex colors or
inline style attributes in components. `custom.css` carries the global typography, focus ring, selection
color, reduced-motion rule and the Ionic control defaults; `scrollbar.css` themes the scrollbars.

## Dark mode

Dark mode is the `ion-palette-dark` class on `<html>` and nothing else (no `prefers-color-scheme` rules in
the CSS). `theme/darkMode.ts` applies the stored choice, or the system setting when there is none, before
the app mounts, and `setDarkMode()` is the single place that switches it (also updates `theme-color`).
The dark token block uses the selector `:root.ion-palette-dark` so it outranks Ionic's own dark palette.

## Shared components (`src/components/ui`)

| Component | Use |
|-----------|-----|
| `IconButton` | Every icon-only action: named (`label`), 44px, keyboard reachable; emits `press` |
| `StateBlock` | Loading skeleton, empty, error and not-found for lists and details, with an optional action |
| `PlantPlaceholder` | Authored botanical glyphs on a tint keyed to the item, for missing or failed images |
| `DetailHero` | Photo capped at 40vh with the name on a plant tag; used by substrate, component and sales details |
| `PullRefresher` | Pull to refresh that takes a promise-returning handler |
| `OfflineBanner` | Polite, in-flow offline and back-online notice mounted in `App.vue` |

Others: `ProgressiveImage` (low resolution first, then full; placeholder instead of a broken image),
`overview/ItemsOverview` (tag cards, search, states), `ConfirmDialog` (typed confirmation for account
deletion), `FieldError` and `RequiredMark` (form fields).

## Screen states

Every list and detail screen has four states: loading (skeleton), empty (what is missing and the next
action), error (retry) and not found (back to the list). `utils/loadPhase.ts` maps a failed load to
`not-found` for a 404 and `error` otherwise. Detail screens start in `loading`, refetch in
`ionViewWillEnter` while keeping cached data visible, and support pull to refresh.

Whether a plant or substrate is editable follows ownership (`userId` of the item against the session),
not the `public` segment of the url. Guests never see write controls and get a sign-in hint instead.

## Navigation

Plants, Substrates, Components and Sales are the bottom tabs (Sales shows the count of new sales as a
badge; the debug tab exists in development only). The side menu holds account, admin tools (admins),
reminders, settings and log out; from 992px it is a persistent split pane. Old `/sales` urls redirect to
`/tabs/sales`. A logged-out visit redirects to login with `?redirect=` and login honors it for same-app
paths only.

## PWA and offline

The service worker (`vite-plugin-pwa`, registered by `pwa.ts` in production builds only) precaches the
built assets, falls back to `index.html` for navigation and caches `/uploads/` images. Authenticated API
responses are never cached by the service worker; offline reads come from the per-account L2 storage.
`clearRuntimeCaches()` runs on logout. The manifest is `public/favicons/manifest.json`.

## Local development

`node scripts/dev-up.mjs --id <name>` starts an isolated stack with mock data (see the repository
`CLAUDE.md`); `?devToken=` signs the dev app in (development builds only, captured in `src/devToken.ts`).
