# Quick watering: round mode and snap to log

## Problem

Logging a watering today means opening the app, finding the plant, opening it and tapping "Water now"
(or opening the details modal for fertilizer). The form is cheap (2 taps once the plant is open); the
friction is getting from "can in hand" to "this plant's page". Most waterings therefore never get
logged, which hollows out watering states, stats and reminders.

## Decisions

- **Watering round**: one screen, reachable from a home screen shortcut, listing due plants
  pre-ticked, one fertilizer choice for the whole round, one save.
- **Snap to log**: the real world bridge. Point the phone camera at a plant, the server matches the
  photo against the user's own plant photos and shows the top candidates; one tap logs the watering.
  No tags, no printing, no per-plant setup; works on Android and iPhone.
- Matching runs **on the Pi** with a local image embedding model (DINOv2-small, int8 ONNX via
  `onnxruntime-node`). Private, no per-use cost.
- A confirmed snapshot is **added to the plant's photos** (dated progress history, and it improves
  future matches). A browser-local setting can turn that off.

Out of scope: NFC/QR tags, plant locations, push check-ins, in-browser or OpenAI vision matching.

## User flow

1. Home screen shortcut "Log watering" (manifest `shortcuts`) or a menu entry opens `/tabs/water`.
2. The Water screen has a large **Snap a plant** button on top and the **round list** below.
3. **Snap**: `<input type="file" accept="image/*" capture="environment">` opens the native camera on
   both platforms (no getUserMedia, no Capacitor plugin). The photo is posted to the match endpoint;
   a bottom sheet shows the top 3 candidates (thumbnail, name, due badge) plus "Other plant..."
   (search over the user's plants) for misses and plants without photos.
4. Tapping a candidate logs the watering immediately and stores the snapshot as a plant photo. A toast
   shows "Monty watered" with **Undo** and fertilizer chips (**Organic**, **Synthetic**) that patch the
   record just created.
5. **Round**: due and overdue plants first and pre-ticked (ordering from `sortRank` in
   `frontend/src/utils/wateringStats.ts`), the rest below unticked, a search field, one fertilizer
   segment (none / organic / synthetic) for the round, and a per-row fertilizer override chip.
   **Log N waterings** saves everything in one request, then shows an undo toast.

Guests (read-only) never see the Water screen's write actions. The snap button is hidden when the
server reports recognition as unavailable.

## Backend

### Batch watering (watering module)

- `POST /api/v2/watering/batch` with `{ date?, entries: [{ plantId, usedFertilizer, fertilizerTypeId? }] }`
  (1 to 200 entries). One transaction, all or nothing; any plant not owned by the caller makes the
  whole request 404. Returns the created ids so the client can undo.
- Reuses the Zod schema pieces and `toEpochSeconds` from
  `backend/src/modules/watering/application/WateringUseCases.ts`; routes live in
  `backend/src/modules/watering/presentation/wateringRoutes.ts`.
- `DELETE /api/v2/watering/batch` with `{ ids }` for the round's undo, same ownership rule.

### New module `backend/src/modules/recognition/`

Follows the module convention (domain / application / infrastructure / presentation) and the
deps-factory pattern used by `moreInfoRoutes(deps)`.

- `domain/`: `Embedder` port (`embed(buffer) -> Float32Array`, `modelId`), `EmbeddingRepository` port,
  `SnapshotStore` port.
- `infrastructure/OnnxEmbedder.ts`: sharp resizes to 224x224 RGB, ImageNet normalisation,
  `onnxruntime-node` session created once and reused, returns the L2-normalised CLS vector (384 d).
- `infrastructure/SQLiteEmbeddingRepository.ts`, migration `0005_image_embeddings`:
  `image_embeddings(image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE, model TEXT NOT NULL, vector BLOB NOT NULL)`.
  `model` lets a model change trigger re-embedding. The query loads vectors for one user's plant
  images (join images to plants on `user_id`).
- `infrastructure/TempSnapshotStore.ts`: snapshots are written to `<uploads>/snapshots/` and tracked in
  memory (`id -> { userId, path, vector, expiresAt }`, 10 minute TTL, swept by an interval that is
  cleared in `releaseResources`; the folder is emptied on startup).
- `application/MatchSnapshot.ts`: embed, cosine against the user's vectors, best score per plant,
  return the top 5 `{ plantId, score }` and the `snapshotId`.
- `application/ConfirmSnapshot.ts`: creates the watering record (reusing the watering use case) and,
  when `keepPhoto` is true, moves the file into the images module as a plant image dated now and
  stores its already computed vector. Rejects foreign plants and expired snapshots.
- `application/EmbedImages.ts`: embeds one image (called after every plant photo upload, fire and
  forget, failures only logged) and runs a startup backfill that embeds plant images without a vector
  for the current `model`, one at a time so the Pi stays responsive.
- `presentation/recognitionRoutes.ts`, all behind auth and `guestReadOnly`:
  - `GET  /api/v2/recognition/status` returns `{ available }`
  - `POST /api/v2/recognition/match` (multipart, reuses the `multipartUpload.ts` limits; jpeg and png
    only, which is what the camera input delivers on both platforms)
  - `POST /api/v2/recognition/snapshots/:id/confirm` with `{ plantId, usedFertilizer, fertilizerTypeId?, keepPhoto }`

### Images module hook

`imageRoutes` currently builds its adapters itself. Give it a deps object with an optional
`onPlantImageStored(imageId, absolutePath)` callback, wired in `backend/src/app.ts` to `EmbedImages`.
No other behaviour change.

### Model delivery and availability

- `RECOGNITION_MODEL_PATH` env (added to the self-healing `.env` defaults via `ensure-env.mjs`).
- The Docker build stage downloads the pinned quantized DINOv2-small ONNX file with a checksum check
  into the image. If the file is missing or fails to load, recognition reports `available: false`,
  logs once, and the rest of the app is unaffected.
- `onnxruntime-node` ships linux arm64 and x64 glibc prebuilds, matching `node:22-bookworm-slim`.

### Dev stack and seed

- `backend/src/tools/devMocks.ts`: `createMockEmbedder()` needs no model. Sharp downsamples to 16x16
  and returns the normalised pixel vector. It is deterministic and good enough that a seeded photo
  matches its own plant. `devServer.ts` passes it in.
- Plant photos already go through the API, so the upload hook embeds them. Add a seed step that
  verifies vectors exist and one fixture snapshot image per plant with photos under
  `scripts/dev/seed/`. Update the CLAUDE.md seed table (Monty matches; Unknown Orchid has no photo and
  needs "Other plant...").

## Frontend

- Route `/tabs/water` and view `frontend/src/views/water/WaterRound.vue` (Options API).
- Components: `RoundList.vue`, `SnapButton.vue`, `SnapMatchSheet.vue`, `PlantPickerModal.vue` (search
  fallback; reuse list rendering from `ItemsOverview.vue` where practical).
- `frontend/src/services/RecognitionService.ts`, plus `addBatch` / `removeBatch` in
  `frontend/src/stores/watering.ts` (optimistic, like `addRecord`).
- Client-side re-rank: the five server candidates get a small bonus when `sortRank` says due or
  overdue, then the top 3 are shown. A low best score shows "Not sure, pick one" instead of
  pre-highlighting the first.
- Browser-local setting "Save watering snapshots to the plant's photos" (default on) next to the other
  local settings.
- `frontend/public/favicons/manifest.json`: add a `shortcuts` entry for `/tabs/water`.
- New text in both locale files; icons from `frontend/src/theme/icons.ts`; tokens only.

## Testing and verification

- Backend unit tests with a fake `Embedder`: ranking (best per plant, top 5, user isolation, foreign
  plant rejection), snapshot TTL and expiry, confirm with and without `keepPhoto`, backfill skips
  embedded images and re-embeds on model change, batch atomicity and ownership, guest 403.
- An integration test that loads the real ONNX model when the file is present (skipped otherwise) and
  checks a photo matches itself above a threshold.
- Frontend vitest: re-rank logic, round preselection, batch payload building, sheet states
  (candidates, not sure, unavailable).
- All gates from CLAUDE.md for both packages.
- Manual: `node scripts/dev-up.mjs --id snap`, open `/tabs/water` in Edge (new window), upload a seeded
  Monty snapshot, confirm it is the top candidate, log it, check the record and new photo on Monty,
  log a round with fertilizer, undo it. On the Pi, measure match latency with the real model.

## Open risks

- Recognition quality on near-identical plants (several pothos cuttings) is unknown until tried on
  real photos; the due-plant re-rank and the "Other plant..." escape hatch are the mitigation.
- DINOv2-small int8 latency on the Pi 5 needs measuring; the target is under 2 seconds per match.
- Plants with no photos cannot be matched; the first confirmed snapshot seeds them.
