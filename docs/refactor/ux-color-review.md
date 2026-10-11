# PlantCare UX and color review

Branch `feat/quick-watering` at `ca6abf0`, 2026-10-10. Scope: every screen of `frontend/src`, for the roles grower, admin, guest and a first-run account, in German (the longer locale), light and dark, at 360, 390, 430 and 1440 px wide.

## Status

Implemented on `feat/ux-color-review`. "Pending browser check" means the code and tests are in place and the item is verified in the real-browser pass (plan task 27).

| Finding | Task | Closing commits | Status |
|---------|------|-----------------|--------|
| 1 | 7 | dae5ea8, 2a62c4d | Done, pending browser check |
| 2 | 12 | 40c1665 | Done, pending browser check (fit at 320, 360, 390 px) |
| 3 | 13 | c3bac5d | Done, pending browser check (banner on top, header pushed down) |
| 4 | 10 | 64f9a48, 4f4f958 | Done, pending browser check |
| 5 | 8 | 27b625c | Done, pending browser check |
| 6 | 9 | 7797692 | Done, pending browser check |
| 7 | 1, 2 | 46407f4, f72a5b0, c94c3c7 | Done, pending browser check (visible ring on each control) |
| 8 | 1, 5 | 46407f4, a09f06f | Done: category colors corrected at render time |
| 9 | 1, 2 | 46407f4, f72a5b0 | Done |
| 10 | 5, 6 | a09f06f, e503149, 7921155 | Done, pending browser check (organic and mineral distinct, custom color in dark mode) |
| 11 | 14 | 043ceea, 40167f4 | Done, pending browser check (`lang` follows the switch) |
| 12 | 16 | c9cea4d | Done, pending real focus check inside the modal |
| 13 | 3 | f541f17 | Done, pending browser check (`theme-color` matches the header) |
| 14 | 4 | 49334c3 | Done |
| 15 | 2 | f72a5b0 | Done |
| 16 | 2 | f72a5b0 | Done |
| 17 | 15 | 2babe60, b2a9600, 8a6258f, 8ba88cf | Done (backend and frontend; foreign private substrate answers 404) |
| 18 | 11 | 14f7510, 386a9f2 | Done |
| 19 | 21 | 4236467, 079ddfb | Done with a deliberate exception: no persistent toast (it would block the global toast queue); a 10 s undo toast (`UNDO_TOAST_MS`) plus the 5 minute in-page last-round row |
| 20 | 14, 17 | 043ceea, 26b45d0, 37a3c1f | Done |
| 21 | 18 | 90773a4 | Done (state cues such as the watering fill keep their motion) |
| 22 | 19 | 8cd9102 | Done |
| 23 | 4 | 49334c3 | Done |
| 24 | 19 | 8cd9102 | Done |
| 25 | 22 | 9fc95bc, 076c5ba | Done |
| 26 | 20 | 68f0d1f, 18085c1 | Done |
| 27 | 23 | be23006 | Done, pending browser check (desktop layout, reminders open in a dialog instead of a route or side panel) |
| 28 | 24 | 7895993 | Done |
| 29 | 23 | be23006 | Done (logout only in the menu) |
| 30 | 2 | f72a5b0 | Done |
| 31 | 4, 25 | 49334c3, 0e55e0c | Done |
| 32 | 1, 2, 3, 4, 5 | 46407f4, f72a5b0, f541f17, 49334c3, a09f06f | Done, except `views/Debug.vue` (development only, keeps its terminal green) |
| 33 | 7, 16, 18, 19, 20, 22, 25 | 2a62c4d, c9cea4d, 90773a4, 8cd9102, 68f0d1f, 9fc95bc, 0e55e0c | Done, except calendar day width: the number disc is 36px inside a 44px tall cell whose width is a seventh of the calendar, so it can fall under 44px on narrow phones (documented exception, the whole cell is the tap target) |
| 34 | 4, 16, 20, 25 | 49334c3, c9cea4d, 68f0d1f, 0e55e0c | Done with two deviations: the pie is replaced by a stacked bar only under 576px (the pie stays on wider screens), and the snap logged state still opens at 0.65 because Ionic cannot change the initial breakpoint after presentation (thumbnail, filled Done and text Undo were added) |

## Verdict

1. **Palette:** one coherent token palette holds (leaf green, water teal, clay, moss ink). Ionic's variables are remapped onto it, no shipped component hard-codes a hex, and dark mode shows zero text contrast failures on 16 audited screens.
2. **Meaning has collapsed:** clay carries six jobs, organic and mineral fertilizer look identical, dark headers are a mint slab, and three modules plus Ionic's stock greys bypass the tokens.
3. **Contrast:** five verified AA failures, led by a focus ring that is 1.00:1 on the Water now button, reminder labels as low as 1.04:1, unselected segment labels at 3.81:1 and a search edge at 1.37:1.
4. **Flow:** the tag cards and the watering band are authored and strong, but the care guide drops its body text, the German tab bar clips on phones, the offline banner is invisible, the snap sheet can confirm the wrong plant, never-watered plants never ask for water and guests see false history.
5. **Scores:** Nielsen 26/40, technical audit 12/20 (accessibility 2, performance 3, responsive 2, theming 3, integrity 2), 0 P0 and 12 P1 findings. Fix the P1 block first; the token set at the end resolves every color finding.

## How this review was produced

Three isolated passes, merged here. A design review (heuristics, personas, color roles, live walk of every flow as first-time and returning user). A detector and color evidence pass (the Impeccable detector returned zero findings, so every finding below comes from code reading, computed styles or measurement). A technical audit (accessibility, responsive, theming, performance). Contrast figures use the WCAG 2.x formula with alpha composited over the real background; the figures in the token set were recomputed for this document. No code changed.

Severity: P0 blocks a task, P1 is a major problem or an AA failure, P2 is a real annoyance with a workaround, P3 is polish. Tags: `[color]`, `[flow]`, `[a11y]`, `[responsive]`.

---

## Findings, ranked by user impact

### P1

**1. The care guide drops every paragraph that follows a heading** `[flow]` `[a11y]`
- Screen: plant detail, care guide, all viewports.
- File: `frontend/src/utils/markdown.ts:36-43` (heading branch), `:29` (list preprocessing).
- Problem: the heading branch matches `^(#+)\s*(.*)`, emits the first line and `continue`s, so the text under `## Licht` never renders. A live guide showed only the headings "Licht", "Gießen", "Substrat". The `\n- ` rewrite also gives every list item its own `<ul>`, so a screen reader announces "list, 1 item" repeatedly. Models routinely emit a heading followed by one newline, so the feature's core value disappears with no error state.
- Fix: split the block at its first newline, render the heading, then render the remainder as a paragraph or list. Group consecutive `- ` lines into one `<ul>`. Add unit cases for heading plus text and for a three-item list.

**2. The bottom tab bar clips its first and last labels on phones** `[responsive]`
- Screen: every tab screen at 360 and 390 px (German); 430 px fits.
- File: `frontend/src/views/TabsPage.vue:6-43`, styles near `:113`.
- Problem: five German tabs need 406 px ("Komponenten" alone takes 105 px). The bar centers its overflow, so "Pflanzen" (the home tab) starts at x=-23 and "Angebote" with its NEW badge ends at 383 on a 360 px screen. No scrollbar appears, so the clipping is silent. The dev-only Debug tab makes it worse. WCAG 1.4.10.
- Fix: `ion-tab-button { min-width: 0; flex: 1 1 0; --padding-start: 2px; --padding-end: 2px }` and a wrapping `--text-xs` label. Shorten the German label for Components, or move Components under Substrates (it is the ingredient list and a hobby grower rarely opens it). Add a 360 px viewport test asserting every tab rect sits inside `[0, innerWidth]`.

**3. The offline banner renders underneath the page header** `[flow]`
- Screen: every screen when offline, all viewports.
- File: `frontend/src/App.vue:3`, `frontend/src/components/ui/OfflineBanner.vue:74-88`.
- Problem: the banner is a static sibling of the absolutely positioned `ion-split-pane`. `elementFromPoint` at its centre returns `ION-TITLE`, so sighted users never see "Du bist offline". Screen readers do hear it. The first visible sign is an error toast after a failed save.
- Fix: render it as a fixed top overlay (`position: fixed; top: env(safe-area-inset-top); inset-inline: 0; z-index` above the shell) or as an extra `ion-toolbar` in each page header. Color: neutral `--offline-bg` (`--surface-sunken` with a cloud-offline icon), not clay (see finding 14). Add a test that the banner is the topmost element at its own centre.

**4. The snap sheet highlights a different plant than the best match** `[flow]`
- Screen: `/tabs/water`, snap sheet.
- File: `frontend/src/utils/waterRound.ts:14,58` (0.05 due and overdue bonus applied before sorting), `frontend/src/views/water/WaterRound.vue:188-191` (confidence read from the reranked first row).
- Problem: with the documented `Monty.png` fixture the sheet frames Sunny Pothos in green under "Ist das deine Pflanze?" and lists Monty second. The mock embedder clusters scores, but the same flip happens with any near tie on a real model. A one-handed user taps the framed row and logs the wrong plant.
- Fix: decide confidence from the raw top-1 candidate. Highlight a row only when the raw winner is first and its raw score clears `threshold`. Keep the bonus for ordering only. Show the candidate photo at the card crop so the visual comparison is easy.

**5. Never-watered plants never ask for water** `[flow]`
- Screen: plant list and water round.
- File: `frontend/src/utils/wateringStats.ts:58` (no records returns `tone: "ok", rank: 0`).
- Problem: "Unknown Orchid" and "Blue Echeveria" ("Noch nie gegossen") sort among healthy plants with no chip, and the round leaves them unticked. A newly added plant, the one most likely to be forgotten, is invisible. This breaks the product principle "know at a glance which plant to water next".
- Fix: add a fourth tone `new` with a chip "Noch nie gegossen" in `--water`, rank it just after overdue, and pre-tick it in the round.

**6. Guests are told public plants were never watered** `[flow]`
- Screen: plant detail for any non-owner, for example `/tabs/plants/details/1/1` (Monty, watered yesterday).
- File: `frontend/src/views/plants/PlantDetails.vue` (always renders `<watering-status>`), `frontend/src/components/plants/watering/WateringStatus.vue:91-104`.
- Problem: the band reads "Noch nicht gegossen" and "Trage ein zweites Gießen ein", and the calendar reads "Noch kein Gießen eingetragen". Records of other owners are not available, and the overview correctly skips status for them, but detail does not. The guest sees false history plus an instruction they cannot follow.
- Fix: when `!canEdit` and no readable records exist, hide the band and calendar or show "Gießverlauf ist privat". Never show an owner-only instruction to a non-owner.

**7. Keyboard focus is invisible on Ionic controls and on filled buttons** `[color]` `[a11y]`
- Screen: all screens; worst on Water now, Log waterings, Snap, every solid button.
- File: `frontend/src/theme/custom.css:65-76`.
- Token: `--focus-ring` `#0e6b75` drawn as a 3 px inset outline on `--ion-color-tertiary` `#0e6b75` is 1.00:1; on primary `#1f6b3b` 1.05:1; dark `#63c6d1` on `#63c6d1` 1.00:1.
- Problem: the host `:focus-visible` rule never matches, because focus lives in Ionic's shadow DOM and Ionic sets `.ion-focused` instead. A live Tab walk showed `outline: none` on `ion-button`, `ion-tab-button`, `ion-segment-button`, `ion-select`, `ion-menu-button`, `ion-back-button` and `ion-fab-button`. Only native elements get a ring. WCAG 2.4.7 and 1.4.11.
- Fix: key the rule on `.ion-focused`, draw it outside, and use two tones on solid fills: `outline: 3px solid var(--focus-ring); outline-offset: 2px; box-shadow: 0 0 0 2px var(--ion-background-color)`. Teal on the sage page is 5.70:1, aqua on moss black 8.94:1. Delete the `-3px` offset rule. Add a test that every focusable in the Tab order has a non-`none` outline or shadow.

**8. Reminder category text color fails AA for most colors** `[color]`
- Screen: side menu reminders calendar and the category editor.
- File: `frontend/src/utils/categoryColors.ts:57-60`, used at `CalendarSettingsModal.vue:124,257,264,343`, painted at `Calendar.vue:285,432-434`.
- Problem: `contrastTextColor` rotates the hue 180 degrees at a fixed lightness. A complementary hue does not produce contrast. Measured with the shipped function: orange `#ff9800` 1.18:1, cyan 1.21, green `#4caf50` 1.55, pink 1.82, grey 2.25, `#228B22` 2.45, `#1E90FF` 3.21, red 3.45. The day numbers are 15 px bold, so the large-text relief does not apply.
- Fix: replace the helper with a luminance pick. Return `--category-ink` `#0e1812` when it reaches 4.5:1 on the background, else `#ffffff`. If neither reaches 4.5 (mid greys), shift the background lightness until one does. Add a test with 50 random backgrounds asserting at least 4.5:1.

**9. Unselected segment labels are 3.81:1 in light mode** `[color]`
- Screen: Plants and Substrates ("Öffentlich"), water round fertilizer segment, snap flow.
- File: `frontend/src/theme/custom.css:101-113` (sets `--color-checked`, never `--color`).
- Token: Ionic's default 60% text `#6d796f` on `--surface-sunken` `#e6ede2` is 3.81:1. Dark passes at 6.18.
- Fix: `ion-segment-button { --color: var(--nav-idle); }` where `--nav-idle` is `--ink-soft` (5.85:1 light, 9.08 dark).

**10. Watering category colors are dead settings, and organic vs mineral is never distinguished** `[color]` `[flow]`
- Screen: calendar settings ("Watering categories") and the per-plant watering calendar.
- File: `frontend/src/stores/calendar.ts:12-28` (defaults white on `#1E90FF`, `#8B4513`, `#228B22`), `frontend/src/components/plants/watering/WateringRecords.vue:123` (maps every fertilized record to organic), `frontend/src/components/calendar/Calendar.vue:216-226,251,421-427` (watering mode ignores category colors), `frontend/src/locales/en.ts:464` (note says the color can be adjusted).
- Problem: users can recolor "Organic" and "Mineral", but nothing ever renders those colors. Mineral and organic days are drawn identically as a clay ring. The defaults are CSS named colors unrelated to the palette and fail if shown: white on `#1E90FF` 3.24:1, white on `#228B22` 4.39:1, `#8B4513` marker 2.51:1 on the dark page, `#1E90FF` marker 2.97:1 on the light page. The snap sheet chips use act green for fertilizer (`SnapMatchSheet.vue:255-270`), the same green as the Done button beside them.
- Fix: delete the watering-category pickers and store defaults, or bind them to two fixed role tokens `--feed-organic` and `--feed-mineral` (set at the end). Map `fertilizerTypeId` instead of collapsing to organic. Ring organic days in `--feed-organic`, mineral days in `--feed-mineral`, add a third legend item, and use the same two tokens for the round segment's checked state and the snap chips. Correct the locale note.

**11. The document language never follows the locale** `[a11y]`
- Screen: whole app.
- File: `frontend/index.html:2` (`<html lang="en">`), `frontend/src/services/general/LocalizationService.ts:119` (`setLocale` never touches `documentElement.lang`).
- Problem: `document.documentElement.lang` stays `en` while every string is German. Screen readers read German with English voices, browser translation misfires, and `hyphens: auto` (needed for finding 2) uses the wrong dictionary. WCAG 3.1.1.
- Fix: set `document.documentElement.lang = locale` in `initLocale()` and `setLocale()`, with a unit test.

**12. The snap sheet loses focus and does not announce the logged state** `[a11y]`
- Screen: `/tabs/water`, snap sheet.
- File: `frontend/src/components/water/SnapMatchSheet.vue:13-88`, `frontend/src/views/water/WaterRound.vue:286-291,334-342,387-388`.
- Problem: after a candidate is chosen, its buttons are removed and focus falls to `<body>`; "Sunny Pothos gegossen" is not in a live region, so a screen reader user gets no confirmation. After Undo or Done, focus again lands on `<body>`. WCAG 2.4.3 and 4.1.3.
- Fix: give each state heading `tabindex="-1"` and focus it on state change, wrap the state area in `role="status" aria-live="polite"`, and return focus to the snap button on dismiss.

### P2

**13. Dark mode headers are a full-width mint slab, and the browser chrome disagrees** `[color]`
- Screen: every screen in dark mode; desktop shows two slabs (menu header and page header).
- File: `OverviewHeader.vue:174-176`, `DetailsHeader.vue:90`, `AdminHeader.vue:38`, `SideMenu.vue:411-413`, `frontend/src/theme/darkMode.ts:14` (literals `#14221a` and `#1f6b3b`).
- Token: `--ion-color-primary` dark `#74cf93` against the `#0f1a14` page is 9.41:1. Title ink on it passes (9.58), so the problem is hierarchy, not legibility.
- Problem: the brightest surface in dark mode is non-interactive chrome. It outshouts the due and overdue chips and contradicts `DESIGN.md` ("raised surface, centered display title, line border"). In light mode the green header competes with the green add button and the green selected tab. The OS bar (`#14221a`) and the in-page bar disagree.
- Fix: header `--background: var(--chrome-bg)` (`#ffffff` / `#14221a`), title in `--ion-text-color` (14.78 / 13.84), icons in `--ion-color-primary` (6.51 / 8.71), `--line` bottom border. Read the meta `theme-color` from `getComputedStyle(documentElement).getPropertyValue('--chrome-bg')` instead of two literals. Keep leaf green only for the side-menu brand row if a brand moment is wanted.

**14. Clay means six things** `[color]`
- Screen: Sales, plant list, calendar, offline and error banners, substrate pie.
- File: `ItemsOverview.vue:376,442,520`, `custom.css:234-235`, `Calendar.vue:222,427`, `TabsPage.vue:32`, `SideMenu.vue:42`, `OfflineBanner.vue:87-88`, `MoreInfo.vue:195`, `RefreshErrorBanner.vue:44`.
- Problem: `--ion-color-secondary` `#a34a28` and `--clay-wash` mean overdue, fertilizer, NEW, discount, offline, care guide error and a pie series at once. On Sales every card carries two clay pills ("NEU", "-29 %") plus a clay tab badge, the same weight as "Überfällig" on the plant list. Clay is only 1.11:1 away from danger brick `#b3261e`, so overdue and error read as one red family, and errors use two different reds (clay wash for banners, brick for fields). The public chip reuses `--water-wash` (`PlantTag.vue:97`), the same wash as the watering band. Guest and read-only state has no semantic color at all.
- Fix: clay means overdue only. NEW, the tab badge and "n neu" move to `--new` (sun `#f0b429` with ink `#0e1812`, 9.73:1 light; dark `#f5c451`, 11.14:1). Discount becomes ink text on `--surface-sunken` with a percent icon. Banners that report errors use `--danger-wash`. Offline uses `--offline-bg`. Public uses `--surface-sunken` with a globe icon; guest read-only gets a lock icon in `--ink-soft`, never a fill color.

**15. Control edges are below 3:1** `[color]` `[a11y]`
- Screen: the search field on every list, the private chip, select rows.
- File: `frontend/src/components/ui/SearchBar.vue:86`, `PlantTag.vue` `.chip-private`.
- Token: `--line` `#d5dfd2` on white is 1.37:1; white field on the sage page 1.09:1; dark `#2b3d31` on `#17261d` 1.36:1. Form fields already use `color-mix(ink-soft 60%, line)` (`#839185`).
- Fix: add `--control-border` `#839185` / `#74877a` (3.31 on white and 3.03 on the page in light; 4.12 on raised and 4.66 on the page in dark). Use it for the search bar, select rows and the private chip ring. Keep `--line` for dividers. Replace the six duplicated `color-mix` borders (`FieldShell.vue:65`, `ComponentSelection.vue:180,233`, `RadioField.vue:85`, `SwitchField.vue:66`, `UploadField.vue:191`) with it.

**16. Stock Ionic greys bypass the palette** `[color]`
- Screen: tab bar, every `ion-select`, side menu icons.
- File: no override in `custom.css:114-117`; `RoundList.vue` and `SideMenu.vue` selects.
- Token: tab idle `#595959` / `#acacac` (7.00 / 7.26, pass but neutral grey in a green palette), select chevron `#808080` on `#f0f0f0` (3.47) and `#898989` on `#6b6b6b` dark, menu idle icons `#7f8881` on sage (3.34) and `#758379` on leaf wash (3.22, barely above 3:1).
- Fix: `ion-tab-button { --color: var(--nav-idle) }`, `ion-select { --background: var(--surface-sunken) }`, `ion-select::part(icon) { color: var(--nav-idle); opacity: 1 }`, menu `ion-icon { color: var(--nav-idle) }` (5.66:1 on leaf wash).

**17. Adding the first plant requires a species and a substrate** `[flow]`
- Screen: first-run account, plant add modal.
- File: `PlantAddingModal.vue:50-75` (both `required: true`), `PlantOverview.vue:226-232` (rejects `substrateId === 0`).
- Problem: a new account has no substrate, so the only way forward is to pick a stranger's public substrate such as "Peat free basic". The seed's own "Unknown Orchid" shows the tension. The first plant should take one field and one tap.
- Fix: make species and substrate optional ("Unbekannt", "Nicht festgelegt") and offer "Substrat anlegen" inline.

**18. The water round has two competing primaries, missing states and a cluttered row** `[flow]`
- Screen: `/tabs/water`, mobile and desktop, plus first-run and guest.
- File: `WaterRound.vue:7-9` (Snap, teal, large, top), `:50-61` (Log, teal, large, footer), `:30-40` (blank while loading), `:219-231` (load errors only reach `console.error`), `:177-179` (snap shows with zero plants), `RoundList.vue:479-482` (generic leaf icon on sunken), `:22-38` (a 40%-wide select on every row).
- Problem: the camera button is the first and biggest thing on the screen but is the secondary path, and it sits in the hardest thumb zone. While loading, the area is blank; on error or for guests the same "Lege zuerst eine Pflanze an" shows, advice a guest cannot follow. With 25 plants the row select repeats 25 times and wraps long names to six lines; rows use a generic icon instead of the tinted placeholder the cards use. After logging, ticked rows stay in place with no done state.
- Fix: make Snap an outline button left of Log in the footer row (hidden when `rows.length === 0` or for guests), leaving Log as the single filled teal action. Use `StateBlock` for loading skeleton rows, error with retry, empty with "Pflanze hinzufügen", and a guest variant with a sign-in action (or hide the tab for guests). Use `PlantPlaceholder` with the plant seed in rows. Show the per-row fertilizer override only when it differs from the round, and collapse logged rows.

**19. Undo for a whole round lives in a 6 second toast** `[a11y]` `[flow]`
- Screen: water round, plant detail, calendar.
- File: `WaterRound.vue:123,269-274`, `services/general/ToastService.ts:239-257`, `WateringStatus.vue:125,133`, `WateringRecords.vue:238-287`.
- Problem: a one-handed user who looks away, or a switch or screen reader user who reaches the toast late, loses the only undo and must delete each record from each plant's calendar. WCAG 2.2.1.
- Fix: undo toasts persist until dismissed (or at least 10 s, paused on focus and hover). Add an in-page "Letzte Runde: 4 Pflanzen, Rückgängig" row on the Water screen.

**20. Dialogs are unnamed, overview screens have no heading and every route has the same title** `[a11y]`
- Screen: all modals and sheets, the five overview screens, browser tab.
- File: `BaseFormModal.vue`, `SnapMatchSheet.vue:2-10`, `ImageModal.vue:2`, `OverviewHeader.vue:7`, `frontend/src/router/index.ts`, `index.html`.
- Problem: the accessibility tree shows `dialog:` with no name for the watering record modal, the snap sheet and the image viewer. The sheet handle reads "Activate to adjust the size of the dialog overlaying the screen" in the German UI. Plants, Water, Substrates, Components and Sales expose no heading; `document.title` is "Plantcare Tracker" everywhere. WCAG 4.1.2, 2.4.2, 1.3.1.
- Fix: `aria-labelledby` to the header heading id on every `ion-modal`; `:handle="false"` plus a localized handle button on the sheet; an `<h1>` inside `ion-title`; a `router.afterEach` that sets a localized `document.title` and refreshes on locale change.

**21. Ionic animations ignore reduced motion, and the CSS fallback is a blanket kill** `[a11y]`
- Screen: all modals, sheets, menu and page transitions.
- File: `frontend/src/main.ts:68`, `frontend/src/theme/custom.css:194-203`.
- Problem: with `reducedMotion: reduce`, the watering record modal still ran two 280 ms Web Animations; the global `0.01ms` rule flattens every CSS transition including useful state cues.
- Fix: `.use(IonicVue, { animated: !matchMedia('(prefers-reduced-motion: reduce)').matches })` or fade-only animation builders. Replace the blanket rule with targeted reductions (shimmer becomes a static tone, the accordion a short opacity change).

**22. The fertilizer segment is announced as three unnamed tabs** `[a11y]`
- Screen: water round.
- File: `WaterRound.vue:14-27`.
- Problem: the label `Dünger für diese Runde` is not associated with the `ion-segment`, so a screen reader hears "tab 1 of 3" for a single-choice setting.
- Fix: `aria-labelledby` on the segment, or use `ion-radio-group` with segmented styling.

**23. The substrate pie borrows role colors as series colors** `[color]`
- Screen: plant detail and substrate detail, "Zusammensetzung".
- File: `PieChart.vue:110,186-192`, `frontend/src/theme/variables.css:99-104` (`--chart-1..3` repeat the primary, secondary and tertiary hex values).
- Problem: Pine bark renders in action green, Perlite in overdue clay, Coco coir in water teal. Adjacent slices are 1.05 to 1.11:1 apart in luminance, so for deuteranopia the three main slices merge. The chart is 300 px tall on a phone and repeats what the parts list already says.
- Fix: a dedicated earth series with no role hues (`--series-1..5`, set at the end), 2 px `--surface-raised` slice gaps, and on mobile a single 24 px stacked 100% bar above the list. Alias `--chart-1,2,3,6` to the role tokens with `var()` so the hex is declared once.

**24. Form errors are not tied to their fields** `[a11y]`
- Screen: Login and every form.
- File: `views/Login.vue:21-43`, `formcomponent/FieldShell.vue`, `FieldError.vue:2`.
- Problem: an empty submit shows two `role="alert"` messages, but both inputs keep `aria-invalid` and `aria-describedby` unset and focus stays on "Anmelden". WCAG 3.3.1.
- Fix: set `aria-invalid` and `aria-describedby` on the input host and focus the first invalid field on submit.

**25. The image viewer zooms by gesture only and has weak alt text** `[a11y]` `[responsive]`
- Screen: photo viewer.
- File: `components/images/ImageModal.vue:11-30,221`, `components/details/HorizontalGallery.vue:34`.
- Problem: zoom needs a pinch, wheel or drag; `touch-action: none` also blocks the browser's own pinch zoom; `+` and `Ctrl+=` do nothing; there is no `touchend` reset. The enlarged alt is only the date. WCAG 2.5.1, 2.1.1, 1.1.1.
- Fix: zoom in, out and reset `IconButton`s with `+`, `-`, `0` keys, a `touchend` and `touchcancel` reset, and `altFor(image)` ("Monty, Foto vom 26.09.2026").

**26. The care guide stream cannot be stopped and does not announce completion** `[a11y]`
- Screen: plant detail, care guide.
- File: `components/plants/MoreInfo.vue:2-27`.
- Problem: the whole section is `aria-busy` while streaming and nothing is announced when it ends. There is no Stop control. The error path (`role="alert"`, partial-content note, Retry) is good.
- Fix: put `aria-busy` on `.guide-text` only, switch the status text to "Pflegeanleitung fertig" on `ready`, and add Stop.

**27. Desktop is a stretched phone in two places** `[flow]`
- Screen: desktop plant list and the side menu.
- File: the overview segment and search (`OverviewHeader` / `SearchBar`), `SideMenu.vue` reminders calendar.
- Problem: the public/private toggle and search stretch to about 1100 px, a 1100 px tap target for a two-option toggle. The 264 px rail crams a month calendar that is cut off above "Menü einklappen". The footer button on the round spans the page while the list is a centered column.
- Fix: cap the segment at 360 px and left-align it with the count; move reminders to their own route or a right panel on wide screens; constrain the footer inner width to `--content-max`.

**28. Logging a past day needs a hidden double tap** `[flow]`
- Screen: plant calendar.
- File: `WateringRecords.vue:33`.
- Problem: a 13 px soft-ink hint says "tap an empty day twice"; a single tap only selects.
- Fix: a single tap on an empty day opens the add modal prefilled with that date; delete the hint.

**29. Logout sits in every list header next to Add** `[flow]`
- Screen: Plants, Water, Substrates, Components, Sales (mobile).
- File: `OverviewHeader.vue:15`.
- Problem: a session-ending action occupies the top-right corner, and the side menu already has it.
- Fix: remove it from `OverviewHeader`; keep it in the menu and on Profile.

### P3

**30. Uppercase leaks** `[flow]`: the back button "ZURÜCK" and alert buttons "ABBRECHEN / OK" use Ionic's md casing, against `DESIGN.md`. Fix in `custom.css`: `ion-back-button, ion-alert .alert-button { text-transform: none; letter-spacing: 0 }`.

**31. Small role slips** `[color]`:
- The overdue status line is teal while its chip is clay (`ItemsOverview.vue:552-556`); set `.status-line.tone-overdue { color: var(--ion-color-secondary-shade) }` (7.12:1 on white; dark `#cc8d6d` 5.71:1 on raised).
- The admin "ok" badge uses success green `#2c7a4b`, 1.24:1 from action green (`utils/sourceStatus.ts:3-8`, `SourceStatusStrip.vue:98-114`); make it a quiet `--status-ok` badge (leaf wash, ink, check icon; 11.96 / 11.38) so only failing and degraded carry saturated color.
- Care guide headings use action green and read as links (`MoreInfo.vue:282-286`); use `--ion-text-color` in the display face.

**32. Token hygiene** `[color]`:
- Hard-coded outliers: `scrollbar.css:3-11` (six hex values, thumb 1.92:1 light and 2.17:1 dark against its track), `CalendarSettingsModal.vue:187-188` (`#FFFFFF` / `#000000` default, an invisible marker on white), `views/Debug.vue` (dev only). Fix: thumb `color-mix(in srgb, var(--ink-soft) 60%, var(--surface-sunken))`, track `var(--surface-sunken)`, category default from a token.
- Duplicates: `--chart-1,2,3,6` repeat four role hex values, `--line` equals `--ion-border-color`, `--ink-soft` `#4d5d52` is a near-duplicate of `--ion-color-medium` `#58695d` in light. No success or warning wash exists, and warning or success as text would fail (1.51 to 1.86 and 4.26 to 4.46 on washes), so keep them fills only.
- The dark tag hole (`--surface-sunken` on raised) reads as a black dot; use `--ion-background-color` there. The Monty hero placeholder fades to pale mint at its bottom edge in dark mode.

**33. Accessibility and performance polish** `[a11y]`: duplicated names on cards and gallery buttons ("Blue Echeveria Blue Echeveria", `ItemsOverview.vue:101`, `HorizontalGallery.vue:17-25`; use `alt=""` inside named buttons); nested `<main>` on Login (`Login.vue:9`); model headings render as `h1` or `h2` (`markdown.ts:40`; clamp to `h3` and below); calendar day buttons are 32 to 40 px wide (`Calendar.vue:382-386`, document the exception or widen); accordion clips at `max-height: 1000px` (`Accordion.vue:158-164`; use `grid-template-rows`); the stream reparses all HTML with `DOMParser` on each chunk (`MoreInfo.vue:127-156`); snap fertilizer chips have no group label (`SnapMatchSheet.vue:60-73`).

**34. Screen-level polish** `[flow]`: the Sales header states one count three times ("36 Einträge / 36 neu" plus a "36" badge); the care guide stacks two disclaimer boxes (merge them); plant detail shows the first photo twice on mobile (hero and gallery); the 300 px pie sits between calendar and parts list; per-row "Jetzt prüfen" outline buttons repeat on healthy admin rows (show them for failing and degraded only); the snap "logged" state leaves 60% of the sheet empty and gives Undo and Done equal weight (show the matched thumbnail, make Done filled and Undo text-only, open at 0.45).

---

## Color answers, in short

- **One palette or competing systems?** One palette. `variables.css` declares a full light and dark token set, Ionic's `--ion-color-*` are remapped onto it, and `color="tertiary"` style props resolve to tokens. The competition is at the edges: Ionic's untokened greys (finding 16), role overload (14), a store, a modal, a scrollbar sheet and `darkMode.ts` that bypass tokens (10, 32, 13), and the header decision (13).
- **Semantic roles today:** watering and due are teal (`--ion-color-tertiary`, wash `#dcf0f2`); overdue, fertilizer, new, discount and offline are all clay; error is brick for fields and clay wash for banners; success and warning exist only as solid admin badges; guest and read-only have no color or icon treatment.
- **Calendar:** the plant calendar uses `--water` fill for watered days and a clay ring for fertilizer; the user-editable watering categories never render (10); reminder categories accept arbitrary colors with a failing text helper (8).
- **UI chrome next to photos:** the app has no scrims, gradients or text over photos. The only overlay is the opaque NEU pill (white on clay, 5.89:1 light, 8.42:1 dark). Keep future badges opaque. Seed photos render as placeholders in the dev stack, so photographic overlays were not measured.
- **Dark mode:** complete and authored (an earthy moss palette, not an inversion); all 16 audited screens pass text contrast. Defects are the mint header (13), the white blank reminder swatch and `#8B4513` marker at 2.51:1 (10), the scrollbar (32) and the grey `ion-select` (16).
- **AA failures verified:** focus ring 1.00 to 1.08:1 on solid fills (7); category text 1.04 to 3.45:1 (8); segment labels 3.81:1 (9); watering defaults 3.24 and 4.39:1 (10); control edges 1.37:1 (15); scrollbar 1.92 and 2.17:1 (32). Everything else rendered in light and dark passes, including the status chips (6.22 and 5.89), the Water now button (6.22) and the scraper badges.

## What works

- The plant tag card system (perforation, punched hole, display-face names, per-plant tinted placeholders) is specific to a potting bench logbook and scales from 360 to 1440 px.
- The watering band: one 52 px teal Water now, a quiet "Mit Details eintragen", the bottom-up wash on success and an undo toast.
- `StateBlock` gives loading, empty, error with retry and no-results across overviews, with the `role="status"` and `role="alert"` used deliberately; the calendar is a real keyboard grid with state in the accessible name; modals trap focus, close on Escape and return focus; no horizontal overflow at 320 to 1440 px; no interactive element under 44 px apart from the tab bar width and calendar days.
- The token discipline: nearly every text pair passes AA by a wide margin in both themes, and `DESIGN.md`'s tokens-only rule holds across all shipped components.

## Not verified

Real screen reader speech (NVDA, VoiceOver, TalkBack); physical devices and iOS Safari; two-finger pinch and sheet drag; the on-screen keyboard against the sticky round footer; the English layout (all runs used German); a real model stream format; the guest login screen itself (a session redirect hid it); text over real photos; hover, pressed and disabled Ionic state layers. The focus ring failure is computed from CSS and fill values, not captured in a rendered focus state.

---

## Proposed color token set

Keep every existing role token and its dark pair. Add the tokens below; every ratio was computed with the WCAG 2.x formula against the stated background. The class that switches dark is `.ion-palette-dark`.

### Semantic map

| Meaning | Token | Light | Dark |
|---|---|---|---|
| Action, selected, link | `--ion-color-primary` (keep) | `#1f6b3b` | `#74cf93` |
| Water, due, watered day | `--ion-color-tertiary` / `--water` (keep) | `#0e6b75` | `#63c6d1` |
| Overdue only | `--ion-color-secondary` / `--overdue` (narrowed) | `#a34a28` | `#e8a07c` |
| Fertilizer, organic | `--feed-organic` (new) | `#7a4a12` | `#e0b46a` |
| Fertilizer, mineral | `--feed-mineral` (new) | `#6b4f8a` | `#b79ad6` |
| New, discount-adjacent badge | `--new` (new, replaces clay on NEW) | `#f0b429` (ink `#0e1812`) | `#f5c451` (ink `#0e1812`) |
| Error | `--ion-color-danger` (keep) and `--danger-wash` (new) | `#b3261e` / `#fbe3e1` | `#ff948b` / `#3d1a18` |
| Degraded | `--ion-color-warning` as fill only, `--warning-wash` (new) | `#f0b429` / `#fdf0cc` | `#f5c451` / `#3a2f10` |
| OK (admin) | `--status-ok` (new): leaf wash, ink, check icon | `#dcebdf` | `#163423` |
| Offline | `--offline-bg` (new): `--surface-sunken` plus cloud icon | `#e6ede2` | `#0b130f` |
| Public / guest read-only | no fill color; `--surface-sunken` chip, globe or lock icon in `--ink-soft` | `#e6ede2` | `#0b130f` |

### New and changed tokens, with contrast

| Token | Light | Dark | Contrast | Replaces |
|---|---|---|---|---|
| `--chrome-bg` (header, tab bar, footer) | `#ffffff` | `#14221a` | title ink 14.78 / 13.84; icons in primary 6.51 / 8.71 | `--ion-color-primary` as header background |
| `--feed-organic` | `#7a4a12` | `#e0b46a` | white on it 7.46; as ring on raised 7.46 / 8.19; dark ink on it 9.42 | clay fertilizer ring, green organic chip, `#8B4513` |
| `--feed-mineral` | `#6b4f8a` | `#b79ad6` | white on it 6.75; on page 6.19; dark ink on it 7.43; on dark raised 6.46 | green mineral chip, `#228B22`, `#1E90FF` |
| `--new` | `#f0b429` | `#f5c451` | ink `#0e1812` on it 9.73 / 11.14 | clay NEW pill, tab badge, "n neu" |
| `--danger-wash` | `#fbe3e1` | `#3d1a18` | ink 12.09 / 12.97; danger text on it 5.35 / 7.25 | clay wash on error banners |
| `--warning-wash` | `#fdf0cc` | `#3a2f10` | ink 13.03 / 11.06 | optional degraded row tint |
| `--nav-idle` (= `--ink-soft`) | `#4d5d52` | `#a5b9aa` | on white 6.99; on sunken 5.85 / 9.08; on dark toolbar 7.95 | `#595959`, `#acacac`, `#6d796f`, `#808080`, `#7f8881` |
| `--control-border` | `#839185` | `#74877a` | on white 3.31, on page 3.03; dark on raised 4.12, on page 4.66 | `--line` on search, selects, private chip |
| `--focus-ring` (keep value, new geometry) | `#0e6b75`, 3 px, 2 px outside | `#63c6d1`, 3 px, 2 px outside | on page 5.70 / 8.94; inner `#ffffff` ring on teal fill 6.22 | inset ring on solid buttons |
| `--overdue-ink` (= secondary-shade) | `#8f4123` | `#cc8d6d` | on white 7.12; on dark raised 5.71 | teal overdue status line |
| `--series-1..5` (composition charts) | `#8a7a1e` `#4f6488` `#8a4f6b` `#58695d` `#7a4a12` | `#d8c85a` `#9fb3d6` `#d69ab7` `#a5b9aa` `#e0b46a` | light on white 4.30 / 5.98 / 6.16 / 5.84 / 7.46; dark on raised 9.26 / 7.43 / 6.88 / 7.60 / 8.19 | `--chart-1..3` role colors in the pie |
| `--category-ink` (computed) | `#0e1812` or `#ffffff` | same rule | at least 4.5 by construction | `contrastTextColor` output |

### Alias and cleanup rules

- Declare each hex once: `--chart-1,2,3,6: var(--ion-color-primary|secondary|tertiary|medium)`, `--ion-border-color: var(--line)`, `--focus-ring: var(--ion-color-tertiary)`, and add `--clay` and `--leaf` aliases beside `--water`.
- Add `--radius-pill` usage everywhere `999px` appears (`ItemsOverview.vue`, `PlantTag.vue:86`) and one shared `.tone-chip` for the `2px 10px` pill paddings.
- Never use `--ion-color-warning` or `--ion-color-success` as text; they stay fills with their contrast colors.
- Retire the offenders in this order: `stores/calendar.ts:15-26` and `CalendarSettingsModal.vue:187-188` defaults, `scrollbar.css:3-11`, `darkMode.ts:14`, then the Ionic greys in `custom.css`.

### Draft CSS

```css
:root {
  --chrome-bg: #ffffff;
  --feed-organic: #7a4a12;
  --feed-mineral: #6b4f8a;
  --new: #f0b429;
  --new-ink: #0e1812;
  --danger-wash: #fbe3e1;
  --warning-wash: #fdf0cc;
  --nav-idle: var(--ink-soft);
  --control-border: #839185;
  --overdue-ink: var(--ion-color-secondary-shade);
  --offline-bg: var(--surface-sunken);
  --series-1: #8a7a1e; --series-2: #4f6488; --series-3: #8a4f6b;
  --series-4: #58695d; --series-5: #7a4a12;
}
.ion-palette-dark {
  --chrome-bg: #14221a;
  --feed-organic: #e0b46a;
  --feed-mineral: #b79ad6;
  --new: #f5c451;
  --danger-wash: #3d1a18;
  --warning-wash: #3a2f10;
  --control-border: #74877a;
  --series-1: #d8c85a; --series-2: #9fb3d6; --series-3: #d69ab7;
  --series-4: #a5b9aa; --series-5: #e0b46a;
}
```
