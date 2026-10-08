# Wave 2, Phase A: frontend UX audit

Scope: `frontend/src` at the end of Wave 1 (branch `refactor/w1-17-docs-pass`). Static code review only; the app was not run in a browser, so every finding is code-verified but not visually verified. Paths are relative to `frontend/src` unless noted. `views/Debug.vue` is out of scope (development only). No redesign or mockups are part of this phase.

## Summary

| Area | High | Med | Low |
|------|------|-----|-----|
| Navigation and screens (NAV) | 4 | 20 | 11 |
| Forms and feedback (FORM) | 5 | 23 | 9 |
| Accessibility (A11Y) | 4 | 4 | 2 |
| Theme, i18n, responsive, PWA, performance, consistency | 4 | 15 | 12 |

Themes that cut across screens:

1. **Icon-only controls are not controls.** Logout, add, edit, upload, delete and the cards themselves are `ion-icon` or `ion-card` with `@click`: no keyboard access, no names (A11Y-01..03, NAV-21, NAV-28, FORM-19, FORM-20).
2. **States are missing.** Loading shows as empty, errors show as empty, detail pages go blank (NAV-05..07, NAV-10..12, NAV-16, NAV-20).
3. **Forms lose or hide the user's work.** Reset on failure, dismiss without warning, validation only by toast (FORM-05, FORM-09, FORM-12, FORM-31).
4. **Feedback is broken or inconsistent.** A toast that prints `{action}` literally, double toasts, silent saves (FORM-01..04, FORM-37).
5. **Language and tokens leak.** German strings in the English UI, hardcoded colors and px values, dark mode driven by two mechanisms (I18N-01, THEME-01..05).
6. **Wide screens and installability are afterthoughts.** No split pane, no service worker, weak manifest (RESP-01, PWA-01..02).

## Screens and states

| Screen | Loading | Empty | Error | Search / sort | Destructive confirm | Back / deep link |
|--------|---------|-------|-------|---------------|---------------------|------------------|
| Login | spinner (initial) | n/a | toast, always "invalid credentials" | n/a | n/a | no return url |
| Plant overview | none | toast plus text | toast | text search, fixed sort | n/a | n/a |
| Substrate overview | none | toast plus text | toast | text search, fixed sort | n/a | n/a |
| Component overview | none | text only | console only | text search, fixed sort | n/a | n/a |
| Sales overview | flag unused | text only | console only | text search, no sort | n/a | n/a |
| Plant details | flash of "not found" | not-found text | not-found text | n/a | generic dialog, colors inverted | fallback back target broken |
| Substrate details | none | blank | console only | n/a | generic dialog | fallback back target broken |
| Component details | none | blank | console only | n/a | generic dialog | fallback back target broken |
| Sales details | none | blank | console only | n/a | n/a | works |
| Admin, scraper health | none | text | toast | n/a | n/a (recheck is safe) | works |
| Profile | n/a | n/a | toast | n/a | account delete unreachable | `back()` only |
| Not found | n/a | n/a | n/a | n/a | n/a | forces page reload |

Reach (taps): lists 1 (tab bar), details 2, sales 1 (floating button), profile and settings 2, admin 4, scraper health 5, logout 1 with no confirmation.

Roles: guests lose the private segment and all write controls silently; users own private items and cannot edit components; admins add component writes and reach admin tools only through Profile or the warning badge on the Sales button.

## Navigation and screens

| ID | Sev | Where | Finding | Fix |
|----|-----|-------|---------|-----|
| NAV-01 | High | `views/{plants/PlantDetails,substrates/SubstrateDetails,components/ComponentDetails}.vue`, `components/details/DetailsHeader.vue:50` | Callers pass `default-href`, the prop is `defaultBackHref`. On reload or deep link the back button has no target | Rename to `default-back-href` |
| NAV-02 | High | `router/index.ts:160`, `views/Login.vue:298` | Guard sends logged-out users to login with no return url; login always lands on plants | Pass `redirect` query, honor it after login |
| NAV-03 | High | `components/formcomponent/FormComponent.vue:93-99` | Delete dialog: Cancel is red, Delete is blue | Delete `danger`, Cancel neutral |
| NAV-04 | High | `views/Profile.vue:56`, `components/profile/ProfileEditingModal.vue:12` | Account deletion uses the generic "delete ?" dialog; no consequence text, no password step (and unreachable, see FORM-08) | Dedicated confirmation naming the data loss, require password |
| NAV-05 | Med | `views/substrates/SubstrateDetails.vue:12-18,120` | No loading or not-found state, failures only logged | Skeleton, not-found and retry like PlantDetails |
| NAV-06 | Med | `views/components/ComponentDetails.vue:9-27,96-102` | Same blank page; loads in `ionViewDidEnter` | States plus load in `ionViewWillEnter` |
| NAV-07 | Med | `views/plants/PlantDetails.vue:36,126,132` | `isLoading` starts false, first paint says "could not be loaded" | Start true |
| NAV-08 | Med | `views/plants/PlantDetails.vue:39` | Hardcoded German fallback text | Locale key |
| NAV-09 | Med | `views/plants/PlantDetails.vue:132`, `views/substrates/SubstrateDetails.vue:103` | Detail loads once in `mounted`, no refetch on re-entry, no pull to refresh | `ionViewWillEnter` plus refresher |
| NAV-10 | Med | `components/overview/ItemsOverview.vue:37-49,93-97`, `views/sales/SalesOverview.vue:48,88` | Loading looks like "no entries"; `empty-message` and `item-type` props are not declared; `loading` unused | `isLoading` and `emptyMessage` props, skeleton |
| NAV-11 | Med | `views/plants/PlantOverview.vue:105`, `views/substrates/SubstrateOverview.vue:112`, `views/components/ComponentOverview.vue:90` | Empty list triggers a toast, no call to action, guests get no explanation; components show nothing on error | Persistent empty state with CTA |
| NAV-12 | Med | `views/components/ComponentOverview.vue:92`, `views/sales/SalesOverview.vue:90` | Load failure only logged; no retry anywhere | Error state with retry |
| NAV-13 | Med | `components/overview/ItemsOverview.vue:37-49,226`, `components/SearchBar.vue` | Text search only, fixed sort, no "no results for X"; dead clear code | No-results state, sort and filter chips |
| NAV-14 | Med | `views/sales/SalesOverview.vue:8,12-21,98` | `@search` never emitted (dead filter), nested `ion-content`, one-segment control that does nothing | Remove dead wiring |
| NAV-15 | Med | `views/sales/SalesOverview.vue:106`, `ItemsOverview.vue:64` | "New" badge clears silently; no refresh feedback | Mark-all-seen, refresh toast |
| NAV-16 | Med | `views/sales/SalesDetails.vue:6-96,151`, `router/index.ts:117` | No loading or not-found; external link not signalled; sales has no highlighted tab | States, external-link icon |
| NAV-17 | Med | `views/TabsPage.vue:55-72`, `ItemsOverview.vue:258` | Sales is a fourth area hidden in an unlabeled floating button, collides with scroll-to-top button | Make Sales a tab or labelled entry |
| NAV-18 | Med | `views/TabsPage.vue:32`, `components/SideMenu.vue:201` | Destinations split over tab bar, floating button and menu; no Admin or logout in the menu | One navigation model |
| NAV-19 | Med | `views/admin/*`, `router/index.ts:123-161` | Non-admin deep link silently redirected; admin chrome differs from other detail screens | Denial message, shared header |
| NAV-20 | Med | `views/admin/ScraperHealth.vue:53,190` | No initial skeleton or error state | Add both |
| NAV-21 | Med | `components/overview/OverviewHeader.vue:8-37`, `DetailsHeader.vue:13-26` | Logout, add, edit, upload are bare icons; logout has no confirmation and sits beside the menu button | Buttons with labels, move logout |
| NAV-22 | Med | `OverviewHeader.vue:21-37`, `DetailsHeader.vue:12`, `views/Profile.vue:43` | Guests silently lose controls; no "sign in to add" prompt | Guest prompt, upgrade path |
| NAV-23 | Med | `views/components/ComponentDetails.vue:3-25`, `ComponentOverview.vue:6` | Read-only for non-admins without saying so; pointless single segment; detail card repeats the banner | Remove or enrich (substrates using it) |
| NAV-24 | Med | `views/plants/PlantOverview.vue:164-188`, `views/substrates/SubstrateOverview.vue:160` | Validation only as toasts; plant created but image upload failure leaves partial state | Inline errors, partial-success message |
| NAV-25 | Low | `views/plants/PlantDetails.vue:241`, `SubstrateDetails.vue:238` | Delete uses `push` so Back returns to a dead url; plant delete optimistic, substrate not | `replace`, one strategy |
| NAV-26 | Low | `views/substrates/SubstrateDetails.vue:152` | Save enabled on a pristine form | Disable until dirty |
| NAV-27 | Low | `ItemsOverview.vue:12-22,270,429`, `components/PullToRefresh.vue:765` | Desktop refresh button positioned by percentages; `.then` without `.finally` can leave spinner stuck; hardcoded colors | `.finally`, tokens, toolbar placement |
| NAV-28 | Low | `ItemsOverview.vue:63-87` | Cards are not links: no keyboard, no new tab, no share | `ion-card button` with router link |
| NAV-29 | Low | `components/details/HorizontalGallery.vue:4-13` | Constant alt, index keys, oldest first (newest off screen), no empty state | Key by id, newest first, empty state |
| NAV-30 | Low | `views/Login.vue:53-96,174,201` | Guest and toggle are clickable text; global Enter handler double-submits | Buttons, form submit |
| NAV-31 | Low | `views/NotFound.vue:60`, `router/index.ts:53` | "Go home" forces a reload; unknown `/tabs/...` urls lose the tab bar | Plain navigation, scoped catch-all |
| NAV-32 | Low | `views/Profile.vue:5,169,199`, `router/index.ts:48` | Profile close does nothing on deep link; user is signed out after editing without notice | Fallback route, notice |
| NAV-33 | Low | `components/SideMenu.vue:218-229,323-394`, `App.vue:2` | Menu mounted on login and 404; dark mode applied on menu mount so first paint can flash | Init theme in `main.ts` |
| NAV-34 | Low | `views/TabsPage.vue:48` | Dev tab bar differs from production | Note only |
| NAV-35 | Low | `router/index.ts:78-117`, ComponentDetails | `:public` in the url is user-editable and component details ignore it | Derive from item data |

## Forms and feedback

| ID | Sev | Where | Finding | Fix |
|----|-----|-------|---------|-----|
| FORM-01 | High | `utils/requestFeedback.ts:20-27`, `locales/en.ts:380` | Failure toast reads "Failed to {action} Plant." with the placeholder unresolved | Pass `action` or drop it from the string |
| FORM-02 | Med | `services/ImageService.ts:18`, `stores/watering.ts` | Keys `image.upload`, `watering.add`, `watering.delete` do not exist; fallback is raw English `Error: ...` | Add keys to both locales |
| FORM-03 | Med | `utils/requestFeedback.ts`, `utils/apiErrorMessage.ts` | 400 and 409 field errors are never shown on forms; helper is used only by Login | Route through the helper or show `fields` inline |
| FORM-04 | Med | `views/components/ComponentOverview.vue:116`, `ComponentDetails.vue:103` | View and store both toast: two errors per failure | Keep one |
| FORM-05 | High | `PlantAddingModal.vue:99`, `SubstrateAddingModal.vue:138`, `ComponentAddingModal.vue:64` | Form resets on submit, so after a failed save the modal stays open but empty | Reset only after success |
| FORM-06 | Med | `views/plants/PlantOverview.vue:19-33` | Created but image failed shows only an image error; with FORM-05 a retry duplicates | Separate catch, warning toast |
| FORM-07 | Med | `SubstrateEditingModal.vue:125`, `SubstrateDetails.vue:166-230` | Image field accepted, never uploaded, success toast shown | Upload or remove the field |
| FORM-08 | High | `ProfileEditingModal.vue:12`, `components/modal/BaseFormModal.vue:44` | Delete event wired to a prop the modal does not have: account deletion cannot be triggered | Pass `delete-handler` |
| FORM-09 | Med | `BaseFormModal.vue:2`, `ImageUploadModal.vue:2` | Backdrop tap or swipe discards edits or hides a running save | `can-dismiss` with discard confirm |
| FORM-10 | Med | `FormComponent.vue:18-47`, `PlantEditingModal.vue:63`, `Profile.vue:120` | Edits mutate in place and survive Close; passwords stay in memory | Reset on open |
| FORM-11 | Med | `PlantEditingModal.vue:63-69` | Deep immediate watcher overwrites typing on any store update | Reset on id change or open |
| FORM-12 | Med | `FormComponent.vue:227-243` | Required check only on submit, treats `0` and `false` as empty, one generic toast | Per-field errors and focus |
| FORM-13 | Med | `RequiredNote.vue`, `InfoNote.vue:25`, `InputField.vue:8` | "Required" in red under every field from the start; edit and component forms mark nothing | Asterisk, error only after submit |
| FORM-14 | Med | `InputField.vue:4`, `PasswordField.vue:5`, `Login.vue:22`, `ComponentSelection.vue:32` | No `inputmode`, `enterkeyhint`, `autocomplete`, `autocapitalize` | Pass through field config |
| FORM-15 | Med | `FormComponent.vue:15-56` | No `<form>`: Enter does not submit | Wrap in form |
| FORM-16 | Med | `Login.vue:174,201,208,263` | Window keydown handler ignores loading and focus: duplicate requests | Form submit with guard |
| FORM-17 | Med | `Login.vue:213` | Every failure (network, 429, 500) reads "invalid credentials" | Branch on error type |
| FORM-18 | Low | `Login.vue:192-280` | Toast-only validation, submit never disabled, passwords kept after register | Inline errors, clear fields |
| FORM-19 | Low | `Login.vue:47,67,87,94`, `PasswordField.vue:17` | Text acts as buttons; eye toggles unlabeled | Real buttons, labels |
| FORM-20 | Med | `FormComponent.vue:7-12,86,93,245` | Delete dialog prints a blank name for images, records, reminders; trigger is an unlabeled icon with a mis-cased prop | `deleteLabel` prop, labelled button |
| FORM-21 | High | `components/images/ImageEditingModal.vue:87-119` | Loading flag cleared only on success: one failure leaves a permanent spinner | `finally` |
| FORM-22 | Med | `ImageUploadModal.vue:93-109`, `UploadField.vue:5` | Reopened modal shows no file but submits the previous one | Reset on close |
| FORM-23 | Med | `UploadField.vue:5`, `ImageService.ts:18`, `utils/apiUtils.ts:243` | No size or type check, preview, progress, timeout or cancel | Client checks, preview, abort |
| FORM-24 | Low | `DateField.vue:31-41,94`, `ImageUploadModal.vue:24` | Shows today but emits nothing; label hidden on mobile | Emit on mount, keep label |
| FORM-25 | Med | `components/plants/watering/WateringRecords.vue:360-394` | Modal closes before the request settles; errors swallowed; no pending state, no success, no undo | Pending marker, Undo toast |
| FORM-26 | Med | `WateringRecords.vue:8,147,329,348` | Draft not reset between adds; add by double tap has no hint; add control is an icon | Reset, labelled button |
| FORM-27 | Low | `WateringRecords.vue:65-80`, `MenuCalendar.vue:102`, `EditingHeader.vue:6` | Hardcoded German labels | Locale keys |
| FORM-28 | Med | `components/calendar/MenuCalendar.vue:20,25,165,180` | "Add" title when editing, delete icon on a new reminder, silent return on missing category | State-aware modal, toasts |
| FORM-29 | Low | `DateField.vue:5,52`, `MenuCalendar.vue:128,167`, `WateringRecords.vue:343` | `datetime-local` for day-level data; UTC conversion can shift the day west of UTC | Date-only input |
| FORM-30 | Med | `CalendarSettingsModal.vue:51,74,87,99,246` | Reset and delete without confirmation or undo; blank or duplicate names; props mutated; icon buttons unlabeled | Confirm or undo, validate |
| FORM-31 | Med | `SubstrateAddingModal.vue:14,33`, `SubstrateOverview.vue:160-177`, `ComponentSelection.vue:38` | Parts value silently becomes 1 when empty or negative; component count checked only at final save | Validate on step 2 |
| FORM-32 | Low | `ComponentSelection.vue:7,32` | Unassociated labels and unlabeled number input | `label` props |
| FORM-33 | High | `components/plants/MoreInfo.vue:9,19,45,143`, `stores/moreInfo.ts:99` | AI guide streams into a collapsed accordion with a tiny spinner; a mid-stream error discards the draft and shows "no info"; no retry or stop | Open while streaming, status line, retry and stop |
| FORM-34 | Med | `stores/moreInfo.ts:121-129` | Non-`completed` end is cached as a complete guide | Treat as failure |
| FORM-35 | Low | `MoreInfo.vue:118-126` | No refetch after plant rename; stream continues after leaving | Watcher, stop on unmount |
| FORM-36 | Low | `services/general/ToastService.ts:60-165` | No dedupe, fixed 4 s for long messages, no Retry on failures | Dedupe, scale duration, Retry |
| FORM-37 | Low | `PlantOverview.vue`, `Profile.vue:197`, `MenuCalendar.vue:180` | Some saves close silently; profile save does not mention sign-out | One success toast per save |

## Accessibility

| ID | Sev | Where | Finding | Fix |
|----|-----|-------|---------|-----|
| A11Y-01 | High | `OverviewHeader.vue:8-45`, `DetailsHeader.vue:13-25`, `EditingHeader.vue:8` | 19 clickable `ion-icon`s with no button semantics or keyboard access | `IconButton` component |
| A11Y-02 | High | 5 `aria-label`s against 43 `ion-button`s; `ItemsOverview.vue:13,31`, `PullToRefresh.vue:21`, `SideMenu.vue:9` | Icon-only buttons have no accessible name | Translated labels, lint rule |
| A11Y-03 | High | `ItemsOverview.vue:63` | Main navigation card has no role, tabindex or href | `ion-card button` |
| A11Y-04 | High | `index.html:11` | `maximum-scale=1, user-scalable=no` blocks zoom | Remove |
| A11Y-05 | Med | 20 transitions or animations, no `prefers-reduced-motion` | Motion cannot be reduced | Global media query |
| A11Y-06 | Med | `theme/variables.css` | Primary #228b22 on white is 4.39:1 (dark-mode primary 4.25:1): fails AA for text | Darken to about #1b7a1b |
| A11Y-07 | Med | `HorizontalGallery.vue:7`, `DetailsBanner.vue:6,10` | Constant English alt text | i18n alt, empty alt when decorative |
| A11Y-08 | Med | `theme/custom.css`, `OverviewHeader.vue:12` | Icon targets 32 px with ad hoc padding, small FAB | 44 px minimum via buttons |
| A11Y-09 | Low | modals via controller | Focus return not verified | Audit focus return, label modals |
| A11Y-10 | Low | 5 files use headings | No page-level h1 | One h1 per page |

## Theme, language, layout, PWA, performance, consistency

| ID | Sev | Where | Finding | Fix |
|----|-----|-------|---------|-----|
| THEME-01 | High | `main.ts:19`, `SideMenu.vue:208`, `theme/variables.css:90`, `scrollbar.css:22` | Dark mode is a class toggle and also an OS media query, so brand tokens follow the OS even when the user chose light | Scope to `.ion-palette-dark` |
| THEME-02 | Med | `variables.css` (72 hex values) | Dark block re-declares tokens that do not change | Override only differences |
| THEME-03 | Med | about 63 hex colors outside tokens (`stores/calendar.ts`, `CalendarSettingsModal`, `PullToRefresh`, `ItemsOverview`) | Hardcoded colors | Tokens |
| THEME-04 | Med | 16 inline styles in 12 files, repeated 32 px icon sizing | Inline styling | Utility classes |
| THEME-05 | Low | `ItemsOverview.vue` 36 px values, 17 `!important` | No spacing or breakpoint scale | `--space-*` tokens |
| I18N-01 | High | `EditingHeader.vue:6`, `WateringRecords.vue:67`, `MenuCalendar.vue:104` | German strings in the English UI | Locale keys |
| I18N-02 | Med | `SubstrateContainer.vue:25`, `Calendar.vue:31`, `PieChart.vue:75` | Hardcoded English | `t()` |
| I18N-03 | Med | `index.html:2` | `lang="en"` never updated on locale change | Set `documentElement.lang` |
| I18N-04 | Med | `WateringRecords.vue:207`, `CalendarSettingsModal.vue:231`, `utils/utils.ts:97`, `ScraperHealth.vue:225` | Four different date-format strategies | One `formatDate(locale)` |
| I18N-05 | Low | `en.ts` and `de.ts` | 269 keys each, no gaps, `check-keys` script present (positive); plural rules not checked | Keep |
| I18N-06 | Low | `ItemsOverview.vue:230` and others | `localeCompare` without locale | Pass app locale |
| RESP-01 | High | `SideMenu.vue:2,241` | No split pane; menu is 15 to 20 percent drawer on desktop | `ion-split-pane when="lg"` |
| RESP-02 | Med | 17 media queries, 13 at 768 px, `ItemsOverview.vue:59,383-429` | Overlapping hand-written breakpoints; fewer columns at xl than lg | Use grid breakpoints |
| RESP-03 | Med | no `safe-area` usage, `TabsPage.vue:154` | `viewport-fit=cover` without insets; fixed 70 px margin | `env(safe-area-inset-*)` |
| RESP-04 | Low | `Calendar.vue:162`, `FormComponent.vue:262`, `custom.css` | Per-component max widths | Content-width token |
| PWA-01 | High | none | No service worker: not installable, no offline | `vite-plugin-pwa` |
| PWA-02 | Med | `public/favicons/manifest.json` | `start_url` `/index.html` with hash routing; black theme color; no maskable icons, id or scope | Fix manifest |
| PWA-03 | Low | `index.html:11` | No `theme-color` meta | Add light and dark |
| PWA-04 | Med | none | No online or offline handling | Banner plus cached reads |
| PERF-01 | Med | `vite.config.ts:11` | Legacy plugin doubles the build (duplicate chunk sets); a 1.1 MB chunk not yet traced | Drop or target modern; inspect chunk |
| PERF-02 | Med | `vite.config.ts` | No `manualChunks` | Split ionic, charts, luxon |
| PERF-03 | Info | `router/index.ts:10-30`, `main.ts:34` | Lazy routes and locales (positive) | Keep |
| PERF-04 | Med | `public/no-image.png` (494 KB), `ProgressiveImage.vue:37`, `DetailsBanner.vue:3` | Placeholder is the default image of every card; no `srcset` | SVG or WebP placeholder, `srcset` |
| PERF-05 | Med | `ItemsOverview.vue:55-68` | No pagination or virtualization; up to two image requests per card | Window the grid |
| PERF-06 | Low | `DetailsBanner.vue:7`, `HorizontalGallery.vue:9` | Inline `onerror` fallback can loop | Shared guarded handler |
| CONS-01 | Med | `Accordion.vue:20`, `DetailsHeader.vue:16`, `EditingHeader.vue:11` | Repeated clickable icon pattern | `IconButton` (also fixes A11Y-01, 02) |
| CONS-02 | Med | `OverviewHeader`, `DetailsHeader`, `EditingHeader`, `ModalHeader` | Four near-identical toolbars | One `AppHeader` with slots |
| CONS-03 | Low | font sizes in rem and px mixed | No type scale | `--font-size-*` tokens |
| CONS-04 | Low | `ItemsOverview.vue` 434 lines of inline CSS | Shared card and grid styles live in one component | Move to shared styles |
| CONS-05 | Low | `ItemsOverview.vue:13`, `PullToRefresh.vue:19` | Duplicate refresh button | `RefreshButton` |

## Suggested order for the redesign phase

1. Foundations: tokens (colors, spacing, type scale), single dark-mode mechanism, `IconButton`, `AppHeader`, contrast fix, zoom fix, `lang` handling (THEME, A11Y-01..08, CONS-01..03, I18N-03).
2. Feedback and forms: fix the toast bug and keys, form component with real `<form>`, inline validation, dirty tracking, reset-on-success, delete dialog (FORM-01..21, NAV-03).
3. States: shared loading, empty, error and not-found components used by every list and detail (NAV-05..16, NAV-20).
4. Navigation: back targets, return url, Sales and Admin entry points, guest messaging (NAV-01, 02, 17..22, 35).
5. Wide screens and installability: split pane, grid breakpoints, safe areas, service worker, manifest (RESP, PWA).
6. Performance: placeholder, chunking, legacy build, list windowing (PERF).

Defects that are bugs rather than design (candidates for an early fix PR before the redesign): NAV-01, NAV-03, FORM-01, FORM-05, FORM-07, FORM-08, FORM-21, FORM-22, I18N-01.

## Limits

- Not run in a browser: layout, animation, real contrast in context and gesture behavior are unverified.
- The 1.1 MB build chunk (PERF-01) was not traced.
- Plural rules and screen-reader announcements were not tested.
- Open for the owner: which findings to treat as bugs now versus redesign input, and whether Sales should become a tab.
