# API Reference

## Base URL

```
/api/v2
```

## Response Format

Timestamps in response bodies are Unix epoch **milliseconds** (integers): plant, substrate and watering dates and the sales fields. Two exceptions: the `date` of an image object is epoch **seconds**, and the source-health timestamps (`/sales/health`) and the upload response's `date` are strings. Request bodies take dates as documented per endpoint (the watering `date` accepts seconds, milliseconds or an ISO string; the image `date` form field is epoch milliseconds).

All endpoints return a consistent JSON envelope:

```json
// Success (200 / 201)
{ "data": { ... } }

// No Content (successful DELETE, logout)
// → 204, empty body

// Error
{
  "error": {
    "type": "ValidationError",
    "message": "Invalid plant data",
    "statusCode": 400,
    "fields": { "name": "Name is required" }
  }
}
```

The `fields` property is only present on `ValidationError` (400) responses and maps each invalid input field to its specific problem.

Failures that are the client's doing never answer `500`:

| Cause | Status | Type |
|-------|:------:|------|
| Malformed JSON body | `400` | `ValidationError` |
| JSON body over 100 kb | `413` | `PayloadTooLargeError` |
| Unique constraint (duplicate component in a substrate, username taken) | `409` | `ConflictError` |
| Foreign key constraint (unknown `componentId`) | `400` | `ValidationError` |
| Upload that is not a decodable image | `400` | `ValidationError` |

A request from a disallowed `Origin` is answered normally without CORS headers.
Preflights allow `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` and `OPTIONS` with credentials, so a frontend on another origin can edit and delete.

Mutating endpoints (POST / PATCH / PUT) respond with the **full resource** in the same shape a subsequent GET would return, clients never need a follow-up fetch after a write. POST additionally sets a `Location` header pointing at the created resource. Watering writes answer with the changed record or records plus the affected watering summaries (see [Watering](#watering-apiv2watering)).

## Paged lists

`GET /plants`, `/substrates`, `/components` and `/watering/plant/:plantId` are keyset-paged and share one envelope:

```json
{ "data": { "items": [ ... ], "next_cursor": "eyJz...", "total": 137 } }
```

- `next_cursor` is `null` on the last page. Pass it back unchanged as `cursor` (as `before` on the watering history). Cursors are opaque, bound to the `sort` that issued them, and survive inserts and deletes between pages.
- `total` is present on the **first page only** (a request without a cursor) and counts all rows matching the same filter.
- `limit` defaults to **30** and is clamped to **100** (the watering history defaults to 50).

| Query parameter | Applies to | Meaning |
|-----------------|------------|---------|
| `limit` | all lists | Page size, a positive integer, clamped to 100 |
| `cursor` | all lists | The previous page's `next_cursor`; a malformed cursor, one from another `sort`, or one over 512 characters answers `400` |
| `q` | plants, substrates, components | Case-insensitive contains search, at most 100 characters (`400` beyond). Plants match the name (and the species name in the `mine` scope), substrates and components the name |
| `sort` | plants, substrates (`created` \| `name`), components (`name`) | `created` is newest first, `name` is A to Z (case-insensitive); ties break on the id. An unknown value answers `400` |
| `scope` | plants, substrates | `mine` or `public`; see below |
| `tz_offset` | plants | Viewer time zone, see [Plants](#plants-apiv2plants) |

**Scopes.** `scope=mine` lists the caller's own rows, `scope=public` lists every public row of every owner (including the caller's own public rows). The default is `mine` for signed-in users and `public` for guests and anonymous plant readers. A guest asking for `scope=mine` gets an empty page, not an error.

## Caching and compression

- List and detail reads (plants, substrates, components, watering history, sales summary and detail) answer `Cache-Control: private, no-cache` plus a weak `ETag`. Send it back as `If-None-Match` to get `304 Not Modified` with no body when nothing changed.
- `GET /watering/fertilizer-types` and `GET /components/fineness-levels` answer `Cache-Control: private, max-age=3600`.
- Responses of 1 KB or more are compressed with brotli or gzip according to `Accept-Encoding`. The ETag is computed over the uncompressed body. SSE streams are never compressed.
- Uploaded image files under `/uploads` are immutable: `Cache-Control: public, max-age=31536000, immutable` (served by nginx in the Docker deployment, by the backend otherwise). A replaced image always gets a new file name.

## Authentication Header

```
Authorization: Bearer <accessToken>
```

See [Authentication](./authentication.md) for the full token flow.

## Roles

Three roles exist: `admin`, `user`, `guest`. **Guests are read-only**: every mutating route (POST / PATCH / PUT / DELETE) across all modules answers `403` for guest tokens, enforced once before routing. Guests may still call the session endpoints (`/auth/login/guest`, `/auth/refresh-token`, `/auth/ticket`, `/auth/logout`). Admin-only routes are marked in the tables below.

**Status codes.** `401` always means the credential is missing, invalid, expired or its session has ended (clients refresh or sign in again). `403` always means the caller is authenticated but not allowed. `404` is used instead of `403` where a `403` would reveal that a private resource exists. `429` answers an exceeded rate limit.

---

## Auth: `/api/v2/auth`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/register` | none | Create a new account |
| POST | `/login` | none | Login with username + password |
| POST | `/login/guest` | none | Login as guest (read-only) |
| POST | `/refresh-token` | cookie | Get a new access token |
| POST | `/ticket` | JWT | Get a one-time SSE ticket |
| POST | `/logout` | cookie | Invalidate session |
| PATCH | `/me` | JWT | Update own profile |
| PATCH | `/:id` | admin | Update any user |
| DELETE | `/me` | JWT | Delete own account |

Login endpoints are rate-limited (per IP and per account, 15-minute window). Guest logins are limited per IP.

Sessions are persisted in the database (table `sessions`), so they survive a server restart. Each login has its own session id (`sid`) shared by its access and refresh tokens; a user keeps at most 3 sessions (the oldest is ended), the shared guest account up to 1000. Tokens issued before sessions were persisted carry no `sid` and answer `401`, which signs those users out once.

### POST `/register`

```json
// Request
{ "username": "alice", "password": "mypassword" }

// Response 201  (Location: /auth/me)
{ "data": { "id": 5, "username": "alice" } }
```

`username` is 3 to 64 characters. `password` is at least 8 characters and at most 72 bytes (UTF-8), because bcrypt ignores anything longer. The same rules apply to `PATCH /me` and `PATCH /:id`. Login only requires non-empty values (password up to 1024 characters) so accounts created under earlier rules keep working.

Errors: `400` (missing fields or limits, with `fields`), `409` (username taken)

### POST `/login`

```json
// Request
{ "username": "alice", "password": "mypassword" }

// Response 200
{ "data": { "accessToken": "eyJ..." } }
// + Cookie: refreshToken=...; HttpOnly; SameSite=Strict; Path=/api/v2/auth/refresh-token
```

The refresh cookie is scoped to the refresh endpoint so it is never sent with regular API calls. Errors: `400` (missing fields), `401` (invalid credentials)

### POST `/login/guest`

No request body required.

```json
// Response 200
{ "data": { "accessToken": "eyJ..." } }
```

### POST `/refresh-token`

Requires the `refreshToken` cookie (sent automatically by the browser). Answers `401` when the cookie is missing, invalid, expired or its session has ended. The new access token belongs to the same session.

```json
// Response 200
{ "data": { "accessToken": "eyJ..." } }
```

### POST `/ticket`

Issues a one-time ticket (60 s validity) for authenticating SSE streams; see [Authentication](./authentication.md). Available to every role including guests. Rate limited per user (`429`).

```json
// Response 200
{ "data": { "ticket": "a3f9b2c1..." } }
```

### POST `/logout`

Invalidates the session server-side (the refresh cookie is scoped to
`/auth`, so it reaches this endpoint) and clears the `refreshToken` cookie ,
on the current path as well as on legacy paths from earlier releases.

```
// Response 204: no body
```

### PATCH `/me`

Updates the authenticated user's own profile. At least one of `username`, `password` is required.

```json
// Request: change username
{ "username": "new_alice" }

// Request: change password (confirmation required)
{ "password": "newpass", "passwordConfirmation": "newpass" }

// Response 200
{ "data": null }
```

A rename onto an existing username answers `409`. Any profile change invalidates **all** existing sessions, the client must log in again, which is why the response carries no resource. Errors: `400`, `404`

---

## Plants: `/api/v2/plants`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | optional | Paged list, `scope=mine` (default for users) or `scope=public` |
| GET | `/:id` | optional | Single plant with all images |
| POST | `/` | JWT | Create plant |
| PATCH | `/:id` | JWT | Update plant (owner only) |
| DELETE | `/:id` | JWT | Delete plant (owner only) |

`GET /` takes the [paged list parameters](#paged-lists) (`limit`, `cursor`, `q`, `sort=created|name`, `scope=mine|public`) and `tz_offset`. Anonymous callers and guests only see `scope=public`. `GET /:id` answers `404` for a private plant the caller does not own.

`tz_offset` is the viewer's UTC offset in **minutes east of UTC** (`-new Date().getTimezoneOffset()` in a browser), an integer from `-840` to `840`; it defaults to `0`. It decides which local calendar days the watering summary counts. `POST` and `PATCH` take it in the JSON body as well; anything else, or a value out of range, answers `400`.

### Plant Object

The list items and the detail share one shape; the detail adds `images`.

```json
{
  "plant_id": 1,
  "plant_name": "Monstera deliciosa",
  "user_id": 2,
  "is_public": true,
  "created_at": 1704067200000,
  "species_name": "Monstera deliciosa",
  "substrate": { "substrate_id": 1, "substrate_name": "Aroid Mix" },
  "cover": {
    "id": 3,
    "url": "http://localhost:5000/uploads/plant/img-a1b2.webp",
    "srcset": "http://.../img-a1b2-160.webp 160w, http://.../img-a1b2-480.webp 480w, http://.../img-a1b2.webp 1024w",
    "width": 1024,
    "height": 768,
    "placeholder": "#4a6b3c",
    "date": 1717236000
  },
  "image_count": 4,
  "watering": {
    "last_watered_at": 1717236000000,
    "last_fertilized_at": 1716000000000,
    "avg_interval_days": 6.5
  },
  "images": [ { "id": 3, "url": "...", "...": "oldest first, detail only" } ]
}
```

- `species_name` is `null` when the plant has no species, `substrate` is `null` without a substrate.
- `cover` is the newest image (an [image object](#image-object)) or `null`; `image_count` counts all images. List items carry no `images` array.
- `watering` is the watering summary: `last_watered_at` and `last_fertilized_at` in epoch milliseconds (or `null`), `avg_interval_days` the mean gap in local days between distinct watering days (unrounded, `null` with fewer than two such days). It is filled **only for the owner**: in `scope=mine` and in the owner's detail. In `scope=public` (including the caller's own public plants) and for other viewers it is `null`, which means "unknown", not "never watered".
- `created_at` is epoch milliseconds (the cursor still keys on the stored seconds).

### POST `/`

```json
// Request
{
  "name": "Monstera deliciosa",
  "species": "Monstera deliciosa",
  "substrateId": 1,
  "isPublic": false
}

// Response 201  (Location: /plants/7)
{ "data": { "plant_id": 7, "plant_name": "Monstera deliciosa", "...": "full Plant Object" } }
```

Only `name` (1 to 100 characters) is required. `species` (up to 100 characters) and `substrateId` (a positive integer) are optional; an empty or `null` species and a `null` substrateId leave the field unset, so `{ "name": "Monstera" }` is a valid request.

A `substrateId` must name a substrate that is public or owned by the caller. A missing substrate and another user's private one both answer `404` (`Substrate not found`), and nothing is written.

Errors: `400` (validation), `401`, `403` (guest), `404` (substrate not usable)

### PATCH `/:id`

All fields optional (at least one required). Only the owner can update. `"species": ""` or `"species": null` clears the species, `"substrateId": null` clears the substrate. A new `substrateId` follows the same rule as on create.

```json
// Request
{ "name": "Monstera", "isPublic": true }

// Response 200
{ "data": { "plant_id": 7, "...": "full updated Plant Object" } }
```

Errors: `400`, `401`, `403` (guest), `404`

### DELETE `/:id`

```
// Response 204: no body
```

Errors: `401`, `403` (guest), `404`

---

## Watering: `/api/v2/watering`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/fertilizer-types` | JWT | List all fertilizer types |
| GET | `/plant/:plantId` | JWT | Paged history of a plant, newest first |
| GET | `/:id` | JWT | Single record |
| POST | `/:plantId` | JWT | Create record |
| PATCH | `/:id` | JWT | Update record |
| DELETE | `/:id` | JWT | Delete record |
| POST | `/batch` | JWT | Create one record per plant in a single transaction |
| POST | `/batch/delete` | JWT | Delete several records in a single transaction |

All reads and writes are scoped to plants the caller owns (ownership is checked in SQL; a foreign plant or record answers `404`). Mutations answer `403` for guests.

### Watering Record Object

```json
{ "id": 15, "plant_id": 1, "date": 1717236000000, "used_fertilizer": true, "fertilizer_type_id": 1 }
```

`date` is epoch milliseconds. `fertilizer_type_id` is `null` without fertilizer. `GET /fertilizer-types` returns `{ "data": [{ "fertilizer_id": 1, "fertilizer_name": "organic" }] }` (`Cache-Control: private, max-age=3600`).

### Watering Summary Object

The same summary the plant list carries, computed for the plant after the write:

```json
{ "last_watered_at": 1717236000000, "last_fertilized_at": null, "avg_interval_days": 6.5 }
```

Epoch milliseconds, `avg_interval_days` is `null` with fewer than two distinct local days. The local day boundary comes from `tz_offset` (minutes east of UTC, `-840` to `840`, default `0`), sent in the JSON body of POST, PATCH, `/batch` and `/batch/delete` and in the query of DELETE.

### GET `/plant/:plantId`

Paged with the [shared envelope](#paged-lists), but the cursor parameter is `before` and the default page size is 50 (maximum 100). Items are ordered newest first (`date DESC`, then id) and are [watering records](#watering-record-object). `total` is on the first page only. The ETag/304 behaviour of the other lists applies.

```
GET /api/v2/watering/plant/1?limit=50&before=<next_cursor>
```

### POST `/:plantId`

```json
// Request (all fields optional)
{ "date": 1719388800000, "usedFertilizer": true, "fertilizerTypeId": 1, "tz_offset": 120 }

// Response 201  (Location: /watering/15)
{ "data": { "record": { "id": 15, "...": "Watering Record Object" }, "summary": { "...": "Watering Summary Object" } } }
```

`date` accepts a Unix timestamp (seconds or milliseconds) or an ISO string and defaults to now. `fertilizerTypeId` can be `null`.
Errors: `400` (invalid body or date, with `fields`), `401`, `403` (guest), `404` (plant not found or not owned)

### PATCH `/:id`

At least one of `date`, `usedFertilizer`, `fertilizerTypeId` is required (`tz_offset` optional).

```json
// Response 200
{ "data": { "record": { "...": "updated record" }, "summary": { "...": "recomputed summary" } } }
```

### DELETE `/:id?tz_offset=120`

```json
// Response 200 (not 204: the client needs the new summary)
{ "data": { "summary": { "...": "summary of the record's plant" } } }
```

### POST `/batch`

```json
// Request
{
  "date": 1719388800000,
  "tz_offset": 120,
  "entries": [
    { "plantId": 1, "usedFertilizer": true, "fertilizerTypeId": 1 },
    { "plantId": 2, "usedFertilizer": false }
  ]
}

// Response 201
{ "data": { "records": [ { "id": 15, "...": "in entry order" } ], "summaries": { "1": { "...": "summary" }, "2": { "...": "summary" } } } }
```

`entries` holds 1 to 200 items with distinct `plantId`s. The batch is all or nothing and the summaries are read inside the same transaction. `summaries` is keyed by plant id (strings in JSON); a key can be missing for a plant deleted concurrently.
Errors: `400` (invalid body, empty, over 200 entries or duplicate plant), `401`, `403` (guest), `404` (any plant not found or not owned, nothing is created)

### POST `/batch/delete`

```json
// Request
{ "ids": [15, 16], "tz_offset": 120 }

// Response 200
{ "data": { "summaries": { "1": { "...": "summary of each affected plant" } } } }
```

`ids` holds 1 to 200 record ids; all or nothing.
Errors: `400`, `401`, `403` (guest), `404` (any record not found or not owned, nothing is deleted)

After a `5xx` on a write, clients should refetch the plant instead of retrying a POST blindly.

---

## Substrates: `/api/v2/substrates`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | JWT | Paged list, `scope=mine` (default) or `scope=public` |
| GET | `/:id` | JWT | Single substrate (own or public) with images and mix |
| POST | `/` | JWT | Create substrate (optionally with its mix) |
| PATCH | `/:id` | JWT | Update name, visibility and/or the mix |
| DELETE | `/:id` | JWT | Delete substrate (owner only) |

`GET /` takes the [paged list parameters](#paged-lists) (`limit`, `cursor`, `q`, `sort=created|name`, `scope`) and `component_id` (a positive integer): only substrates containing that component, within the chosen scope. A "used in" view that wants own and public substrates calls both scopes and dedupes by id. Guests default to `public`; their `scope=mine` is an empty page.

`GET /:id` answers `404` for a private substrate the caller does not own. Mutations require ownership; a foreign or unknown substrate answers `404` (not `403`), guests get `403`. Every mutation responds with the full, freshly read substrate detail.

### Substrate list item

```json
{
  "id": 1,
  "name": "Aroid Mix",
  "user_id": 2,
  "is_public": true,
  "created_at": 1704067200000,
  "cover": { "id": 9, "url": "...", "srcset": "...", "width": 1024, "height": 768, "placeholder": "#6b5a3c", "date": 1717236000 },
  "component_count": 4
}
```

### Substrate Object (detail)

The detail keeps its longer field names:

```json
{
  "substrate_id": 1,
  "substrate_user_id": 2,
  "substrate_name": "Aroid Mix",
  "is_public": true,
  "substrate_created_at": 1704067200000,
  "cover": null,
  "images": [],
  "components": [
    { "component_id": 1, "component_name": "Perlite", "component_fineness": "coarse", "component_parts": 2.5 }
  ]
}
```

`cover` is the newest image or `null`; `images` are oldest first.

### POST `/`

```json
// Request: name required, components optional (written in the same transaction)
{ "name": "Aroid Mix", "isPublic": false, "components": [ { "componentId": 1, "parts": 2.5 } ] }

// Response 201  (Location: /substrates/1)
{ "data": { "substrate_id": 1, "...": "Substrate Object" } }
```

### PATCH `/:id`

At least one field is required. `components` **replaces** the whole mix (one transaction, at most 100 distinct entries); `removedComponents` removes single components. Sending both answers `400`.

```json
// Request
{ "name": "Updated Mix", "isPublic": true, "components": [ { "componentId": 1, "parts": 3 } ] }
// or: { "removedComponents": [3] }

// Response 200
{ "data": { "substrate_id": 1, "...": "full updated Substrate Object" } }
```

The former `POST` and `PATCH /:id/components` routes were removed: create and `PATCH /:id` carry the mix (`components` replaces it as a whole).

---

## Components: `/api/v2/components`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | JWT | Paged catalogue, sorted by name |
| GET | `/fineness-levels` | JWT | All fineness levels |
| GET | `/:id` | JWT | Single component with its images |
| POST | `/` | **admin** | Create component |
| PUT | `/:id` | **admin** | Update component |
| DELETE | `/:id` | **admin** | Delete component |

The component catalogue is global, so all mutations are admin-only (`403` otherwise). `GET /` takes `limit`, `cursor` and `q` (name contains) of the [paged lists](#paged-lists); the only sort is `name` (case-insensitive, A to Z).

### Component list item and detail

```json
{
  "id": 5,
  "name": "Perlite",
  "fineness_id": 1,
  "fineness_name": "coarse",
  "cover": { "id": 12, "url": "...", "srcset": "...", "width": 1024, "height": 768, "placeholder": "#c9c4b8", "date": 1717236000 },
  "images": [ { "id": 12, "...": "oldest first, detail only" } ]
}
```

`GET /fineness-levels` returns `{ "data": [ { "fineness_id": 1, "fineness_name": "coarse" } ] }` with `Cache-Control: private, max-age=3600`.

### POST `/` and PUT `/:id`

The request body names the fineness by id (`fineness`), the response carries `fineness_id` and `fineness_name`.

```json
// Request
{ "name": "Perlite", "fineness": 1 }

// Response 201  (Location: /components/5)
{ "data": { "id": 5, "name": "Perlite", "fineness_id": 1, "fineness_name": "coarse", "cover": null, "images": [] } }
```

### DELETE `/:id`

```
// Response 204: no body
```

---

## Images: `/api/v2/images`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/:entityType/:entityId` | JWT | Upload image |
| GET | `/:entityType` | JWT | List images for entity (`?entityId=<id>`), oldest first |
| PATCH | `/:id` | JWT | Replace file and/or update date |
| DELETE | `/:id` | JWT | Delete single image by image id |
| DELETE | `/:entityType/:entityId` | JWT | Delete all images for an entity |

There is no route that serves image bytes: files are static under `/uploads` and are addressed by the `url`, `srcset` and variant URLs of the image object. The former `GET /:entityType/:entityId?size=` resize route is gone.

`entityType` must be one of: `plant`, `substrate`, `component`. Every route checks the caller against the entity the image belongs to:

| Entity | Read (list) | Write (upload, update, delete) |
|--------|--------------------|--------------------------------|
| plant, substrate | owner, or anyone when public | owner only |
| component | any signed-in user | admin only |

Image URLs in responses are absolute. The database stores only the path (`/uploads/plant/<file>.webp`); the origin comes from `PUBLIC_BASE_URL` when set, otherwise from the request's own origin. Deleting a plant, substrate or component also deletes its image rows and files, variants included.

A private entity the caller does not own, and an unknown entity, answer `404`. A write to a public entity owned by someone else answers `403`. Mutations answer `403` for guests. Uploads of an unsupported type, larger than **10 MB**, corrupt, or above the pixel cap (`UPLOAD_MAX_PIXELS`, default 40 million pixels) answer `400`. JPEG, PNG and WebP are accepted.

**Rate limit:** uploads (`POST`) and `PATCH` requests share one bucket of **30 per 10 minutes per user**; date-only PATCHes count. The 31st request answers `429` with the standard error envelope (`type: TooManyRequestsError`).

**Variants:** every stored image has three webp files: `<name>.webp` (max 1024 px wide, the `url`), `<name>-480.webp` and `<name>-160.webp`. Images are never upscaled, so a smaller source gives variants no wider than itself. Variants are encoded from one decode of the upload; EXIF orientation is applied and metadata is stripped. Images stored before variants existed are served as the single file until `pnpm run images:backfill` (or `IMAGE_BACKFILL_ON_START`) creates the variants, see [Deployment](./deployment.md#image-variants).

### Image object

Plant, substrate and component DTOs embed this shape as `cover` and `images`; the list and PATCH responses add `entityType`.

```json
{
  "id": 3,
  "url": "http://localhost:5000/uploads/plant/1717-monstera-a1b2.webp",
  "srcset": "http://localhost:5000/uploads/plant/1717-monstera-a1b2-160.webp 160w, http://localhost:5000/uploads/plant/1717-monstera-a1b2-480.webp 480w, http://localhost:5000/uploads/plant/1717-monstera-a1b2.webp 1024w",
  "width": 1024,
  "height": 768,
  "placeholder": "#4a6b3c",
  "date": 1719388800
}
```

| Field | Meaning |
|-------|---------|
| `url` | Absolute URL of the 1024 px file |
| `srcset` | `"<160 url> 160w, <480 url> 480w, <url> 1024w"`, or `null` for images without variants (only the single file exists) |
| `width`, `height` | Pixel size of the 1024 px file after rotation; `null` for legacy images |
| `placeholder` | Dominant colour as `#rrggbb`, usable as a loading background; `null` for legacy images |
| `date` | Capture date in epoch **seconds** (the one date in the API that is not milliseconds) |

Files are served immutable (`Cache-Control: public, max-age=31536000, immutable`), so a replaced image always gets a new, randomly suffixed file name.

### GET `/:entityType?entityId=1`

```json
// Response 200: not paged, oldest first
{ "data": [ { "id": 3, "...": "Image object", "entityType": "plant" } ] }
```

### POST `/:entityType/:entityId`

Request: `multipart/form-data` with the file field `image` (JPEG, PNG or WebP) and an optional text field `date`: the capture time as an integer in epoch **milliseconds**, between 2000-01-01 and 24 hours from now (`400` otherwise). Without it the EXIF date is used, then the upload time.

```json
// Response 201  (Location: /images/plant?entityId=1)
{
  "data": {
    "path": "http://localhost:5000/uploads/plant/1717-monstera-a1b2.webp",
    "date": "2024-06-01 10:30:00"
  }
}
```

**Processing pipeline:**
1. Capture date: the `date` field, else EXIF (`DateTimeOriginal`, `CreateDate`, `ModifyDate`, `GPSDateStamp`), else upload time
2. Filename anonymized (strips PII keywords like `iphone`, `admin`, `desktop`)
3. Decoded once, rotated by EXIF orientation, limited to 1024px width (no upscaling)
4. Encoded to three WebP variants (160, 480 and 1024px wide) at quality 78
5. Saved to `NAS_PATH/<entityType>/<timestamp>-<name>-<random hex>.webp` plus the `-160` and `-480` files; the placeholder colour is taken from the 160px variant

If any variant cannot be written, all files of the upload are removed and the request fails. Unreadable images answer `400`; storage errors (for example a full disk) answer `500`.

### PATCH `/:id`

`multipart/form-data`; provide a new `image` file and/or a `date` field (epoch milliseconds, at least one required: `400` otherwise, `400` for an invalid date).

```json
// Response 200
{ "data": { "id": 3, "url": "...", "srcset": "...", "width": 1024, "height": 768, "placeholder": "#4a6b3c", "date": 1719388800, "entityType": "plant" } }
```

The date is validated before any file is processed. When a new file is uploaded, the previous file and its variants are deleted from disk only after the database points at the new one; if the database update fails, the new files are removed instead.

### DELETE `/:id` and DELETE `/:entityType/:entityId`

```
// Response 204: no body
```

---

## Recognition: `/api/v2/recognition`

Identifies a plant from a photo of it by comparing the photo with the caller's own plant photos.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/status` | JWT | Whether a recognition model is loaded |
| POST | `/match` | JWT | Match a photo against the caller's plants |
| POST | `/snapshots/:id/confirm` | JWT | Water the chosen plant and optionally keep the photo |

Only JPEG and PNG photos up to **10 MB** are accepted (`400` otherwise). Mutations answer `403` for guests.

### GET `/status`

```json
// Response 200
{ "data": { "available": true } }
```

### POST `/match`

Request: `multipart/form-data` with field `image`. The photo is rotated by its EXIF orientation, resized and held
as a snapshot for 10 minutes. `candidates` lists up to five of the caller's plants, best first; a `score` at or
above `threshold` counts as a confident match.

```json
// Response 200
{
  "data": {
    "snapshotId": "7b0c0f6e-...",
    "threshold": 0.97,
    "candidates": [{ "plantId": 12, "score": 0.98 }]
  }
}
```

Answers `503` when no model is loaded and `429` when the embedder is busy.

### POST `/snapshots/:id/confirm`

Consumes the snapshot (once, only by the user who created it; otherwise `404`).

```json
// Request
{ "plantId": 12, "usedFertilizer": false, "fertilizerTypeId": null, "keepPhoto": true }
// Response 201
{ "data": { "recordId": 55, "imageId": 301 } }
```

`keepPhoto` defaults to `true`; `imageId` is `null` when the photo is not kept. A `plantId` the caller does not own answers `404`.

---

## Sales: `/api/v2/sales`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | ticket | SSE replay of every active sale stored in the database |
| GET | `/summary` | JWT | Counts for the NEW badge and staleness checks |
| GET | `/:id` | JWT | One sale with its price history |
| GET | `/health` | admin | Health of every scrape source |
| POST | `/health/:key/check` | admin | Refresh one source now and return its health |

Sales are scraped **in the background** by a refresher (see `SALES_REFRESH_*` in [Setup](./setup.md)) and stored in the database. No request triggers a scrape: the stream and the two read routes only read what the refresher stored. A freshly started server warms its sources shortly after listening (`SALES_REFRESH_WARM_DELAY_MS`), so the first seconds can return an empty list.

### Sale object

Times are epoch milliseconds.

```json
{
  "sale_id": "abc123",
  "sale_name": "Monstera",
  "sale_seller": "Foliage Dreams",
  "sale_link": "https://...",
  "sale_image_url": "https://...",
  "sale_old_price": 39.9,
  "sale_new_price": 19.9,
  "sale_discount_pct": 50,
  "sale_first_seen_at": 1717236000000,
  "sale_scraped_at": 1717239600000
}
```

`sale_image_url`, `sale_old_price` and `sale_discount_pct` are `null` when unknown. `sale_first_seen_at` is when the item first appeared and drives the NEW flag on the client; `sale_scraped_at` is the last scrape that saw it. (`sale_scraped_at` used to be an ISO string.)

### GET `/` (SSE replay)

```
GET /api/v2/sales?ticket=<one-time-ticket>
Accept: text/event-stream
```

A missing, unknown, used or expired ticket answers `401`.

```
data: [{"sale_id":"abc123", "...": "Sale object"}, ...]

event: done
data: {"total":42}

event: error
data: {"message":"Stream interrupted"}

: heartbeat
```

The server replays the active items newest first (by `sale_first_seen_at`), 100 per event, then sends `done`. A cold database ends with `done {"total":0}` and no error; `summary.refreshed_at === null` tells a client the sources were not warmed yet. A heartbeat (`: heartbeat`) is sent every 20 seconds. Because the data comes from the database, every reconnect repeats the full replay at the same cost.

### GET `/summary`

`since` is optional (epoch milliseconds, default `0`; anything else answers `400`).

```json
// GET /api/v2/sales/summary?since=1717000000000
{ "data": { "total": 420, "new_since": 12, "refreshed_at": 1717239600000, "latest_first_seen_at": 1717239000000 } }
```

`total` counts active items, `new_since` the active items first seen after `since`. `refreshed_at` is the latest successful refresh of any source (else the latest time an item was seen, `null` when nothing was ever stored). Cheap enough to poll for the tab badge; `ETag`/304 applies.

### GET `/:id`

```json
{ "data": { "sale_id": "abc123", "...": "Sale object", "history": [ { "price": 22.9, "observed_at": 1716000000000 }, { "price": 19.9, "observed_at": 1717239600000 } ] } }
```

`history` holds at most the 30 most recent price points (`SALES_PRICE_POINTS_MAX`), oldest first. An unknown id answers `404`.

**Supported shops:** Foliage Dreams, White Leaf Plants, Palmenmann, Plant Circle, PLNTS, Green Me Up, Jungle Leaves, Potflourri, Harmony Plants, Foliage Factory, PlantThatPlant, Grow Jungle, Blattmanufaktur, MG-Plants.

### Source health (admin)

`GET /api/v2/sales/health` requires a Bearer token of an admin user (401 without a token, 403 for other roles).

```json
{
  "data": [
    {
      "source_key": "jungleLeaves",
      "kind": "sales",
      "seller": "Jungle Leaves",
      "status": "ok",
      "active_strategy": "shopifyJson",
      "last_item_count": 3,
      "consecutive_failures": 0,
      "last_success_at": "2026-10-06T10:00:00.000Z",
      "last_failure_at": null,
      "last_error": null,
      "issues": [{ "code": "images_missing", "affected": 12, "total": 19 }],
      "updated_at": "2026-10-06T10:00:00.000Z"
    }
  ]
}
```

- `status`: `ok` (primary extraction strategy works and the data is sound), `degraded` (a fallback strategy carries the source, or `issues` is not empty), `failing` (no strategy produced usable data) or `unknown` (not scraped yet).
- `kind`: `sales` for the shops above, `search` for the plant link searchers used by `/more-info`. Search rows use the key `search:<shop>`.
- `active_strategy`: `shopifyJson`, `jsonLd`, `selector` or `heuristic`.
- `last_error` keeps the most recent failure reason after a recovery. Show it only while `status` is not `ok`.
- `issues`: field-level problems found in the latest page 1 scrape, as `{ code, affected, total }` objects. The list always reflects the latest run and is empty again once the source recovers. Search rows always have an empty list. Codes:
  - `images_missing`: more than 20% of the items have no image (`affected` of `total` items).
  - `images_unreachable`: sample image URLs do not answer with an `image/*` response (`affected` of `total` probed URLs, both failing).
  - `old_price_missing`: more than 20% of the items have no old price.
  - `names_missing`: more than 20% of the items have no name.

`POST /api/v2/sales/health/:key/check` refreshes that one source now (within the shared scrape limits, so it can be queued behind running scrapes), stores the items it finds and answers with the updated row in the same shape (`{ "data": { ... } }`). Unknown or `search` keys answer 404.

---

## More Info: `/api/v2/more-info`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | ticket | SSE stream: AI care guide + reference links |

### Request

```
GET /api/v2/more-info?ticket=<ticket>&plantName=Monstera+deliciosa&htmlFormatting=true&lang=de
```

| Parameter | Required | Default | Description |
|-----------|:--------:|---------|-------------|
| `plantName` | ✓ | none | Plant name to look up (max. 100 characters) |
| `htmlFormatting` | no | `false` | Return HTML instead of Markdown chunks |
| `lang` | no | `en` | Response language as a language tag such as `en` or `de-DE` (max. 35 characters). Falls back to the first valid `Accept-Language` entry; an invalid `lang` answers `400` |

A missing or over-long `plantName` or a malformed `lang` is rejected **before** the stream opens with a regular JSON `400` error envelope. The ticket is consumed either way. Streams are rate limited per user (`429`).

### Events

```
data: {"type":"ai_chunk","value":"## Light Requirements\n\nMonstera..."}

data: {"type":"link","value":"https://en.wikipedia.org/wiki/Monstera"}

event: done
data: {"status":"completed"}

event: error
data: {"message":"Information stream interrupted"}
```

`ai_chunk` events arrive as text is generated. `link` events arrive as each of the 7 link scrapers completes (Wikipedia, GBIF, RHS, and 4 plant shop scrapers). Both streams run in parallel.

When the AI provider fails or is not configured the stream ends with an `error` event and no `done` event. With `htmlFormatting=true`, model text is HTML-escaped before markup is added; live chunks are Markdown text and are escaped by the client when rendered.

---

## Health Endpoints

Registered under the versioned prefix.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v2/health` | Liveness: server status, DB connectivity, event loop and memory figures |
| GET | `/api/v2/health/ready` | Readiness: DB reachable and the recognition model loaded (or not configured) |

```json
// GET /api/v2/health  (503 {"status":"error","db":"disconnected"} when the DB ping fails)
{
  "status": "ok",
  "uptime": "0d 3h 12m 05s",
  "uptime_s": 11525,
  "db": "connected",
  "version": "v2",
  "event_loop_delay": { "p50_ms": 10.4, "p99_ms": 14.1, "max_ms": 31.7 },
  "rss_mb": 212.5
}

// GET /api/v2/health/ready  (503 {"ready":false} while the DB is down or the model is still loading)
{ "ready": true }
```

`event_loop_delay` is the event loop delay of the last completed 60 second window (sampled every 20 ms; before the first window ends, since start), so any poll rate sees the same recent worst case. `rss_mb` is the resident set size. The recognition model loads after the port opens, so the server answers requests while `/health/ready` is still `503`; the Docker `HEALTHCHECK` targets `/health/ready`.

---

← [Authentication](./authentication.md) · **Next:** [Error Handling](./error-handling.md)
