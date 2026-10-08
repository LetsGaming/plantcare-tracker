---
name: PlantCare Tracker
description: A potting bench logbook where watering is the hero and every plant wears a painted tag.
colors:
  leaf-green: "#1f6b3b"
  leaf-green-dark-mode: "#74cf93"
  fired-clay: "#a34a28"
  fired-clay-dark-mode: "#e8a07c"
  watering-can-teal: "#0e6b75"
  watering-can-teal-dark-mode: "#63c6d1"
  new-growth: "#2c7a4b"
  new-growth-dark-mode: "#7fd69a"
  sun-on-a-sill: "#f0b429"
  sun-on-a-sill-dark-mode: "#f5c451"
  brick: "#b3261e"
  brick-dark-mode: "#ff948b"
  moss-ink: "#1d2b22"
  moss-ink-dark-mode: "#e3eee5"
  sage-ink-soft: "#4d5d52"
  sage-ink-soft-dark-mode: "#a5b9aa"
  sage-white: "#f3f6f0"
  moss-black: "#0f1a14"
  surface-raised: "#ffffff"
  surface-raised-dark-mode: "#17261d"
  surface-sunken: "#e6ede2"
  surface-sunken-dark-mode: "#0b130f"
  line: "#d5dfd2"
  line-dark-mode: "#2b3d31"
  leaf-wash: "#dcebdf"
  leaf-wash-dark-mode: "#163423"
  water-wash: "#dcf0f2"
  water-wash-dark-mode: "#12353a"
  clay-wash: "#f6e4da"
  clay-wash-dark-mode: "#3a2418"
typography:
  display:
    fontFamily: "Bricolage Grotesque Variable, Figtree Variable, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Bricolage Grotesque Variable, Figtree Variable, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Bricolage Grotesque Variable, Figtree Variable, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Figtree Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Figtree Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 650
    lineHeight: 1.5
rounded:
  sm: "8px"
  md: "14px"
  lg: "22px"
  pill: "999px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "24px"
  space-6: "32px"
  space-7: "48px"
components:
  button-primary:
    backgroundColor: "{colors.leaf-green}"
    textColor: "{colors.surface-raised}"
    rounded: "{rounded.md}"
    height: "44px"
  button-water-now:
    backgroundColor: "{colors.watering-can-teal}"
    textColor: "{colors.surface-raised}"
    rounded: "{rounded.md}"
    height: "52px"
  icon-button:
    textColor: "{colors.leaf-green}"
    rounded: "{rounded.md}"
    size: "44px"
  plant-tag-card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.moss-ink}"
    rounded: "{rounded.md}"
  plant-tag-header:
    backgroundColor: "{colors.leaf-wash}"
    textColor: "{colors.moss-ink}"
    rounded: "{rounded.lg}"
    padding: "16px 16px 16px 48px"
  watering-status-band:
    backgroundColor: "{colors.water-wash}"
    textColor: "{colors.moss-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  status-chip-due:
    backgroundColor: "{colors.watering-can-teal}"
    textColor: "{colors.surface-raised}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  status-chip-overdue:
    backgroundColor: "{colors.fired-clay}"
    textColor: "{colors.surface-raised}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  chip-public:
    backgroundColor: "{colors.water-wash}"
    textColor: "{colors.moss-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  field-input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.moss-ink}"
    rounded: "{rounded.md}"
    height: "44px"
---

# Design System: PlantCare Tracker

## Overview

**Creative North Star: "The Potting Bench Logbook"**

An Ionic Vue app restyled so that watering is the hero and every plant wears a painted tag. Leaf green carries brand and primary actions on a sage-white ground (not cream); fired clay marks fertilizer, "new" and overdue; water teal marks watering. Dark mode is a moss-black counterpart, not an inversion. Headings are set in Bricolage Grotesque, body in Figtree. The look is warm and botanical, calm and legible one-handed next to a plant.

Density is moderate: tag cards two per row on a phone, generous 44px touch targets, a single content column capped at 960px on detail screens. Depth is soft and low, as if tags and cards rest on a bench. Ionic components are kept; they are remapped through tokens, never restyled screen by screen.

The build confirms the direction contract with one divergence: the contract names a "punched hole" tag as the motif, and it lands in two forms, a side hole on the detail header tag and a top-center hole with a dashed perforation on list cards.

**Key Characteristics:**
- Role colors are semantic: green acts, teal waters, clay flags fertilizer, new and overdue.
- Every plant has an identity: a tag, and when no photo exists an authored leaf silhouette on a tint keyed to the plant.
- One primary action per screen region, 44px minimum targets, 52px for Water now.
- Light and dark both first-class, switched only by the `ion-palette-dark` class.

## Colors

A leaf-and-clay palette on a sage-white ground, with water teal as the one cool voice. Values below are light mode; each color token also has a dark-mode counterpart in the frontmatter (suffix `-dark-mode`).

### Primary
- **Leaf Green** (frontmatter `leaf-green`): brand, primary buttons, selected tab and nav item, caret, text selection tint, focus of the primary path, the browser theme-color in light mode. Dark mode lifts it to a light mint for contrast on moss black.

### Secondary
- **Fired Clay** (`fired-clay`): fertilizer, the "new" pill on cards, the overdue status chip, placeholder accent stroke. Clay wash (`clay-wash`) is its tint surface.

### Tertiary
- **Watering Can Teal** (`watering-can-teal`): everything about water: the Water now button, due chip, the watering status band wash (`water-wash`), the public chip, and the keyboard focus ring (`--focus-ring`).

### Neutral
- **Sage White** (`sage-white`): app background. Dark counterpart is **Moss Black** (`moss-black`).
- **Surface Raised** (`surface-raised`): cards, toolbars, tab bar, list items, inputs. **Surface Sunken** (`surface-sunken`): segment track, image wells, tag holes, skeleton base, scrollbar track.
- **Moss Ink** (`moss-ink`): body text. **Sage Ink Soft** (`sage-ink-soft`): secondary text, species lines, helper copy.
- **Line** (`line`): 1px to 1.5px borders, dashed tag perforation, dividers.
- **Leaf Wash** (`leaf-wash`): plant tag header surface and active side-menu item.
- Status colors **New Growth** (success), **Sun on a Sill** (warning, with dark ink text) and **Brick** (danger, invalid field border) complete the Ionic roles.
- Placeholder tints `--tint-1` to `--tint-5` (mint, peach, aqua, lime, lilac, each with a dark variant) and chart colors `--chart-1` to `--chart-6` are defined in `variables.css`; they are reached only through those variables.

### Named Rules
**The Role Color Rule.** Green means act, teal means water, clay means fertilizer, new or overdue. Never swap them to decorate.

**The Never-Only-Color Rule.** Status is always color plus text or icon (chip label, status line); chart series differ in lightness and hue and are never the only code.

**The Tokens-Only Rule.** Components read variables; no hex colors or inline style attributes in components (the placeholder tint binds through `var(--tint-n)`).

## Typography

**Display Font:** Bricolage Grotesque Variable (with Figtree Variable, system-ui, sans-serif)
**Body Font:** Figtree Variable (with system-ui, -apple-system, Segoe UI, sans-serif)

**Character:** A characterful, slightly quirky display face for plant names and headings over a friendly humanist body face. Both are self-hosted variable fonts (`@fontsource-variable`, loaded in `theme/fonts.ts`).

### Hierarchy
- **Display** (650, 2.125rem, 1.15): h1 at wide viewports; plant name on tag headers from 900px.
- **Headline** (650, 1.625rem, 1.15): h2, plant name on mobile tag headers, fact values in the watering band.
- **Title** (650, 1.25rem, 1.15): h3, state block titles.
- **Body** (400, 1rem, 1.5): all running text, capped at 68ch. A 0.9375rem step is used for counts and meta lines.
- **Label** (650, 0.8125rem): chips, pills, fact captions (600), card sub lines and status lines.

Headings use `-0.01em` tracking and balanced wrapping; plant names wrap with `overflow-wrap: anywhere` and `hyphens: manual` so long names never overflow.

### Named Rules
**The Two Voices Rule.** Display face for names and headings only; Figtree for everything else, including buttons (650, no uppercase, no letter-spacing).

## Layout

Mobile first. Spacing uses a 4/8/12/16/24/32/48 scale (`space-1` to `space-7`); 16px is the page gutter. Detail and form screens use a centered column capped at 960px (`--content-max`); the plants overview caps at 1200px with its grid at 1100px.

- Plants list: two tag cards per row below 640px (12px gap); from 640px an auto-fill grid with 240px minimum columns and 16px gap.
- Detail screens (plant): tag header, then the watering status band with Water now above the fold, then the photo. Other details use the hero (photo capped at `min(40vh, 360px)` with the tag overlapping its bottom edge by 24px).
- Tab bar: bottom tabs (Plants, Substrates, Components, Sales with a count badge, Debug in development only) below 992px; hidden from 992px.
- Side menu: 320px wide overlay (max 88vw) with a leaf-green header toolbar below 992px; from 992px a persistent split pane that also shows the navigation section. Active item sits on leaf wash at weight 600.
- Safe areas: the tab bar pads by `env(safe-area-inset-bottom)`.

## Elevation & Depth

Hybrid: tonal layering first (raised white or dark-green surfaces over a sage ground, sunken wells for images and tracks), with two soft ambient shadows for cards and lift. Shadows are never colored or offset; they are low-opacity moss-ink (pure black at higher opacity in dark mode).

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 2px rgba(29, 43, 34, 0.08), 0 6px 18px rgba(29, 43, 34, 0.08)`): tag cards, tag headers, Ionic cards at rest.
- **Lift** (`box-shadow: 0 2px 4px rgba(29, 43, 34, 0.1), 0 12px 28px rgba(29, 43, 34, 0.14)`): hover on tag cards (with a 3px rise, pointer devices only) and floating action buttons.

### Named Rules
**The Rests-On-The-Bench Rule.** Surfaces carry the card shadow at rest; only hover (pointer devices) and floating buttons step up to lift. Dark mode keeps the same two steps with black shadows (0.4/0.35 and 0.5/0.45).

## Shapes

Soft and label-like. Radii: 8px (`sm`: image corners, focus ring, skeleton lines), 14px (`md`: buttons, inputs, cards, segments, status band, toasts), 22px (`lg`: tag headers, hero photo, state-block art), 999px for chips and pills.

The plant tag silhouette is asymmetric: 14px on the top-left and bottom-right corners, 22px on the other two. A circular hole (18px on header tags, 12px on list cards) is cut into the tag, drawn as a sunken-surface dot with a 1.5px line inset ring. List cards separate photo from label with a 2px dashed line, like a perforation.

## Components

### Buttons
- **Shape:** 14px radius, 44px minimum height, weight 650, no uppercase, no shadow.
- **Primary:** leaf green fill with white text (dark text on mint in dark mode).
- **Water now:** teal fill, 52px minimum height, grows to fill the row (`flex: 1 1 200px`); beside it a clear "add details" text button.
- **Hover / Focus:** Ionic state layers; keyboard focus draws a 3px teal ring, inset on buttons, tabs and segments, offset 2px elsewhere.

### Icon buttons
Always the `IconButton` component: a clear Ionic button with a required accessible label (also its title), 44px square, 24px outline icon. Icons come from one outline family (`theme/icons.ts`); filled glyphs mark only a selected tab.

### Plant tag cards (list)
- **Anatomy:** raised surface, 14px radius, card shadow; 4:3 photo or tinted placeholder; 2px dashed perforation with a centered 12px hole; name in the display face (16px, 650, two lines clamped); species or sub line (13px, soft ink, one line); status row.
- **Status:** a "due" chip (teal fill) or "overdue" chip (clay fill) with matching colored status text; a clay "new" pill sits on the photo top-left.
- **States:** on pointer devices hover lifts 3px with the lift shadow; press scales to 0.985; transitions run 0.25s on the ease-out curve.

### Plant tag header (detail)
Leaf-wash tag, asymmetric 14/22 corners, 48px left padding to clear the 18px hole, name in the display face (26px, 34px from 900px, where the visibility chip moves to the right column), italic soft species line, and a pill chip for public (water wash) or private (raised with a line ring). `DetailHero` repeats the tag over a rounded photo for substrates, components and sales.

### Watering status band
- **Style:** water-wash panel, 14px radius, 16px padding; a visually hidden heading names it for screen readers.
- **Facts:** a definition list in an auto-fit grid (150px minimum): soft 13px caption over a display-face value (26px, 650).
- **Actions:** Water now (teal, 52px) first and widest, details link secondary.
- **Confirmation:** on success a teal wash fills the band bottom-up over 650ms while the values settle in over 550ms (`ease-out`); the Water now button disables while pending.

### State blocks
One `StateBlock` serves loading, empty, error and not-found, centered at 520px. Loading is a skeleton card grid (4 by default, 160px minimum columns, shimmer on a sunken-to-line gradient, 1.4s). Others show a 148px placeholder illustration (desaturated for error), a 20px title, a soft message and, when a next step exists, one button. The block has `role="status"`; loading sets `aria-busy`.

### Inputs / Fields
- **Style:** Ionic outline input, 14px radius, 1.5px line border, white fill, soft-ink placeholder at full opacity, 44px minimum height, leaf-green caret.
- **Focus:** teal highlight and teal ring.
- **Error:** border and highlight switch to brick; the message is a `FieldError` with text, so color is never the only signal. Required fields use a `RequiredMark`.
- **Segments:** sunken track, raised indicator, checked label in leaf green, 44px tall, 14px radius.

### Navigation
See Layout for the tab bar and side menu. Tab bar: raised surface, 1px line top border, selected tab in leaf green with a filled icon, unselected with outline icon, weight 600; Sales badge uses 6px side padding at weight 700. Toolbars: raised surface, centered display-face title, line border. The side menu header is solid leaf green with contrast text.

### Placeholder art
`PlantPlaceholder` draws authored line silhouettes (three plant shapes, plus one each for substrate and component) with 3px round strokes in leaf green with soft green or clay fills, on one of five hue-family tints chosen by a seed from the item name, so the same plant always gets the same tint. Used for missing and failed images; a broken-image glyph never shows.

### Motion
Everything moves on `cubic-bezier(0.22, 1, 0.36, 1)` (`--ease-out`), 0.2s to 0.65s: card hover and press, offline banner entry (0.2s), skeleton shimmer, watering confirmation. No bounce, no looping decoration besides the skeleton. `prefers-reduced-motion: reduce` collapses all animation and transition durations to 0.01ms.

### Dark mode
Moss-black ground (`moss-black`) with raised surfaces one step lighter and sunken wells one step darker. Accents lighten to pastel equivalents (mint, apricot, aqua) with near-black contrast text; washes become deep tints. Switched solely by the `ion-palette-dark` class on `html` (stored choice, else the system setting, applied before mount; `color-scheme` and `theme-color` updated with it). The token block is `:root.ion-palette-dark` and no stylesheet uses a `prefers-color-scheme` rule.

### Accessibility floor
Body text and role colors meet WCAG AA in both themes; 44px minimum touch targets; 3px visible focus ring on every interactive element; icon-only actions require a label; images carry alt text; status never relies on color alone; reduced motion honored; text wraps rather than truncating names (cards clamp to two lines by design).

## Do's and Don'ts

### Do:
- **Do** put Water now above the fold on plant detail, in teal, 52px tall, as the single primary action of the band.
- **Do** build icon-only actions with `IconButton` and an outline icon from `theme/icons.ts`.
- **Do** route every state (loading, empty, error, not found) through `StateBlock` and offer the next step.
- **Do** use `var(--token)` for color, space, radius and shadow, and add dark values in the same change.
- **Do** show an authored placeholder with a per-item tint when an image is missing or fails.

### Don't:
- **Don't** reintroduce the stock Ionic starter look: anonymous white cards, grey headings, broken-image glyphs.
- **Don't** use clay or teal for decoration; they carry meaning.
- **Don't** switch dark mode with a media query; the class is the only source.
- **Don't** use the display face for body copy, buttons or form labels.
- **Don't** use uppercase letter-spaced labels, colored offset shadows, or filled icons for anything other than selected tabs.
