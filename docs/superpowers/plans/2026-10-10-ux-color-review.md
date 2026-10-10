# UX and Color Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. On approval this file is copied to `docs/superpowers/plans/2026-10-10-ux-color-review.md` and committed on `feat/ux-color-review`.

**Goal:** Resolve all 34 findings of `docs/refactor/ux-color-review.md`: restore the meaning of the color palette, fix the five AA contrast failures, repair the broken flows (care guide, tab bar, offline banner, snap confidence, never-watered plants, guest history) and close the accessibility and polish gaps.

**Architecture:** Frontend-first. A token layer (new semantic tokens plus a contrast utility guarded by a token test) goes in first, then color semantics, then logic and flow fixes, then accessibility, then polish. One backend change (optional species and substrate on plants). Existing tests that encode the old behaviour are rewritten deliberately.

**Tech Stack:** Ionic Vue 8 (Options API only), Pinia, vitest 4 with jsdom, vue-tsc; Fastify 5, Kysely, zod 4, vitest (backend task 15 only).

**Source of truth:** `docs/refactor/ux-color-review.md` (finding numbers below refer to it; it carries file:line evidence and measured values). Branch `feat/ux-color-review`, created from `feat/quick-watering` (PR #42 is unmerged); the PR targets `feat/quick-watering` and is retargeted to `main` after #42 merges.

## Decisions already made

- Scope: all 34 findings (P1, P2, P3).
- Tab bar: keep five tabs, tighten sizing, shorten the German label for Components to "Zutaten" (tab label key only).
- Headers: raised surface (`--chrome-bg`) with green icons and ink title, in light and dark.
- Watering categories: keep the color pickers and make them real. Calendar markers, legend and chips render the effective category colors; contrast is enforced at render time.
- Delivery: one PR at the end, no further stacking.

## Global Constraints

- Frontend stays on the Options API; `.vue` files never use `<script setup>` and never import `@/utils/apiUtils` or `tokenUtils` (`frontend/src/tests/conventions.test.ts`).
- Every new user-visible string needs a key in both `frontend/src/locales/de.ts` and `en.ts` (flat dotted keys, real German); `pnpm run check-keys` must exit 0.
- Styling uses tokens only; icons come from `frontend/src/theme/icons.ts`; no new hex outside `variables.css`.
- No em or en dashes anywhere (code, comments, docs, locale strings, commit messages). Comments only for non-obvious present behaviour.
- Commit messages carry no Claude or AI attribution and no trailers.
- Dark mode is the class `:root.ion-palette-dark` only (no OS media query); put new dark tokens inside the existing `:root.ion-palette-dark` block of `variables.css`.
- Never run `pnpm dev`; use `node scripts/dev-up.mjs --id <name>` and `dev-down.mjs` (see root `CLAUDE.md`).
- Frontend gates: `pnpm run lint`, `format:check`, `pnpm exec vue-tsc --noEmit`, `pnpm run check-keys`, `pnpm exec vitest run --coverage`, `pnpm run build`. Backend gates (task 15): `pnpm run lint`, `format:check`, `typecheck`, `test:coverage`, `build`. Run backend and frontend suites one after the other, never concurrently.
- Contrast thresholds (WCAG 2.x): 4.5:1 normal text, 3:1 large text, UI components and meaningful icons.

## Review Focus (risks the tasks must pin with tests)

1. **Persisted user data:** stored watering categories still hold the old defaults (`#1E90FF`, `#8B4513`, `#228B22`); stored reminder dates carry a `textColor` computed by the old helper. Both must display correctly after the change without a user action (tasks 5, 6).
2. **User-picked colors in dark mode:** a color picked in light mode can be invisible on the dark page; the effective color must be corrected at render time (task 5).
3. **Longer German labels:** every new German string must fit at 360 px; the tab labels are the known failure (task 12).
4. **A plant with no species:** list, detail, search and sort must handle `null` species without showing "Unknown" literals from the backend (task 15).
5. **Never-watered plants on every surface:** list chip, round pre-tick, snap rerank bonus and sort order must agree on the new `new` tone (tasks 8, 10).

## Execution

Sequential, one implementer per task (sonnet; the first task of each phase and tasks 5, 6, 15, 19, 20 on a mid-tier or better model because they carry design judgment), each followed by a task review; one final whole-branch review on the most capable model; one fix wave; a real-browser verification pass (Edge, phone and desktop, light and dark, German) before the PR. Execution order is the task order. Dependencies: 4 needs 1; 6 needs 5; 10 and 11 need 8; 16 needs 11; 17 and 19 reuse `nextFieldId` from `components/formcomponent/fieldShared.ts`.

---

## Phase 0: Branch and baseline (controller, no subagent)

- [ ] `git checkout feat/quick-watering && git checkout -b feat/ux-color-review`.
- [ ] Commit the untracked review as the first commit: `git add docs/refactor/ux-color-review.md && git commit -m "docs: UX and color review"`.
- [ ] Run the frontend gates once and record the baseline (50 files, 502 tests at the start).

---

## Phase 1: Token and theme foundation

### Task 1: Semantic tokens, contrast utility and token guard (findings 7 to 10, 13 to 16, 23, 32 tokens)

**Files:**
- Modify: `frontend/src/theme/variables.css`
- Create: `frontend/src/utils/contrast.ts`
- Create: `frontend/src/tests/contrast.test.ts`, `frontend/src/tests/themeTokens.test.ts`
- Modify: `frontend/docs/design-system.md`, root `DESIGN.md` (token tables)

**Interfaces (produced, used by tasks 3 to 6, 13, 25):**

```ts
export const contrastRatio = (a: string, b: string): number;          // hex strings, 3 or 6 digits
export const readableInk = (background: string, dark?: string, light?: string): string; // dark default "#0e1812", light default "#ffffff"; returns the one with the higher ratio
export const ensureContrast = (color: string, background: string, minRatio: number): string; // mixes toward black or white until minRatio is met; returns color unchanged when it already passes
```

- [ ] **Step 1: write `contrast.test.ts` (RED)**. Cases: `contrastRatio("#000000","#ffffff")` is 21; `contrastRatio("#0e6b75","#0e6b75")` is 1; `readableInk("#ff9800")` is `#0e1812` (dark ink), `readableInk("#1f6b3b")` is `#ffffff`; mid grey `#808080` yields whichever passes at least 4.5 or the better of the two; `ensureContrast("#1E90FF","#0f1a14",3)` returns a color with ratio at least 3 against `#0f1a14`; `ensureContrast` returns the input unchanged when it already passes; 3-digit hex is accepted; invalid hex falls back to the input.
- [ ] **Step 2: implement `contrast.ts`**:

```ts
const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const parse = (hex: string): [number, number, number] | null => {
  const m = hex.trim().replace("#", "");
  const full = m.length === 3 ? [...m].map((c) => c + c).join("") : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
};

const luminance = ([r, g, b]: [number, number, number]): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

export const contrastRatio = (a: string, b: string): number => {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 1;
  const [hi, lo] = [luminance(pa), luminance(pb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

export const readableInk = (background: string, dark = "#0e1812", light = "#ffffff"): string =>
  contrastRatio(dark, background) >= contrastRatio(light, background) ? dark : light;

const toHex = (rgb: number[]): string =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

export const ensureContrast = (color: string, background: string, minRatio: number): string => {
  const rgb = parse(color);
  const bg = parse(background);
  if (!rgb || !bg || contrastRatio(color, background) >= minRatio) return color;
  const target = luminance(bg) > 0.5 ? 0 : 255;
  for (let step = 1; step <= 25; step++) {
    const mixed = rgb.map((v) => v + (target - v) * (step * 0.04));
    const candidate = toHex(mixed);
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
  }
  return toHex([target, target, target]);
};
```

- [ ] **Step 3: add tokens to `variables.css`** (light block after the washes at line 84, dark block after line 215, series after the chart blocks at 104 and 231):

```css
/* light, inside :root */
--chrome-bg: #ffffff;
--nav-idle: var(--ink-soft);
--control-border: #839185;
--feed-organic: #7a4a12;
--feed-organic-contrast: #ffffff;
--feed-mineral: #6b4f8a;
--feed-mineral-contrast: #ffffff;
--new: #f0b429;
--new-ink: #0e1812;
--danger-wash: #fbe3e1;
--warning-wash: #fdf0cc;
--offline-bg: var(--surface-sunken);
--overdue-ink: var(--ion-color-secondary-shade);
--category-ink: #0e1812;
--series-1: #8a7a1e; --series-2: #4f6488; --series-3: #8a4f6b;
--series-4: #58695d; --series-5: #7a4a12;
--z-banner: 20001;

/* dark, inside :root.ion-palette-dark */
--chrome-bg: #14221a;
--control-border: #74877a;
--feed-organic: #e0b46a;
--feed-organic-contrast: #0e1812;
--feed-mineral: #b79ad6;
--feed-mineral-contrast: #0e1812;
--new: #f5c451;
--danger-wash: #3d1a18;
--warning-wash: #3a2f10;
--series-1: #d8c85a; --series-2: #9fb3d6; --series-3: #d69ab7;
--series-4: #a5b9aa; --series-5: #e0b46a;
```

  Also dedupe: `--chart-1: var(--ion-color-primary)`, `--chart-2: var(--ion-color-secondary)`, `--chart-3: var(--ion-color-tertiary)`, `--chart-6: var(--ion-color-medium)` (charts read computed values, so the alias resolves); `--ion-border-color: var(--line)` in both blocks; add `--clay: var(--ion-color-secondary)` and `--leaf: var(--ion-color-primary)` beside `--water`.
- [ ] **Step 4: write `themeTokens.test.ts` (RED before step 3, GREEN after)**. Read `../theme/variables.css` with `import.meta.glob("../theme/variables.css", { query: "?raw", import: "default", eager: true })`, split into the `:root` block and the `:root.ion-palette-dark` block, parse `--name: value;` into maps, resolve one level of `var(--x)`. Assert for both themes the pairs and minimum ratios (computed values are in the review): `--feed-organic` vs `--surface-raised` at least 7 light / 8 dark; `--feed-mineral` vs `--surface-raised` at least 6 / 6.4; `--feed-*-contrast` on its fill at least 6.7; `--new-ink` on `--new` at least 9.7; `--ink-soft` on `--surface-sunken` at least 5.8; `--control-border` vs `--surface-raised` at least 3 (light 3.31, dark 4.12); `--focus-ring` vs `--ion-background-color` at least 5.7; `--overdue-ink` on `--surface-raised` at least 5.7; `--series-1..5` vs `--surface-raised` at least 4.3; `--ion-text-color` on `--danger-wash` and `--warning-wash` at least 11. Also assert every token name in the review's proposed set exists in both blocks (or is intentionally light-only).
- [ ] **Step 5: update the token tables in `frontend/docs/design-system.md` and `DESIGN.md`** (new semantic roles: feed-organic, feed-mineral, new, danger-wash, warning-wash, offline-bg, nav-idle, control-border, chrome-bg, series-1..5; remove "clay means fertilizer" wording; clay = overdue only).
- [ ] **Step 6: gates and commit** `feat(theme): semantic color tokens, contrast utility and token guard`.

### Task 2: Ionic neutrals, focus ring, edges and uppercase (findings 7, 9, 15, 16, 30, 32 CSS)

**Files:** `frontend/src/theme/custom.css`, `scrollbar.css`; `components/ui/SearchBar.vue`; `components/plants/PlantTag.vue`, `components/ui/DetailHero.vue` (private chip ring); the six color-mix files (`formcomponent/FieldShell.vue`, `substrates/ComponentSelection.vue` x2, `formcomponent/fields/RadioField.vue`, `SwitchField.vue`, `UploadField.vue`); Create: `frontend/src/tests/themeCss.test.ts`.

- [ ] **Step 1: write `themeCss.test.ts` (RED)** using raw CSS and `.vue` globs: `custom.css` contains `.ion-focused` rules for `ion-button`, `ion-tab-button`, `ion-segment-button`, `ion-select`, `ion-menu-button`, `ion-back-button`, `ion-fab-button`; contains no `outline-offset: -3px`; `custom.css` sets `ion-segment-button` `--color` and `ion-tab-button` `--color` to `var(--nav-idle)`; contains `text-transform: none` for `ion-back-button` and `ion-alert .alert-button`; has no `ion-input.field-input` block; `scrollbar.css` contains no `#` hex; no `.vue` file contains `color-mix(in srgb, var(--ink-soft) 60%, var(--line))`.
- [ ] **Step 2: replace the focus block (`custom.css:65-76`)**:

```css
:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; border-radius: var(--radius-sm); }
ion-button.ion-focused, ion-tab-button.ion-focused, ion-segment-button.ion-focused,
ion-select.ion-focused, ion-menu-button.ion-focused, ion-back-button.ion-focused,
ion-fab-button.ion-focused {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
ion-button.button-solid.ion-focused, ion-fab-button.ion-focused {
  box-shadow: 0 0 0 2px var(--ion-background-color);
}
```

- [ ] **Step 3: neutrals**: `ion-segment-button { --color: var(--nav-idle); }`; `ion-tab-button { --color: var(--nav-idle); }`; `ion-select { --background: var(--surface-sunken); color: var(--nav-idle); }`, `ion-select::part(icon) { color: var(--nav-idle); opacity: 1; }`; menu item icons (`SideMenu.vue` scoped style) `ion-icon { color: var(--nav-idle); }`.
- [ ] **Step 4: edges**: `SearchBar.vue:86` `--box-shadow: inset 0 0 0 1px var(--control-border)`; private chip ring in `PlantTag.vue` and `DetailHero.vue` uses `--control-border`; the six `color-mix` borders become `border: 1.5px solid var(--control-border);`.
- [ ] **Step 5: uppercase and dead CSS**: `ion-back-button, ion-alert .alert-button { text-transform: none; letter-spacing: 0; }`; delete `ion-input.field-input` rules (`custom.css:205-218`); `.sheet-title` weight 700 to 650 in `SnapMatchSheet.vue`.
- [ ] **Step 6: scrollbar** (`scrollbar.css`): thumb `color-mix(in srgb, var(--ink-soft) 60%, var(--surface-sunken))`, thumb-hover `var(--ink-soft)`, track `var(--surface-sunken)`; delete the dark hex block.
- [ ] **Step 7: gates and commit** `fix(theme): focus ring on Ionic controls, neutral tokens, control edges`.

### Task 3: Raised headers and theme-color (finding 13)

**Files:** `components/overview/OverviewHeader.vue`, `components/details/DetailsHeader.vue`, `components/admin/AdminHeader.vue`, `components/SideMenu.vue` (header styles), `theme/darkMode.ts`, `frontend/index.html`, `components/plants/PlantTag.vue` and `components/ui/DetailHero.vue` (tag hole); Create: `frontend/src/tests/darkMode.test.ts`.

- [ ] **Step 1: write `darkMode.test.ts` (RED)**: set `document.documentElement.style.setProperty("--chrome-bg", "#ffffff")`, call the exported `setDarkMode(true)` after changing the property to `#14221a` (jsdom reads inline custom properties), and assert `meta[name=theme-color]` content equals the `--chrome-bg` value for each theme; assert the class toggles; assert no hard-coded hex remains in `darkMode.ts` (raw glob).
- [ ] **Step 2: `darkMode.ts`**: replace the two literals with
  `const value = getComputedStyle(document.documentElement).getPropertyValue("--chrome-bg").trim(); meta?.setAttribute("content", value)` executed after the class toggle. Set the `index.html` `theme-color` to `#ffffff`.
- [ ] **Step 3: headers**: in the three header components and `SideMenu.vue` remove the `--background: var(--ion-color-primary)`, `--color` and title overrides; use `--background: var(--chrome-bg); --color: var(--ion-text-color); --border-color: var(--line); --border-width: 0 0 1px;`; icon buttons and menu button `--color: var(--ion-color-primary)`; titles `color: var(--ion-text-color)`. Keep the segment toolbar and the sticky `z-index`. The primary "add" `icon-button` on the segment row stays solid primary.
- [ ] **Step 4: tag hole**: `.hole` uses `var(--ion-background-color)` in both themes (`PlantTag.vue:54-63`, `DetailHero.vue:86-87`).
- [ ] **Step 5: gates and commit** `feat(theme): raised surface headers and matching theme-color`.

### Task 4: Role color semantics (findings 14, 23, 31 color items, 32 duplicates)

**Files:** `components/overview/ItemsOverview.vue` (`.count-new`, `.new-pill`, `.discount-chip`, `.status-line`), `views/TabsPage.vue` and `components/SideMenu.vue` (badges), `components/plants/PlantTag.vue` + `ui/DetailHero.vue` (public chip), `components/ui/OfflineBanner.vue` (color only; geometry is task 13), `components/admin/RefreshErrorBanner.vue`, `components/plants/MoreInfo.vue` (error wash and headings), `utils/sourceStatus.ts`, `components/admin/SourceStatusStrip.vue`, `SourceRow.vue`, `components/charts/PieChart.vue`, `components/substrates/SubstrateContainer.vue`, `theme/custom.css` (`.tone-chip`); Create: `frontend/src/tests/colorRoles.test.ts`.

- [ ] **Step 1: write `colorRoles.test.ts` (RED)** with raw `.vue` and CSS globs: an allow-list test that `--ion-color-secondary` / `color="secondary"` appears only in `custom.css` (`.tone-overdue`), `ItemsOverview.vue` (overdue chip) and `Calendar.vue` (removed in task 6, so not allowed after it); `.new-pill`, `.count-new`, the TabsPage and SideMenu badges use `--new`/`--new-ink`; `PieChart.vue` and `SubstrateContainer.vue` reference `--series-` and not `--chart-N` for slices; `MoreInfo.vue` guide error uses `--danger-wash`; `OfflineBanner.vue` offline state uses `--offline-bg`; `.status-line.tone-overdue` uses `--overdue-ink`; `sourceStatus.ts` still maps `ok` to tone `success` (existing test `adminSalesDisplay.test.ts:123-125` must stay green, so keep the tone name and change only the rendering).
- [ ] **Step 2: NEW / badge / count** (`.new-pill`, tab badge, side menu badge, `.count-new`): background `var(--new)`, color `var(--new-ink)`; badges use a class instead of `color="secondary"`. `.discount-chip`: `background: var(--surface-sunken); color: var(--ion-text-color)` plus a `%` icon from `icons.ts`.
- [ ] **Step 3: status line**: `.status-line.tone-due { color: var(--ion-color-tertiary-shade) }`, `.status-line.tone-overdue { color: var(--overdue-ink) }`.
- [ ] **Step 4: banners**: `RefreshErrorBanner` and the care guide error use `--danger-wash` with ink text and a danger icon; offline uses `--offline-bg`; the online confirmation uses `--leaf-wash` (unchanged).
- [ ] **Step 5: public chip** neutral: `.chip-public { background: var(--surface-sunken); color: var(--ink-soft); }` in `PlantTag.vue` and `DetailHero.vue`.
- [ ] **Step 6: admin ok badge** quiet: `.tone-success` in `SourceStatusStrip.vue` and the `SourceRow` badge render `--leaf-wash` background, ink text and a check icon; `.tone-danger` and `.tone-warning` stay solid.
- [ ] **Step 7: charts**: `PieChart.vue` and `SubstrateContainer.vue` read `--series-1..5` (set `PALETTE_SIZE = 5`), `.swatch-N` map to `--series-N`; on viewports under 576 px `SubstrateContainer` shows a single 24 px stacked bar above the list instead of the pie (CSS `@media` toggles the two elements; keep the legend list). `LineChart.vue` keeps `--chart-*`.
- [ ] **Step 8: care guide headings** `.guide-text .info-header { color: var(--ion-text-color); font-family: var(--font-display) }` (check the display font var name in `variables.css`).
- [ ] **Step 9: pill sizing**: add `.tone-chip` to the NEW pill and status chip where the same pill idea is used, replace the `2px 10px`, `1px 8px` paddings and `999px` literals with `--space-1 --space-2` and `--radius-pill`.
- [ ] **Step 10: gates and commit** `fix(color): one job per role color, series tokens for charts`.

---

## Phase 2: Watering categories made real (finding 10, finding 8)

### Task 5: Category colors resolved at render time (findings 8, 10 data layer)

**Files:** `frontend/src/utils/categoryColors.ts`, `stores/calendar.ts`, `types/calendarTypes.d.ts` (comment only), `components/calendar/CalendarSettingsModal.vue`, `components/calendar/MenuCalendar.vue`; tests `formHelpers.test.ts` (rewrite the `contrastTextColor` cases), `calendarAndAdminStores.test.ts`, new `categoryColors.test.ts`.

**Interfaces (produced, used by task 6):**

```ts
// categoryColors.ts
export const contrastTextColor = (backgroundHex: string): string;         // now readableInk(backgroundHex)
export interface ResolvedCategoryColors { background: string; text: string }
export const resolveCategoryColors = (
  category: Category,
  tokens: { fallback: string; page: string },   // fallback = computed token hex, page = computed --ion-background-color
): ResolvedCategoryColors;
// rules: empty backgroundColor means "use the role token"; a user color is passed through ensureContrast(color, page, 3);
// text = readableInk(background) always (persisted textColor is ignored)
export const DEFAULT_WATERING_TOKENS: Record<string, string>; // category name -> CSS custom property: no_fertilizer "--water", organic "--feed-organic", mineral "--feed-mineral"
```

- [ ] **Step 1: write `categoryColors.test.ts` (RED)**: `contrastTextColor` returns at least 4.5 for 50 pseudo-random backgrounds (seeded loop, assert `contrastRatio(contrastTextColor(bg), bg) >= 4.5` or, for mid greys where neither ink reaches 4.5, that the result is the better of the two and `ensureContrast` of the background reaches 4.5); `resolveCategoryColors` with empty color uses the fallback; with `#1E90FF` on a dark page returns a color with at least 3:1 against that page; text color is ink for light backgrounds and white for dark ones; persisted `textColor: "#99c2ff"` is ignored.
- [ ] **Step 2: implement** the helpers in `categoryColors.ts` using task 1's `contrast.ts`; keep `categoryNameProblem` unchanged; delete `hexToHsl`, `hueToRgb`, `hslToHex` if nothing else uses them (grep first).
- [ ] **Step 3: store defaults** (`stores/calendar.ts:12-28`): defaults become `{ name, textColor: "", backgroundColor: "" }` for the three names (empty means "role token"). In the persistence `apply` for `watering_categories`, map any stored entry whose `backgroundColor` equals one of the legacy defaults (`#1E90FF`, `#8B4513`, `#228B22`, case-insensitive) to `""`, so users who never customised get the tokens. Update `calendarAndAdminStores.test.ts`: defaults still named `[no_fertilizer, organic, mineral]` and length 3; add a test that legacy stored defaults migrate to `""` and a customised value is kept.
- [ ] **Step 4: settings modal**: the three pickers show the effective color: when `backgroundColor` is empty, initialise the `<input type="color">` value from `getComputedStyle(documentElement).getPropertyValue(DEFAULT_WATERING_TOKENS[name])` (hex); the "Reset colors" button sets all three back to `""`; the debounced watering handler no longer writes `textColor`. Reminder categories: stop writing `textColor` in the debounce and `addCategory` (store `""`), `blankCategory()` default background is a token hex read at runtime rather than `#FFFFFF`, text color field in `MenuCalendar.vue:154-156` becomes read-only effective ink. Update the settings note keys `calendar.settings.watering_categories_info` in both locales (colors adjustable, an empty choice follows the app palette and adapts to dark mode, contrast is adjusted automatically).
- [ ] **Step 5: gates and commit** `feat(calendar): category colors resolve at render time with enforced contrast`.

### Task 6: Calendar markers, legend and fertilizer chips use the real colors (finding 10)

**Files:** `components/calendar/Calendar.vue`, `calendar/CalendarLegend.vue`, `components/plants/watering/WateringRecords.vue`, `components/water/SnapMatchSheet.vue` (chips), `views/water/WaterRound.vue` (segment checked color), `theme/custom.css` (segment checked), tests `viewReactivity.test.ts` (:134-148), `snapMatchSheet.test.ts`, new `calendarMarkers.test.ts`.

- [ ] **Step 1: update the mapping test (RED)**: in `viewReactivity.test.ts` a record with `fertilizerTypeId: 1` maps to `watering.category.organic`, `fertilizerTypeId: 2` to `watering.category.mineral`, not fertilized to `watering.category.no_fertilizer`. Update the implementation in `WateringRecords.mappedRecords`: `category.name = !record.usedFertilizer ? NO_FERTILIZER : record.fertilizerType === "synthetic" || record.fertilizerTypeId === 2 ? MINERAL : ORGANIC` (the store exposes `fertilizerName`; the backend type names are `organic` and `synthetic`).
- [ ] **Step 2: write `calendarMarkers.test.ts` (RED)** by mounting `Calendar.vue` (stub Ionic) in `marker-mode="watering"` with entries of the three categories and a categories prop/store: day cells carry `is-water`, `is-organic`, `is-mineral` classes and a `--marker-bg` style that equals the resolved color; organic and mineral markers use different ring styles (`is-organic` solid, `is-mineral` dashed) so color is not the only cue; the legend lists four items (watered, organic, mineral, today) with swatches from the same resolved colors.
- [ ] **Step 3: implement**: in `Calendar.vue` replace `markerKind` with a function returning `"water" | "organic" | "mineral" | "custom"` (watering mode picks fertilizer first when several entries share a day, mineral over organic over water); add a computed `resolved` using `resolveCategoryColors` with `fallback` read from the CSS token for that category and `page` from `--ion-background-color` (re-read on theme change: reuse the `MutationObserver` pattern of `PieChart.vue`, or recompute via a `theme` ref toggled by the class observer). CSS: `.is-water .day-number { background: var(--marker-bg); color: var(--marker-fg); }`, `.is-organic .day-number { border: 3px solid var(--marker-bg); }`, `.is-mineral .day-number { border: 3px dashed var(--marker-bg); }`. `Calendar.vue` reads categories from `useCalendarStore().wateringCategories` in watering mode (the prop for plain reminders stays). Remove `--ion-color-secondary` and `--water` literals from `legendItems` (watering) in favour of the resolved colors; `CalendarLegend.vue` gains a `dashed` shape.
- [ ] **Step 4: chips and segment**: `SnapMatchSheet.vue` `.fertilizer-chip` border and text use `--feed-organic` or `--feed-mineral` (set a `data-kind` attribute from the type name), selected fill uses the same token with `--feed-*-contrast` text; the round fertilizer segment checked label uses the same pair via a `data-kind` attribute on each `ion-segment-button`. Update the two chip tests to check the `data-kind` attributes and that Done keeps primary.
- [ ] **Step 5: remove the clay allowance** for `Calendar.vue` in `colorRoles.test.ts` (task 4's allow-list).
- [ ] **Step 6: gates and commit** `feat(calendar): organic and mineral fertilizer are distinct and follow category colors`.

---

## Phase 3: Logic and flow fixes

### Task 7: Care guide renderer (findings 1, 33 heading level)

**Files:** `frontend/src/utils/markdown.ts`, `frontend/src/tests/markdown.test.ts`.

- [ ] **Step 1: rewrite the three tests that encode the bug or the old levels (RED)**: the dash list test (`markdown.test.ts:27-32`) now expects one `<ul>` with two `<li>` for `"- one\n- two"`; headings render one level lower and never above `h3` (`#` and `##` give `h3`, `###` gives `h4`); add `"## Licht\nHelles Licht.\n\n## Gießen\nWenig."` renders both headings **and** both paragraphs; `"## Licht\n- a\n- b"` renders a heading and one list of two items; a partial buffer ending in `"## Lic"` does not throw.
- [ ] **Step 2: implement**: drop the `.replace(/(\n- )/g, "\n\n- ")` rewrite and process each blank-line block line by line:

```ts
const HEADING = /^(#{1,6})\s*(.*)$/;
const LIST_ITEM = /^([-*]|\d+\.)\s+/;

const renderBlock = (block: string): string => {
  let html = "";
  let paragraph: string[] = [];
  let items: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) html += `<p class="info-text-paragraph">${renderInlines(paragraph.join(" "))}</p>`;
    paragraph = [];
  };
  const flushList = () => {
    if (items.length) html += `<ul class="info-list">${items.map((i) => `<li class="info-item">${renderInlines(i)}</li>`).join("")}</ul>`;
    items = [];
  };
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(HEADING);
    if (heading) {
      flushParagraph(); flushList();
      const level = Math.max(3, Math.min(6, heading[1].length + 1));
      html += `<h${level} class="info-header">${renderInlines(heading[2])}</h${level}>`;
    } else if (LIST_ITEM.test(line)) {
      flushParagraph();
      items.push(line.replace(LIST_ITEM, ""));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph(); flushList();
  return html;
};
```
  Keep the existing pre-processing that splits a heading glued to a word (`/([a-z0-9])(###|##|#)/g`). `renderMarkdown` returns `<div>` plus the joined blocks.
- [ ] **Step 3: adjust `MoreInfo.vue` CSS** for `h3`/`h4` `.info-header` sizes only if the existing `.info-header` rule keyed on `h1`/`h2`; no markup changes elsewhere.
- [ ] **Step 4: gates and commit** `fix(guide): keep the text under headings and group list items`.

### Task 8: A fourth watering tone for never-watered plants (finding 5)

**Files:** `utils/wateringStats.ts`, `utils/waterRound.ts` (`TONE_BONUS`), `components/overview/ItemsOverview.vue` (`statusTone` union and chip), `views/plants/PlantOverview.vue`, `components/water/RoundList.vue`, `components/water/SnapMatchSheet.vue` (chip label), `theme/custom.css` (`.tone-new`), locales (`plantlist.new` de "Noch nie gegossen", en "Never watered"); tests `wateringRank.test.ts` (rewrite :9-11), `waterRound.test.ts` (the `Never` row is now `checked`), `roundList.test.ts`.

- [ ] **Step 1: update tests (RED)**: `wateringStatus([])` returns `{ daysSince: null, tone: "new", rank: NEW_PLANT_RANK }` with `NEW_PLANT_RANK === -(DEFAULT_WATERING_INTERVAL_DAYS + 1.5)`; sorting puts an overdue plant (default interval, 20 days) before a new plant, and a new plant before a plant 3 days late; `buildRoundRows` pre-ticks the new plant.
- [ ] **Step 2: implement**: `export type WateringTone = "due" | "overdue" | "ok" | "new"`; `if (latest === null) return { daysSince: null, intervalDays, tone: "new", rank: NEW_PLANT_RANK }`; `TONE_BONUS` gets `new: 0.03`; `ItemsOverview.vue` `statusTone?: WateringTone` (import the type) and `.tone-new`: `background: var(--water-wash); color: var(--ion-color-tertiary-shade)` (chip uses the water icon); `PlantOverview.overviewItems` already forwards `status.tone` and `statusLabel` (now `this.t("plantlist.new")` for the new tone through the existing `plantlist.${tone}` lookup); `RoundList` and `SnapMatchSheet` chips keep the `plantlist.${tone}` lookup.
- [ ] **Step 3: check-keys, gates, commit** `fix(watering): never-watered plants are flagged and pre-ticked`.

### Task 9: Non-owners never see owner-only watering UI (finding 6)

**Files:** `views/plants/PlantDetails.vue`, `components/plants/watering/WateringStatus.vue` (no change expected), locales (`plantdetail.history_private`); tests: new `plantDetailsVisibility.test.ts`.

- [ ] **Step 1: write the test (RED)** mounting `PlantDetails` with a non-owned plant (`userId` differs) and with a guest: no `watering-status` and no `watering-records` are rendered, a note with `plantdetail.history_private` is; for the owner both render. (Use `shallowMount`, stubs, `createTestingPinia` like `viewReactivity.test.ts`; the backend returns an empty list for non-owners, so the decision uses `isPublic`, not the data.)
- [ ] **Step 2: implement**: wrap `.area-status` and `.area-calendar` in `v-if="!isPublic"`; add `<p v-else class="area-status history-private">` with the localized note (de "Gießverlauf ist privat.", en "Watering history is private.") styled like `.hint`.
- [ ] **Step 3: gates and commit** `fix(plants): hide owner-only watering history from non-owners`.

### Task 10: Snap confidence follows the raw winner (finding 4)

**Files:** `views/water/WaterRound.vue` (`onPhoto`, `confident`), `utils/waterRound.ts` (no change), tests `waterSnapFlow.test.ts` (:102, :334, :349), `snapMatchSheet.test.ts` (unchanged).

- [ ] **Step 1: write/adjust tests (RED)**: a scenario where the due bonus puts plant 1 (raw 0.80) above plant 2 (raw 0.83): the sheet lists 1 first but `confident` is false; a scenario where the raw winner is also first and clears the threshold is confident; the existing :334 and :349 cases keep their expectation; check that :102's data still yields `confident: true` (adjust its fixture so the raw winner is first, noting that rerank is only an ordering aid).
- [ ] **Step 2: implement**: in `onPhoto` keep `this.rawTopId = match.candidates[0]?.plantId ?? null` (server returns best first) before reranking; `confident` becomes `first?.plantId === this.rawTopId && raw.score >= this.threshold` (using the raw candidate for `first`).
- [ ] **Step 3: gates and commit** `fix(snap): only highlight the raw best match when it clears the threshold`.

### Task 11: Water screen structure and states (finding 18)

**Files:** `views/water/WaterRound.vue`, `components/water/RoundList.vue`, `components/water/SnapButton.vue`, `components/ui/StateBlock.vue` (reuse), `components/ui/PlantPlaceholder.vue` (reuse), locales (`water.empty_cta`, `water.guest_hint`, `water.load_error`, `water.override_edit`), tests `waterRoundView.test.ts` (rewrite :201), `roundList.test.ts`, `waterSnapFlow.test.ts` (selectors that find the snap button).

- [ ] **Step 1: update tests (RED)**: the snap button is no longer above the search; it is in the footer row (left of Log, outline fill) and is absent when `rows.length === 0`, for guests and when recognition is unavailable; while `loading` a `StateBlock kind="loading"` renders; a load error renders `StateBlock kind="error"` with retry that calls the loader again; an empty plant list renders `StateBlock kind="empty"` with an action routing to Plants; a guest sees a `StateBlock` with the guest hint and a sign-in action instead of the controls; rows with no image render `PlantPlaceholder` with the plant id as seed; the per-row select is replaced by an edit button that opens the select only on demand and shows a small chip with the override when it differs from the round.
- [ ] **Step 2: implement**: restructure the template (header, search and round fertilizer controls, list or `StateBlock`, footer with `SnapButton` outline and Log filled); `SnapButton.vue` gets prop `fill` (default `solid`) and exposes `focusButton()` for task 16; the loader records `loadError` and exposes `retry`; `RoundList.vue` rows use `<plant-placeholder :seed="row.plantId" :kind="'plant'">` when `imageUrl` is empty; per-row override: `ion-button fill="clear" size="small"` with the `tune`/`ellipsisVertical` icon from `icons.ts` (add if missing) toggling `overrideOpen[plantId]`, the select (`interface="popover"`) renders only while open or while an override is set. Rows already re-sort when records refetch after saving, which provides the "done" state; no extra collapse.
- [ ] **Step 3: gates and commit** `feat(water): thumb-friendly footer actions and complete screen states`.

### Task 12: Tab bar fits German at 360 px (finding 2)

**Files:** `views/TabsPage.vue`, `theme/custom.css` (`ion-tab-button` rules), locales (`tabs.components` de "Zutaten", en "Components" unchanged); tests: new `tabBarCss.test.ts`.

- [ ] **Step 1: write the test (RED)**: raw `TabsPage.vue` or `custom.css` contains `min-width: 0` and `flex: 1 1 0` for `ion-tab-button`, a `font-size: var(--text-xs)` label rule, `overflow-wrap: anywhere` and `hyphens: auto`; `de.ts` `tabs.components` is shorter than 9 characters.
- [ ] **Step 2: implement**:

```css
ion-tab-button { min-width: 0; flex: 1 1 0; --padding-start: 2px; --padding-end: 2px; }
ion-tab-button ion-label { max-width: 100%; font-size: var(--text-xs); overflow-wrap: anywhere; hyphens: auto; }
```
  `tabs.components` de becomes "Zutaten" (the page titles and other uses keep "Komponenten"). Verification of the real fit happens in task 27 (every tab rect inside `[0, innerWidth]` at 320, 360, 390).
- [ ] **Step 3: gates and commit** `fix(nav): tab bar fits German labels on phones`.

### Task 13: Offline banner is visible (finding 3)

**Files:** `components/ui/OfflineBanner.vue`, `App.vue`, `theme/custom.css` (split-pane offset), `icons.ts` (cloud offline icon), tests `offline.test.ts`.

- [ ] **Step 1: tests (RED)**: the offline banner root has class `offline-region` with `position: fixed` in the component CSS (raw), the offline state renders an icon element, the component writes `--offline-h` on `document.documentElement` equal to its measured height while visible (stub `offsetHeight` through a ref) and removes it when hidden or on unmount; `custom.css` contains `ion-split-pane { top: var(--offline-h, 0px) }` and uses `var(--z-banner)`.
- [ ] **Step 2: implement**: `.offline-region { position: fixed; top: env(safe-area-inset-top); inset-inline: 0; z-index: var(--z-banner); }`, banner background `--offline-bg`, ink text, cloud-offline icon; after render (`$nextTick`) set `--offline-h` to the banner height so `ion-split-pane` is pushed down (the pane is absolutely positioned, so `top` shifts its content below the banner); clear on hide and `beforeUnmount`. Keep `role="status"` and `aria-live="polite"`.
- [ ] **Step 3: gates and commit** `fix(shell): offline banner sits above the page and pushes content down`.

### Task 14: Document language and page titles (findings 11, 20 headings and title)

**Files:** `services/general/LocalizationService.ts`, `router/index.ts` (route `meta.titleKey`), `App.vue` (title watcher), `components/overview/OverviewHeader.vue` (`h1` inside `ion-title`), `components/admin/AdminHeader.vue`, locales (`page.plant_details`, `page.substrate_details` and similar for routes lacking one), `frontend/index.html` (add `<title>`); tests: new `localizationLang.test.ts`, `routerTitles.test.ts` (keep `routerGuard.test.ts` green).

- [ ] **Step 1: tests (RED)**: `initLocale()` and `setLocale("de")` set `document.documentElement.lang` to `de` (guard for SSR with `typeof document`); every named route except redirects has `meta.titleKey` and that key exists in both locale files; `router.afterEach` sets `document.title` to `"<translated page> · PlantCare"` for a route and re-sets it on locale change (call the exported `updateDocumentTitle(route)`); `OverviewHeader` renders an `h1` inside `ion-title` with the translated title.
- [ ] **Step 2: implement**: write `documentElement.lang = locale` in `setLocale` and once in the constructor path after `initLocale`; add `titleKey` to the routes (reuse existing keys `plants.title`, `water.title`, `substrate.title`, `components.title`, `sales.title`, `profile.title`, `admin.title`, `admin.scrapers.title`; add keys only for plant, substrate, component and sales details and for login); export `updateDocumentTitle(route)` from a small `utils/pageTitle.ts`, call it in `router.afterEach` and from a `watch` on `localizationService.locale` in `App.vue`; wrap the overview title in `<h1 class="toolbar-title">` styled to match `ion-title`.
- [ ] **Step 3: gates and commit** `fix(a11y): document language, page titles and overview headings`.

### Task 15: Optional species and substrate on a new plant (finding 17)

**Files (backend):** `backend/src/modules/plants/application/PlantUseCases.ts`, `domain/Plant.ts`, `infrastructure/SQLitePlantRepository.ts`, `backend/tests/contract/plants.contract.test.ts` (:81-93 and new cases), `backend/docs/api-reference.md`. **Files (frontend):** `components/plants/PlantAddingModal.vue`, `PlantEditingModal.vue`, `views/plants/PlantOverview.vue` (`addPlant`), `stores/plants.ts` (`addPlant`), `types/plantTypes.d.ts`, `mapping/PlantMapping.ts`, species display sites, locales; tests `plantsStore.test.ts`, `viewReactivity.test.ts:183`, new `plantAdding.test.ts`.

- [ ] **Step 1: backend tests (RED)** in `plants.contract.test.ts`: `POST /plants` with only a name creates a plant (201) whose `substrate` is `null` and whose species is `null` (see decision below); a species of 101 characters still gives a field error; `substrateId: 0` still gives a field error; `PATCH` with `substrateId: null` clears the substrate and `species: ""` clears the species; an unknown substrate id still answers 400. Update the field-error test at `:81-93` to keep the `name`, `species` (length) and `substrateId` (0) errors.
- [ ] **Step 2: backend implement**: create schema `species: z.string().max(100).optional()` and `substrateId: z.number().int().positive().nullable().optional()`; update schema accepts `species?: string | null` and `substrateId?: number | null` (keep the at-least-one-field refine); DTOs `species?: string | null`, `substrateId?: number | null`; repository update accepts `substrate_id?: number | null` and clears species when an empty string or null is sent (the resolver already returns null for empty names); on read return `plant_species: data.plant_species_name ?? null` (type `string | null`) instead of the English literal `'Unknown'`. Grep backend and frontend for `plant_species` and `'Unknown'` and adjust every consumer.
- [ ] **Step 3: frontend tests (RED)**: `AddPlant` allows `species` undefined and `substrateId: null`; `plantsStore.addPlant` posts without `substrateId` when null and builds an optimistic plant with `substrate: null` (`substrateName` is not called); `PlantOverview.addPlant` only requires a name; `PlantAddingModal` fields for species and substrate are not required and the substrate select offers an empty choice "Nicht festgelegt"; a plant with `species` null renders the localized "Unbekannte Art" (`plant.species_unknown`) in the tag and the overview.
- [ ] **Step 4: frontend implement**: `blankPlant()` uses `substrateId: null`; select options gain a first empty option (`plant.field.substrate_none`); remove the species and `substrateId === 0` checks (`PlantOverview.vue:226-232`) keeping the name check; modal gets a text button "Neues Substrat anlegen" (`plant.add.new_substrate`) that closes the modal and routes to `/tabs/substrates` (record in the report that the add dialog is opened manually there); `PlantEditingModal` allows clearing both fields; `PlantMapping` maps null species to the localized label at the presentation edge (computed in the components that print species, not in the mapper, so the store keeps `null`).
- [ ] **Step 5: gates (backend then frontend) and commit** `feat(plants): species and substrate are optional when adding a plant`.

---

## Phase 4: Accessibility

### Task 16: Snap sheet focus, announcements and logged state (findings 12, 34 snap logged, 33 chip group)

**Files:** `components/water/SnapMatchSheet.vue`, `views/water/WaterRound.vue`, `components/water/SnapButton.vue`, locales (`water.fertilizer_prompt`), tests `snapMatchSheet.test.ts`, `waterSnapFlow.test.ts`.

- [ ] **Step 1: tests (RED)**: when `state` changes the active heading receives focus (`document.activeElement` after `$nextTick`, using `attachTo: document.body`); the state area is a `role="status"` `aria-live="polite"` container; after dismiss (Undo or Done) `WaterRound` calls `focusButton()` on the snap button (spy via ref); the chips sit in `role="group"` with `aria-labelledby` pointing at a visible label `water.fertilizer_prompt` ("Mit Dünger?"); the logged state shows the matched plant's thumbnail (prop `loggedImageUrl`), Done is the solid action and Undo is text-only (`fill="clear"`).
- [ ] **Step 2: implement** with `ref="title"` on each state heading (`tabindex="-1"`), `watch: { state() { this.$nextTick(() => this.$refs.title?.focus?.()) } }` (the ref is on a plain `h2`; ensure it is the single rendered one); `WaterRound` passes `loggedImageUrl` from the plant store and calls `this.$refs.snapButton?.focusButton?.()` in `closeSheet`/`onDismiss` and after undo; initial breakpoint for the logged state 0.45 (use a computed breakpoints array while state is logged only if Ionic permits changing it; otherwise keep 0.65 and shrink the empty space with `max-height` content, note in the report).
- [ ] **Step 3: gates and commit** `fix(snap): manage focus and announce the logged state`.

### Task 17: Named dialogs and localized sheet handle (finding 20)

**Files:** `components/modal/ModalHeader.vue`, `components/modal/BaseFormModal.vue`, `components/modal/useModalTitleId.ts` (new), the dialogs from the review table (`WateringRecordModal.vue`, `SnapMatchSheet.vue`, `ImageModal.vue`, `PlantPickerModal.vue`, `SalesFilterModal.vue`, `CalendarSettingsModal.vue`, `SubstrateFormModal.vue`), tests: new `modalNaming.test.ts`.

- [ ] **Step 1: tests (RED)**: `ModalHeader` accepts prop `headingId` and renders it on the `h1`; `useModalTitleId()` returns a stable id from `nextFieldId("modal-title")`; each listed dialog passes `:aria-labelledby` equal to its heading id (assert the attribute on the stubbed `IonModal`); `SnapMatchSheet` sets `:handle="false"` and renders a decorative `aria-hidden` bar.
- [ ] **Step 2: implement**: `useModalTitleId.ts` exports `{ titleId }` for `setup()` (combine with `useMountWhileOpen` by returning both from `setup`); `BaseFormModal` wires `titleId` into `ModalHeader` and `aria-labelledby`; `SnapMatchSheet` headings in the candidates and logged states get `:id="titleId"`; `ImageModal` passes the id through `EditingHeader` to `ModalHeader`. `ConfirmDialog` already names its alertdialog and stays unchanged.
- [ ] **Step 3: gates and commit** `fix(a11y): name every dialog and localize the sheet handle`.

### Task 18: Reduced motion without a blanket kill (finding 21, 33 accordion)

**Files:** `frontend/src/main.ts`, `utils/motion.ts` (new), `theme/custom.css:194-203`, `components/ui/StateBlock.vue` (shimmer), `components/accordion/Accordion.vue`, `components/ui/OfflineBanner.vue`; tests: new `motion.test.ts`, `accordionCss.test.ts`.

- [ ] **Step 1: tests (RED)**: `prefersReducedMotion()` returns false when `matchMedia` is missing (jsdom) and true when it reports `matches`; `ionicConfig()` returns `{ animated: false }` under reduced motion and `{}` otherwise; `custom.css` no longer contains `animation-duration: 0.01ms`; `Accordion.vue` CSS uses `grid-template-rows` (0fr to 1fr) and no `max-height: 1000px`.
- [ ] **Step 2: implement**: `main.ts` `.use(IonicVue, ionicConfig())`; replace the global rule with targeted ones: under `@media (prefers-reduced-motion: reduce)` the skeleton shimmer becomes a static tone (`animation: none; background: var(--surface-sunken)`), the offline banner has no entrance animation, accordion transitions use only a 120 ms opacity change, `scroll-behavior: auto` stays; the accordion panel switches to a grid-row transition (`display: grid; grid-template-rows: 0fr; transition: grid-template-rows 280ms; .open { grid-template-rows: 1fr }` with an `overflow: hidden` inner element).
- [ ] **Step 3: gates and commit** `fix(a11y): honour reduced motion for Ionic and keep state cues`.

### Task 19: Form errors reach the native input; named segment (findings 24, 22, 33 Login main)

**Files:** `components/formcomponent/fieldShared.ts`, the field components using `IonInput`, `IonTextarea` and `IonSelect` (`InputField`, `PasswordField`, `TextareaField`, `SelectField`, `DateField`), `views/Login.vue`, `views/water/WaterRound.vue` (segment label), tests `formComponents.test.ts` (add), new `fieldAria.test.ts`.

- [ ] **Step 1: tests (RED)**: `syncNativeAria(host, { invalid, describedBy })` sets `aria-invalid` and `aria-describedby` on the element returned by `host.getInputElement()` (stub returns a plain input) and removes them when cleared; `InputField` calls it after `error` changes; the Login submit with empty fields moves focus to the first invalid field (use the real `focusFieldHost`); the round segment has `aria-labelledby` pointing at the label span id; `Login.vue` no longer renders a `<main>` (`div.login-shell`).
- [ ] **Step 2: implement**: add to `fieldShared.ts`

```ts
export const syncNativeAria = async (
  host: { getInputElement?: () => Promise<HTMLElement> } | null | undefined,
  state: { invalid: boolean; describedBy?: string },
): Promise<void> => {
  const native = await host?.getInputElement?.();
  if (!native) return;
  if (state.invalid) native.setAttribute("aria-invalid", "true");
  else native.removeAttribute("aria-invalid");
  if (state.describedBy) native.setAttribute("aria-describedby", state.describedBy);
  else native.removeAttribute("aria-describedby");
};
```
  each text-like field gets `watch: { error() { void syncNativeAria(this.$refs.input, { invalid: !!this.error, describedBy: this.describedBy }) } }` (and in `mounted`); `Login.submit` focuses the first invalid input through `focusFieldHost` after `$nextTick`; the segment gets `id` on its label span and `aria-labelledby`.
- [ ] **Step 3: gates and commit** `fix(a11y): form errors reach the native input and focus moves to the first error`.

### Task 20: Care guide stop, completion and render cost (finding 26, 33 DOMParser, 34 disclaimers)

**Files:** `stores/moreInfo.ts`, `components/plants/MoreInfo.vue`, `utils/markdown.ts` (add `info-strong` and `info-em` classes in `renderInlines`), locales (`moreinfo2.stop`, `moreinfo2.done`, `moreinfo2.stopped`); tests `moreInfoStore.test.ts`, `markdown.test.ts`, new `moreInfoComponent.test.ts`.

- [ ] **Step 1: store tests (RED)**: `stopInfo(plantName)` closes the stream (the mocked `ApiUtils.stream` returns a cleanup spy that must be called), settles the pending `ensureInfo` promise for every coalesced caller as stopped (resolves with the partial draft, status not cached), clears `streaming[key]`, and keeps the draft; a later `ensureInfo(..., { force: true })` restarts cleanly.
- [ ] **Step 2: store implement**: keep a non-reactive `Map<key, () => void>` of cleanups and a `stopped` resolver; expose action `stopInfo(plantName)`; the runStream completion path ignores events after stop.
- [ ] **Step 3: component tests (RED)**: while loading a Stop button is visible and calls `stopInfo`; the `aria-busy` attribute is on `.guide-text` only; when status becomes `ready` the status line reads `moreinfo2.done` once (role="status") and clears after a few seconds; `formatStreamingHtml` is gone and the rendered HTML includes `info-strong` for `**bold**`; the two disclaimers render as one note with both sentences.
- [ ] **Step 4: implement** the component changes (no `DOMParser`: bind `renderMarkdown` output; add the strong and em classes in `renderInlines`; one merged `p.note`).
- [ ] **Step 5: gates and commit** `feat(guide): stop a running stream, announce completion, drop the per-chunk reparse`.

### Task 21: Undo that does not vanish (finding 19)

**Files:** `services/general/ToastService.ts`, `views/water/WaterRound.vue`, `components/plants/watering/WateringStatus.vue`, `WateringRecords.vue`, `components/calendar/MenuCalendar.vue`, locales (`water.last_round`, `water.last_round_undo`), tests `toastService.test.ts`, `waterRoundView.test.ts` (positional args), `waterSnapFlow.test.ts`.

- [ ] **Step 1: tests (RED)**: `showToastWithAction` accepts `duration: 0` and then adds a close button (toast stays until dismissed); undo toasts for the round, snap and single records use a named constant `UNDO_TOAST_MS = 10000` (10 s) instead of 6000 and 4000, and the round undo is persistent (duration 0); after saving a round the Water screen shows a row "Letzte Runde: 4 Pflanzen" with a Rückgängig button that calls `removeBatch` with the same ids, hides after use and after five minutes (fake timers).
- [ ] **Step 2: implement**: extend `ToastService` so `duration: 0` also sets `showCloseButton`; export `UNDO_TOAST_MS` from `utils/constants` (or the service); `WaterRound` keeps `lastRound: { ids, plantIds, count, at }`; the in-page row is a small `StateBlock`-style card above the list. Update the positional-argument assertions at `waterRoundView.test.ts:122-123, 236`.
- [ ] **Step 3: gates and commit** `fix(undo): round undo persists and is reachable in the page`.

### Task 22: Image viewer zoom and alt text (finding 25, 33 gallery alt)

**Files:** `components/images/ImageModal.vue`, `utils/zoom.ts` (new pure helpers), `components/details/HorizontalGallery.vue`, `components/overview/ItemsOverview.vue` (`alt=""` inside named buttons), locales (`image.zoom_in`, `image.zoom_out`, `image.zoom_reset`); tests: new `zoom.test.ts`, `imageModal.test.ts`.

- [ ] **Step 1: tests (RED)**: `zoom.ts` exports `clampZoom(value)` (1 to 3), `stepZoom(current, direction)` (steps of 0.5) and `shouldReset(zoom)`; the modal renders three labeled `IconButton`s (in, out, reset) that change `zoomScale`; keys `+`, `-` and `0` on the wrapper do the same; `touchend` and `touchcancel` stop dragging and the pinch state; the enlarged image alt equals the full gallery alt (plant name plus date) rather than the date; gallery date caption is `aria-hidden="true"`; plant cards render the image with `alt=""` inside the named button.
- [ ] **Step 2: implement** (wrapper `tabindex="0"` with `@keydown`; no change to `touch-action: none` but zoom no longer depends on gestures).
- [ ] **Step 3: gates and commit** `feat(a11y): button and keyboard zoom for photos and cleaner image names`.

---

## Phase 5: Flow polish

### Task 23: Overview chrome (findings 27, 29)

**Files:** `components/overview/OverviewHeader.vue`, `components/SideMenu.vue` (reminders moved into a modal), `components/calendar/MenuCalendar.vue` (unchanged logic), locales (`menu.reminders`), tests: new `overviewHeader.test.ts`, `sideMenuReminders.test.ts`.

- [ ] **Step 1: tests (RED)**: `OverviewHeader` no longer renders the logout `icon-button` (the side menu footer remains the only logout, test that `SideMenu` still has it); the segment control has `max-width` 360 px on viewports of 992 px and above (raw CSS) and is left-aligned; the side menu no longer embeds `menu-calendar` in the rail; it renders a "Erinnerungen" item that opens an `ion-modal` containing `menu-calendar` (`aria-labelledby` per task 17); the footer button width on the Water page matches `--content-max` (already done in the earlier fix; assert the class exists).
- [ ] **Step 2: implement** the three changes (the desktop rail keeps the "Menü einklappen" footer; the reminders modal works for rail and phone menus).
- [ ] **Step 3: gates and commit** `refactor(chrome): logout only in the menu, capped segments, reminders in a dialog`.

### Task 24: Past-day logging in one tap (finding 28)

**Files:** `components/plants/watering/WateringRecords.vue`, locales (remove `plantdetail.double_tap_hint` from both files), tests `viewReactivity.test.ts` (WateringRecords suite).

- [ ] **Step 1: tests (RED)**: a single `onDateChange(day)` for an empty day with `canAdd` opens the add modal with `modalDay === day`; selecting a day that has a record still opens the popover (no add); `canAdd` false does nothing; the hint paragraph is gone.
- [ ] **Step 2: implement**: in `onDateChange` call `openAdd(day)` immediately when no record exists on that day; delete the hint and both locale keys (`check-keys` must stay clean).
- [ ] **Step 3: gates and commit** `feat(calendar): one tap on an empty day logs a past watering`.

### Task 25: Polish batch (findings 30 rest, 31, 32 hygiene, 33, 34)

**Files:** `views/Login.vue` (done in 19), `views/plants/PlantDetails.vue` (hero vs gallery), `components/overview/ItemsOverview.vue` (Sales count line), `components/plants/MoreInfo.vue` (done in 20), `components/calendar/Calendar.vue` (day width), `components/admin/SourceRow.vue`, `views/admin/*` (re-check visibility), `components/plants/PlantTag.vue`; tests: new `polish.test.ts`.

- [ ] **Step 1: tests (RED)**: `SourceRow` shows the re-check button only when the status is `failing` or `degraded` (and `checkable`); the Sales count line renders the item count once, with the "new" total as a separate chip and no duplicate badge count text; `PlantDetails` on a viewport without the hero grid area does not render the hero image when the gallery has images (the first gallery image is the hero on mobile: render `details-banner` only when the plant has no photos); `Calendar.vue` day cells use `min-width: var(--tap-min)` where the container allows (raw CSS); nothing else changes visually in other files.
- [ ] **Step 2: implement** the five small changes. Leave the 300 px pie replacement to task 4.
- [ ] **Step 3: gates and commit** `chore(ui): polish remaining review items`.

---

## Phase 6: Docs and verification

### Task 26: Documentation and review status

- [ ] Update `frontend/docs/design-system.md` and root `DESIGN.md` with the final token set, the role grammar (watering = teal, overdue = clay, fertilizer = feed-organic and feed-mineral, new = sun, error = danger-wash, offline = neutral, ok = leaf wash), the focus ring recipe, contrast rules and the rule that user-picked colors are corrected at render time.
- [ ] Add a status table to the top of `docs/refactor/ux-color-review.md` mapping every finding number to its task and the commit that closed it; mark the items that were deliberately left unchanged and why.
- [ ] Update `backend/docs/api-reference.md` for the plant create and update contract (task 15) and root `CLAUDE.md` seed table only if seed data changes (it should not).
- [ ] Commit `docs: design system and review status`.

### Task 27: Verification, review and PR (controller)

- [ ] Run all frontend gates, then all backend gates, one after the other; record counts against the baseline.
- [ ] Real-browser pass (Edge, new window; isolated stack `node scripts/dev-up.mjs --id uxverify --user grower`, plus `--user newbie` and the guest button) at 360x740, 390x844, 430x932 and 1440x900, light and dark, German and English. A verification subagent checks: every `ion-tab-button` rect inside `[0, innerWidth]` at 320, 360, 390; Tab walk shows a visible ring (non-none outline or shadow) on Water now, Log, Snap, tab buttons, segments, selects; offline emulation shows the banner as the topmost element and pushes the header down; care guide on Sunny Pothos renders paragraphs under headings; Monty snapshot is not highlighted as confident when Sunny Pothos is ahead by bonus only; never-watered plants show the new chip and are pre-ticked; a guest on a public plant sees the private-history note; organic and mineral days are distinguishable in the plant calendar and the legend; a custom category color stays visible in dark mode; headers are raised surfaces in both themes and `meta theme-color` matches; the contrast script from the review re-run on the rendered token pairs shows no failures; `document.documentElement.lang` follows the language switch; screenshots of the key screens.
- [ ] Whole-branch review on the most capable model against `docs/refactor/ux-color-review.md` and this plan; one fix wave; one scoped re-review.
- [ ] Push `feat/ux-color-review` and open the PR with base `feat/quick-watering` (retarget to `main` after #42 merges). Description: what changed by phase, findings closed (all 34, with any deliberate exceptions), tests added, verification summary, and what could not be verified (real screen reader, iOS, on-screen keyboard vs sticky footer). No AI attribution.

## Verification summary

Unit and component tests per task (RED then GREEN, listed in each task); `themeTokens.test.ts` and `contrast.test.ts` make the palette's AA claims executable; `themeCss.test.ts` and `colorRoles.test.ts` stop the old patterns from returning; the browser pass in task 27 covers what jsdom cannot (focus rendering, overlap, layout widths, dark mode, theme-color).
