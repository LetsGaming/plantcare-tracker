---
version: 1
slug: "frontend-src"
primary_target: "frontend/src"
related_targets: []
---

# Surface brief: PlantCare Tracker frontend

Mode: Operate. Scope: all screens of the Ionic Vue app (plants, substrates, components, sales, profile, admin, login).
Audience and job: a plant owner logging water on a phone beside the plant; occasional desktop use.
Constraints: Options API, Ionic components, Pinia stores, German and English, light and dark.
Direction pinned by the owner: warm and botanical, fix everything from the critique in order identity, states, watering-first layout and desktop.

## Direction contract

THESIS: A potting bench logbook where watering is the hero and every plant wears a painted tag. Refuses the stock Ionic starter: anonymous cards, grey headings, broken-image glyphs, a catalogue that outweighs care.
OWN-WORLD: Leaf green carries brand and primary actions on a sage-white ground (not cream); painted-pot clay for fertilizer and warnings, water teal for watering; moss-black dark mode. Bricolage Grotesque headings, Figtree body. Plant tags (rounded label with a punched hole), authored leaf silhouettes as placeholders tinted per plant.
STORY: The owner opens the app and sees which plant is thirstiest, taps water now, and gets a clear confirmation; a newcomer is led to add the first plant.
FIRST VIEWPORT: Mobile plant detail: tag header with the plant name, watering status band (last watered, typical interval) with one primary Water now button above the fold, photo below; plants list: tag cards two per row on mobile, one clear add action.
FORM: Code-led extension of the established Ionic structure, assigned by the owner's pin (warm botanical), no concept roll; seed key none.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
