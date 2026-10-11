# Design system and shared UI

The look of the app lives in tokens and a small set of shared components. Screens compose them; they do
not restyle Ionic controls on their own.

## Tokens

`src/theme/variables.css` remaps Ionic's color roles to the botanical palette and defines everything else
screens read:

| Group | Tokens |
|-------|--------|
| Roles | `--ion-color-primary` (leaf green: brand, primary actions), `secondary` (fired clay: overdue only), `tertiary` (water teal: watering), `danger` (brick), `medium` (sage), `dark` (moss ink) |
| Surfaces and ink | `--ion-background-color`, `--surface-raised`, `--surface-sunken`, `--ink-soft`, `--line`, `--focus-ring`, `--water-wash`, `--clay-wash`, `--leaf-wash`, `--danger-wash`, `--offline-bg`, `--chrome-bg`, `--nav-idle`, `--control-border` (3:1 control outline) |
| Semantic roles | `--water`, `--feed-organic` and `--feed-mineral` (fertilizer kinds, each with a `-contrast` ink), `--new` with `--new-ink` (the "new" pill), `--overdue-ink`, `--z-banner` |
| Placeholder tints | `--tint-1` to `--tint-5`, `--tint-ink` |
| Charts | `--series-1` to `--series-5` (non-role series, 4.3:1 on `--surface-raised`), `--chart-text-color`, `--chart-grid-color`, `--chart-line-color`, `--chart-fill-color` |
| Type | `--font-display` (Bricolage Grotesque), `--font-body` (Figtree), `--text-xs` to `--text-2xl`; fonts are self-hosted through `@fontsource-variable` (`theme/fonts.ts`) |
| Space and shape | `--space-1` to `--space-7`, `--radius-sm|md|lg|pill`, `--shadow-card`, `--shadow-lift`, `--tap-min` (44px), `--content-max`, `--ease-out` |

Use tokens only: no hex colors or inline style attributes in components. `custom.css` carries the global
typography, focus ring, selection color, reduced-motion rule and the Ionic control defaults;
`scrollbar.css` themes the scrollbars from tokens.

### Role grammar

Each color role has one job. Never swap them to decorate.

| Meaning | Token | Shown as |
|---------|-------|----------|
| Watering, due, watered day | `--water` (teal), `--water-wash` | due chip, Water now, watering band, public chip |
| Overdue | `--ion-color-secondary`, `--overdue-ink` for text, `--clay-wash` | overdue chip and status line, nothing else |
| Organic fertilizer | `--feed-organic` (bark brown) | solid ring on the calendar, filled chip |
| Mineral fertilizer | `--feed-mineral` (violet) | dashed ring on the calendar, filled chip |
| New | `--new` with `--new-ink` (sun) | "new" pill and the Sales tab badge |
| Error | `--ion-color-danger`, `--danger-wash` | error banners, invalid fields |
| Degraded | `--ion-color-warning` as a fill only | never as text |
| Ok (admin sources) | `--leaf-wash` with ink and a check icon | quiet badge; only failing and degraded carry saturated color |
| Offline | `--offline-bg` (neutral, `--surface-sunken`) | banner with a cloud icon |
| Brand, action, selected | `--ion-color-primary` | buttons, selected tab |

Fertilizer kinds differ by color and by ring style (solid versus dashed), so the distinction does not
depend on color alone. Chart series that are not roles use `--series-1` to `--series-5`, never a role
color.

### Focus ring

Keyboard focus is a 3px `--focus-ring` outline with a 2px offset. It is applied to `:focus-visible` and
to Ionic's `.ion-focused` class on `ion-button`, `ion-tab-button`, `ion-segment-button`, `ion-select`,
`ion-menu-button`, `ion-back-button` and `ion-fab-button` (Ionic keeps focus on a shadow part, so the class
is the hook). Solid and fab buttons add a 2px page-colored `box-shadow` inside the ring so it reads
against a teal fill. `tests/themeCss.test.ts` asserts each control is covered.

### Contrast rules

Text pairs meet 4.5:1 and UI parts (control edges, focus ring, marker rings, chart series) meet 3:1 in
both themes. `tests/themeTokens.test.ts` asserts the measured ratios of the semantic pairs for light and
dark, so a token change that breaks a pair fails the test. `utils/contrast.ts` provides `contrastRatio`,
`readableInk` and `ensureContrast` for colors only known at runtime. Controls use `--control-border`
(3:1) instead of `--line`; `--nav-idle` is the idle navigation ink.

### User-picked colors

Category colors are chosen by the user and may fail contrast. They are corrected when drawn, never when
stored: `resolveCategoryColors(category, { fallback, page })` in `utils/categoryColors.ts` lifts the
background to 3:1 against the page (`ensureContrast`) and derives the ink with `contrastTextColor`; a
stored `textColor` is ignored. An empty background resolves to the role token passed as `fallback`. The
calendar and its legend resolve on every render and when the theme changes.

### Raised headers

Headers, toolbars and the tab bar use the raised surface (`--chrome-bg`: white in light, `#14221a` in
dark), not a full-width primary slab. `setDarkMode()` reads `--chrome-bg` for the browser `theme-color`,
so the browser chrome matches the header.

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
| `OfflineBanner` | Polite offline and back-online notice mounted in `App.vue`, fixed at `--z-banner` and pushing the page down through `--offline-h` |

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

Plants, Substrates, Components and Sales are the bottom tabs (the Components tab reads "Zutaten"
in German; Sales shows the count of new sales as a badge; the debug tab exists in development only). Tab
labels are length-capped so the German bar fits at 360px. The side menu holds account, admin tools (admins),
reminders (opened in a dialog), settings and log out (the only place for it); from 992px it is a persistent split pane, `--menu-width` wide (264px), that
collapses to an icon rail of `--menu-rail-width` (72px) with the toggle at its foot; the choice is remembered. Old
`/sales` urls redirect to `/tabs/sales`. The watering round is a sub page of Plants (`/tabs/plants/water`, with a back button; the Plants tab stays selected), reached from the "Gießrunde" button in the private segment; `/tabs/water` and `/water` redirect to it. A logged-out visit redirects to login with `?redirect=` and login honors it for same-app
paths only.

## PWA and offline

The service worker (`vite-plugin-pwa`, registered by `pwa.ts` in production builds only) precaches the
built assets, falls back to `index.html` for navigation and caches `/uploads/` images. Authenticated API
responses are never cached by the service worker; offline reads come from the per-account L2 storage.
`clearRuntimeCaches()` runs on logout. The manifest is `public/favicons/manifest.json`.

## Local development

`node scripts/dev-up.mjs --id <name>` starts an isolated stack with mock data (see the repository
`CLAUDE.md`); `?devToken=` signs the dev app in (development builds only, captured in `src/devToken.ts`).

## Calendar

Calendar days are 44px tall, and a single tap on an empty day opens the add dialog for that date. The day
cell is a seventh of the calendar wide, which can fall under 44px on narrow phones, and the number disc
inside it is 36px. This is a deliberate exception to the 44px rule: the grid cannot widen without
scrolling sideways, and the whole cell stays the tap target.

## Undo

Undo toasts last `UNDO_TOAST_MS` (10 seconds, `utils/undo.ts`). Persistent toasts are not used: a toast
that never closes blocks the global toast queue, so errors and confirmations would wait behind it. A whole
watering round can still be reverted for five minutes from the "last round" row on the water screen.
