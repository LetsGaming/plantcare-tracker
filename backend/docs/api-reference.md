# API Reference

## Base URL

```
/api/v2
```

## Response Format

All timestamps on plants, substrates, watering records and image lists are Unix epoch **seconds** (integers). The upload response's `date` is a formatted UTC string, and the sales and source-health timestamps are ISO strings.

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
    "fields": { "species": "Species is required" }
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
| Foreign key constraint (unknown `substrateId`, `componentId`) | `400` | `ValidationError` |
| Upload that is not a decodable image | `400` | `ValidationError` |

A request from a disallowed `Origin` is answered normally without CORS headers.

Mutating endpoints (POST / PATCH / PUT) respond with the **full resource** in the same shape a subsequent GET would return — clients never need a follow-up fetch after a write. POST additionally sets a `Location` header pointing at the created resource.

## Authentication Header

```
Authorization: Bearer <accessToken>
```

See [Authentication](./authentication.md) for the full token flow.

## Roles

Three roles exist: `admin`, `user`, `guest`. **Guests are read-only**: every mutating route (POST / PATCH / PUT / DELETE) across all modules answers `403` for guest tokens, enforced once before routing. Guests may still call the session endpoints (`/auth/login/guest`, `/auth/refresh-token`, `/auth/ticket`, `/auth/logout`). Admin-only routes are marked in the tables below.

**Status codes.** `401` always means the credential is missing, invalid, expired or its session has ended (clients refresh or sign in again). `403` always means the caller is authenticated but not allowed. `404` is used instead of `403` where a `403` would reveal that a private resource exists. `429` answers an exceeded rate limit.

---

## Auth — `/api/v2/auth`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/register` | — | Create a new account |
| POST | `/login` | — | Login with username + password |
| POST | `/login/guest` | — | Login as guest (read-only) |
| POST | `/refresh-token` | cookie | Get a new access token |
| POST | `/ticket` | JWT | Get a one-time SSE ticket |
| POST | `/logout` | cookie | Invalidate session |
| PATCH | `/me` | JWT | Update own profile |
| PATCH | `/:id` | admin | Update any user |
| DELETE | `/me` | JWT | Delete own account |

Login endpoints are rate-limited (per IP and per account, 15-minute window).

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
`/auth`, so it reaches this endpoint) and clears the `refreshToken` cookie —
on the current path as well as on legacy paths from earlier releases.

```
// Response 204 — no body
```

### PATCH `/me`

Updates the authenticated user's own profile. At least one of `username`, `password` is required.

```json
// Request — change username
{ "username": "new_alice" }

// Request — change password (confirmation required)
{ "password": "newpass", "passwordConfirmation": "newpass" }

// Response 200
{ "data": null }
```

A rename onto an existing username answers `409`. Any profile change invalidates **all** existing sessions — the client must log in again, which is why the response carries no resource. Errors: `400`, `404`

---

## Plants — `/api/v2/plants`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | optional | All public + own plants |
| GET | `/:id` | optional | Single plant |
| POST | `/` | JWT | Create plant |
| PATCH | `/:id` | JWT | Update plant (owner only) |
| DELETE | `/:id` | JWT | Delete plant (owner only) |

> Unauthenticated requests only see public plants. Authenticated requests see public plants + own private plants, deduplicated.

### Plant Object

```json
{
  "plant_id": 1,
  "plant_user_id": 2,
  "plant_name": "Monstera deliciosa",
  "plant_species": "Monstera deliciosa",
  "is_public": true,
  "plant_created_at": 1704067200,
  "image_url": "http://localhost:5000/uploads/plant/img-a1b2.webp",
  "substrate": { "substrate_id": 1, "substrate_name": "Aroid Mix" },
  "images": [
    { "id": 3, "url": "http://...", "date": 1717236000 }
  ]
}
```

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

Errors: `400` (validation), `401`, `403` (guest)

### PATCH `/:id`

All fields optional (at least one required). Only the owner can update.

```json
// Request
{ "name": "Monstera", "isPublic": true }

// Response 200
{ "data": { "plant_id": 7, "...": "full updated Plant Object" } }
```

Errors: `400`, `401`, `403` (guest), `404`

### DELETE `/:id`

```
// Response 204 — no body
```

Errors: `401`, `403` (guest), `404`

---

## Watering — `/api/v2/watering`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/fertilizer-types` | JWT | List all fertilizer types |
| GET | `/plant/:plantId` | JWT | All records for a plant |
| GET | `/:id` | JWT | Single record |
| POST | `/:plantId` | JWT | Create record |
| PATCH | `/:id` | JWT | Update record |
| DELETE | `/:id` | JWT | Delete record |

All reads and writes are scoped to plants the caller owns. Mutations answer `403` for guests.

### Watering Record Object

```json
{
  "record_id": 1,
  "watering_date": 1717236000,
  "used_fertilizer": true,
  "fertilizer_type_id": 1,
  "fertilizer_type": "organic",
  "plant_id": 1,
  "plant_name": "Monstera deliciosa",
  "owner_id": 2
}
```

### POST `/:plantId`

```json
// Request (all fields optional)
{
  "date": 1719388800000,
  "usedFertilizer": true,
  "fertilizerTypeId": 1
}

// Response 201  (Location: /watering/15)
{ "data": { "record_id": 15, "...": "full Watering Record Object" } }
```

`date` accepts a Unix timestamp (seconds or ms) or ISO string. Defaults to now.  
`fertilizerTypeId` can be `null` to record watering without fertilizer.  
Errors: `400` (invalid body or date, with `fields`), `401`, `403` (guest), `404` (plant not found / not owned)

### PATCH `/:id`

```json
// Request — at least one field required
{
  "date": 1719388800000,
  "usedFertilizer": false,
  "fertilizerTypeId": null
}

// Response 200
{ "data": { "record_id": 15, "...": "full updated Watering Record Object" } }
```

### DELETE `/:id`

```
// Response 204 — no body
```

---

## Substrates — `/api/v2/substrates`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | JWT | Public + own substrates merged, deduplicated |
| GET | `/:id` | JWT | Single substrate (own or public) |
| POST | `/` | JWT | Create substrate |
| PATCH | `/:id` | JWT | Update name/visibility + remove components |
| POST | `/:id/components` | JWT | Add components (insert only) |
| PATCH | `/:id/components` | JWT | Upsert components (insert or replace) |
| DELETE | `/:id` | JWT | Delete substrate (owner only) |

`GET /:id` answers `404` for a private substrate the caller does not own. Mutations require ownership (`403` for foreign substrates, `403` for guests). Every mutation responds with the full, freshly-read substrate including its components.

### Substrate Object

```json
{
  "substrate_id": 1,
  "substrate_user_id": 2,
  "substrate_name": "Aroid Mix",
  "is_public": true,
  "substrate_created_at": 1704067200,
  "image_url": null,
  "images": [],
  "components": [
    {
      "component_id": 1,
      "component_name": "Perlite",
      "component_fineness": "coarse",
      "component_parts": 2.50
    }
  ]
}
```

### PATCH `/:id`

```json
// Request — update name and remove component 3
{
  "name": "Updated Mix",
  "isPublic": true,
  "removedComponents": [3]
}

// Response 200
{ "data": { "substrate_id": 1, "...": "full updated Substrate Object" } }
```

### POST `/:id/components` and PATCH `/:id/components`

```json
// Request
{
  "components": [
    { "componentId": 1, "parts": 2.5 },
    { "componentId": 2, "parts": 1.0 }
  ]
}

// POST → Response 201 (Location: /substrates/1) — PATCH → Response 200
{ "data": { "substrate_id": 1, "...": "full updated Substrate Object" } }
```

`POST` fails on duplicate components. `PATCH` uses `INSERT OR REPLACE` — safe to call repeatedly.

---

## Components — `/api/v2/components`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | JWT | All components with fineness + images |
| GET | `/fineness-levels` | JWT | All fineness levels |
| GET | `/:id` | JWT | Single component |
| POST | `/` | **admin** | Create component |
| PUT | `/:id` | **admin** | Update component |
| DELETE | `/:id` | **admin** | Delete component |

The component catalogue is global, so all mutations are admin-only (`403` otherwise).

### POST `/`

```json
// Request
{ "name": "Perlite", "fineness": 1 }

// Response 201  (Location: /components/5)
{ "data": { "component_id": 5, "component_name": "Perlite", "...": "full Component Object" } }
```

### DELETE `/:id`

```
// Response 204 — no body
```

---

## Images — `/api/v2/images`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/:entityType/:entityId` | JWT | Upload image |
| GET | `/:entityType` | JWT | List images for entity (`?entityId=<id>`) |
| GET | `/:entityType/:entityId` | JWT | Serve primary image file (`?size=<px>`) |
| PATCH | `/:id` | JWT | Replace file and/or update date |
| DELETE | `/:id` | JWT | Delete single image by image id |
| DELETE | `/:entityType/:entityId` | JWT | Delete all images for an entity |

`entityType` must be one of: `plant`, `substrate`, `component`. Every route checks the caller against the entity the image belongs to:

| Entity | Read (list, serve) | Write (upload, update, delete) |
|--------|--------------------|--------------------------------|
| plant, substrate | owner, or anyone when public | owner only |
| component | any signed-in user | admin only |

Image URLs in responses are absolute. The database stores only the path (`/uploads/plant/<file>.webp`); the origin comes from `PUBLIC_BASE_URL` when set, otherwise from the request's own origin. Deleting a plant, substrate or component also deletes its image rows and files.

A private entity the caller does not own, and an unknown entity, answer `404`. A write to a public entity owned by someone else answers `403`. Mutations answer `403` for guests. Uploads with an unsupported MIME type or larger than **10 MB** answer `400`.

### POST `/:entityType/:entityId`

Request: `multipart/form-data` with field `image` (JPEG or PNG).

```json
// Response 201  (Location: /images/plant/1)
{
  "data": {
    "path": "http://localhost:5000/uploads/plant/monstera-a1b2.webp",
    "date": "2024-06-01 10:30:00"
  }
}
```

**Processing pipeline:**
1. EXIF date extracted (`DateTimeOriginal`, `CreateDate`, `ModifyDate`, `GPSDateStamp`), fallback: upload time
2. Filename anonymized (strips PII keywords like `iphone`, `admin`, `desktop`)
3. Resized to max 1024px width (no upscaling)
4. Converted to WebP at quality 70, near-lossless
5. Saved to `NAS_PATH/<entityType>/<filename>-<random hex>.webp`

### GET `/:entityType/:entityId`

Serves the entity's primary (oldest) image. Optional `?size=<px>` resizes on-the-fly.

```
GET /api/v2/images/plant/1?size=400
→ image/webp (400px wide, Cache-Control: public, max-age=86400)
```

### PATCH `/:id`

`multipart/form-data`; provide a new `image` file and/or a `date` field (at least one required — `400` otherwise, `400` for an unparsable date).

```json
// Response 200
{ "data": { "id": 3, "url": "http://...", "date": 1719388800, "entityType": "plant" } }
```

When a new file is uploaded, the previous file is deleted from disk only after the database points at the new one.

### DELETE `/:id` and DELETE `/:entityType/:entityId`

```
// Response 204 — no body
```

---

## Sales — `/api/v2/sales`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | ticket | SSE stream of live plant sales |
| GET | `/health` | admin | Health of every scrape source |
| POST | `/health/:key/check` | admin | Re-scrape page 1 of one source now and return its health |

### Request

```
GET /api/v2/sales?ticket=<one-time-ticket>
Accept: text/event-stream
```

A missing, unknown, used or expired ticket answers `401`.

### Events

```
data: [{"sale_id":"abc123","sale_name":"Monstera","sale_seller":"Foliage Dreams","sale_link":"https://...","sale_image_url":"https://...","sale_old_price":39.90,"sale_new_price":19.90,"sale_scraped_at":"2024-06-01T10:00:00.000Z"}, ...]

event: done
data: {"total":42}

event: error
data: {"message":"Stream interrupted"}

: heartbeat
```

Items arrive in batches as each scraper completes. The `done` event is sent when all scrapers have finished. A heartbeat (`: heartbeat`) is sent every 20 seconds to keep the connection alive.

**Supported shops:** Foliage Dreams, White Leaf Plants, Palmenmann, Plant Circle, PLNTS, Green Me Up, Jungle Leaves, Potflourri, Harmony Plants.

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
      "updated_at": "2026-10-06T10:00:00.000Z"
    }
  ]
}
```

- `status`: `ok` (primary extraction strategy works), `degraded` (a fallback strategy carries the source), `failing` (no strategy produced usable data) or `unknown` (not scraped yet).
- `kind`: `sales` for the shops above, `search` for the plant link searchers used by `/more-info`. Search rows use the key `search:<shop>`.
- `active_strategy`: `shopifyJson`, `jsonLd`, `selector` or `heuristic`.
- `last_error` keeps the most recent failure reason after a recovery. Show it only while `status` is not `ok`.

`POST /api/v2/sales/health/:key/check` bypasses the result cache, re-scrapes page 1 and answers with the updated row in the same shape (`{ "data": { ... } }`). Unknown or `search` keys answer 404.

---

## More Info — `/api/v2/more-info`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | ticket | SSE stream: AI care guide + reference links |

### Request

```
GET /api/v2/more-info?ticket=<ticket>&plantName=Monstera+deliciosa&htmlFormatting=true&lang=de
```

| Parameter | Required | Default | Description |
|-----------|:--------:|---------|-------------|
| `plantName` | ✓ | — | Plant name to look up (max. 100 characters) |
| `htmlFormatting` | — | `false` | Return HTML instead of Markdown chunks |
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
| GET | `/api/v2/health` | Server status + DB connectivity |
| GET | `/api/v2/health/ready` | Readiness probe (DB ping only) |

```json
// GET /api/v2/health
{ "status": "ok", "uptime": "0d 3h 12m 05s", "uptime_s": 11525, "db": "connected", "version": "v2" }

// GET /api/v2/health/ready
{ "ready": true }
```

---

← [Authentication](./authentication.md) · **Next:** [Error Handling](./error-handling.md)
