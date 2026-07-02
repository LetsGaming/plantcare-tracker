# API Reference

## Base URL

```
/api/v2
```

## Response Format

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

Mutating endpoints (POST / PATCH / PUT) respond with the **full resource** in the same shape a subsequent GET would return — clients never need a follow-up fetch after a write. POST additionally sets a `Location` header pointing at the created resource.

## Authentication Header

```
Authorization: Bearer <accessToken>
```

See [Authentication](./authentication.md) for the full token flow.

## Roles

Three roles exist: `admin`, `user`, `guest`. **Guests are read-only**: every mutating route (POST / PATCH / PUT / DELETE) across all modules answers `403` for guest tokens. Admin-only routes are marked in the tables below.

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

Errors: `400` (missing fields), `409` (username taken)

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

Requires the `refreshToken` cookie (sent automatically by the browser).

```json
// Response 200
{ "data": { "accessToken": "eyJ..." } }
```

### POST `/ticket`

Issues a one-time ticket (60 s validity) for authenticating SSE streams; see [Authentication](./authentication.md).

```json
// Response 200
{ "data": { "ticket": "a3f9b2c1..." } }
```

### POST `/logout`

Clears the `refreshToken` cookie and removes the session.

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

Any profile change invalidates **all** existing sessions — the client must log in again, which is why the response carries no resource. Errors: `400`, `404`

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
  "plant_created_at": "2024-01-01T00:00:00.000Z",
  "image_url": "http://localhost:5000/uploads/plant/img-a1b2.webp",
  "substrate": { "substrate_id": 1, "substrate_name": "Aroid Mix" },
  "images": [
    { "id": 3, "url": "http://...", "date": "2024-06-01 10:00:00" }
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
  "watering_date": "2024-06-01 10:00:00",
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
| GET | `/:id` | JWT | Single substrate |
| POST | `/` | JWT | Create substrate |
| PATCH | `/:id` | JWT | Update name/visibility + remove components |
| POST | `/:id/components` | JWT | Add components (insert only) |
| PATCH | `/:id/components` | JWT | Upsert components (insert or replace) |
| DELETE | `/:id` | JWT | Delete substrate (owner only) |

Mutations require ownership (`403` for foreign substrates, `403` for guests). Every mutation responds with the full, freshly-read substrate including its components.

### Substrate Object

```json
{
  "substrate_id": 1,
  "substrate_user_id": 2,
  "substrate_name": "Aroid Mix",
  "is_public": true,
  "substrate_created_at": "2024-01-01T00:00:00.000Z",
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

`entityType` must be one of: `plant`, `substrate`, `component`. Mutations answer `403` for guests. Uploads with an unsupported MIME type answer `400`.

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
5. Saved to `NAS_PATH/<entityType>/<filename>.webp`

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

### Request

```
GET /api/v2/sales?ticket=<one-time-ticket>
Accept: text/event-stream
```

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
| `plantName` | ✓ | — | Plant name to look up |
| `htmlFormatting` | — | `false` | Return HTML instead of Markdown chunks |
| `lang` | — | `en` | Response language (falls back to `Accept-Language` header) |

A missing `plantName` is rejected **before** the stream opens with a regular JSON `400` error envelope.

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
