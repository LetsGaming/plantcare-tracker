# Glossary

Terms specific to this project that are easy to misread or would otherwise need code reading.

- **Round (Gießrunde):** the `/tabs/plants/water` screen. One list of the user's plants, due ones pre-ticked, one save logs them all through `POST /watering/batch`.
- **Snap / snap to log:** photograph a plant on the round screen; the backend matches the photo against the user's own plant photos (`/recognition/match`), the user confirms a candidate and a watering is logged. A "snapshot" is the temporary server-side upload, single use, expires after 10 minutes.
- **Tone:** the watering state of a plant: `ok`, `due`, `overdue`, `new` (never watered). Derived on the client from the plant's watering summary by `wateringStatus(summary, now)`.
- **Rank:** the sort key behind tone (more negative means thirstier). `NEW_PLANT_RANK` is -8.5, between overdue and due for the default 7 day interval.
- **Role tokens:** colors with one job each (see `DESIGN.md`): leaf green is action, water teal is watering and due, clay is overdue only, `--feed-organic` and `--feed-mineral` are fertilizer types, `--new` is new items, `--danger-wash` is errors, `--offline-bg` is offline. `--series-1` to `--series-5` are chart colors that carry no role.
- **Review findings:** the numbered findings of `docs/refactor/ux-color-review.md` (34 of them) and the finding IDs of `docs/performance-audit.md` and `docs/performance-audit-deep.md` (for example `DPLA-2`). Commit messages and plans refer to them by id.
- **SDD ledger:** `.superpowers/sdd/<plan>/progress.md` (gitignored). Records task state, rulings and deferred minors while a plan is executed by subagents. Not part of the shipped product.
- **Keyset cursor:** the opaque `cursor` / `next_cursor` of every paged list. It encodes the sort, the last row's sort value and id, so the next page is a seek (`(col, id) < (?, ?)`) instead of an offset. It is bound to the sort that issued it and stays valid when rows are inserted or deleted between pages.
- **Scope (`mine` / `public`):** which rows a plant or substrate list covers: the caller's own, or every public row of every owner (including the caller's own public ones). Guests only have `public`.
- **Summary (watering):** `{ last_watered_at, last_fertilized_at, avg_interval_days }` computed by the server per plant. It rides on plant list items (owner only) and on every watering write response, so no history has to be fetched to show a plant's status. `null` on a foreign plant means unknown, not never watered.
- **Window (list window):** the part of a list that is mounted or loaded. `ItemsOverview` mounts 40 cards and grows by 40; the watering store keeps the newest 50 records per plant and loads older ones on request, for at most 20 plants.
- **`pageActive`:** a mixin flag, true while an Ionic page is the visible one. Tab pages stay mounted when hidden, so lists bind it to `:active` and skip recomputation while it is false.
- **`listKey`:** a string on `ItemsOverview` that identifies which list is shown (segment, sort, filters). A change resets the window to its first 40 cards.
- **Epoch (logout epoch):** a counter in `stores/resource.ts` bumped when an account ends. Work started in an older epoch must not commit state or storage, and every in-flight request and stream is aborted.
- **Action-boundary persistence:** the persistence plugin writes an entry after a store action named in its `dirtyOn` finishes, and only when its `version` token changed. State is never watched.
- **Replay (sales):** `GET /sales` is a server-sent-event stream that replays the sales stored in the database (newest first, then `done`). Nothing is scraped for the request; a background refresher does that.
- **NEW watermark:** a sale is NEW when the server first saw it after the client's `seen.watermark` and the user has not opened it since. A fresh install starts the watermark 7 days back.
- **Variant (image):** one of the three webp files of an upload: `-160`, `-480` and the 1024 px original. The `srcset` of an image lists them; `images.variants` is 1 once they exist, 0 while pending and -1 when the file is missing or not a webp.
- **Isolated dev stack:** `node scripts/dev-up.mjs --id <name>` and `dev-down.mjs`; never `pnpm dev`.
- **`--offline-h`:** CSS variable the offline banner sets to its own height so the `ion-split-pane` starts below it.
- **Chrome:** headers, tab bar and footers. `--chrome-bg` is their surface.
- **Scoped list:** a store list split into `mine` (the signed-in user's items, loaded completely and searched on the client) and `public` (everyone's public items, paged and searched on the server). `stores/scopedLists.ts` holds the shared fetch, ensure and public-total logic.
