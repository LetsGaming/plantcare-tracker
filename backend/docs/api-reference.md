# API Reference

## Base URL

```
/api/v2
```

## Response Format

All endpoints return a consistent JSON envelope:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{
  "error": {
    "type": "ValidationError",
    "message": "Species is required",
    "statusCode": 400,
    "fields": { "species": "Required" }
  }
}
```

The `fields` property is only present on `ValidationError` (400) responses.

## Authentication Header

```
Authorization: Bearer <accessToken>
```

See [Authentication](./authentication.md) for the full token flow.

---

## Auth — `/api/v2/auth`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/register` | — | Create a new account |
| POST | `/login` | — | Login with username + password |
| POST | `/login/guest` | — | Login as guest (read-only) |
| POST | `/refresh-token` | cookie | Get a new access token |
| POST | `/request-ticket` | JWT | Get a one-time SSE ticket |
| POST | `/logout` | cookie | Invalidate session |
| PUT | `/update` | JWT | Update own profile |
| PUT | `/update/:id` | admin | Update any user |
| DELETE | `/delete` | JWT | Delete own account |

### POST `/register`

```json
// Request
{ "username": "alice", "password": "mypassword" }

// Response 201
{ "success": true, "data": { "id": 5, "username": "alice" } }
```

Errors: `400` (missing fields), `409` (username taken)

### POST `/login`

```json
// Request
{ "username": "alice", "password": "mypassword" }

// Response 200
{ "success": true, "data": { "accessToken": "eyJ..." } }
// + Cookie: refreshToken=...; HttpOnly; SameSite=Strict
```

Errors: `400` (missing fields), `401` (invalid credentials)

### POST `/login/guest`

No request body required.

```json
// Response 200
{ "success": true, "data": { "accessToken": "eyJ..." } }
```

### POST `/refresh-token`

Requires the `refreshToken` cookie (sent automatically by the browser).

```json
// Response 200
{ "success": true, "data": { "accessToken": "eyJ..." } }
```

### POST `/request-ticket`

```json
// Response 200
{ "success": true, "data": { "ticket": "a3f9b2c1..." } }
```

### POST `/logout`

Clears the `refreshToken` cookie and removes the session.

```json
// Response 200
{ "success": true, "data": { "loggedOut": true } }
```

### PUT `/update`

Updates the authenticated user's own profile. All fields are optional.

```json
// Request — change username
{ "username": "new_alice" }

// Request — change password (confirmation required)
{ "password": "newpass", "passwordConfirmation": "newpass" }

// Response 200
{ "success": true, "data": { "updated": true } }
```

Changing password invalidates all existing sessions. Errors: `400`, `404`

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

// Response 201
{ "success": true, "data": { "plantId": 7 } }
```

Errors: `400` (validation), `401`, `403` (guest)

### PATCH `/:id`

All fields optional. Only the owner can update.

```json
// Request
{ "name": "Monstera", "isPublic": true }

// Response 200
{ "success": true, "data": { "updated": true } }
```

Errors: `400`, `401`, `403` (guest), `404`

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

// Response 201
{ "success": true, "data": { "waterRecordId": 15 } }
```

`date` accepts a Unix timestamp (ms) or ISO string. Defaults to now.  
`fertilizerTypeId` can be `null` to record watering without fertilizer.

### PATCH `/:id`

```json
// Request — at least one field required
{
  "date": 1719388800000,
  "usedFertilizer": false,
  "fertilizerTypeId": null
}
```

---

## Substrates — `/api/v2/substrates`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | JWT | Public + own substrates merged |
| GET | `/public` | JWT | Public only |
| GET | `/private` | JWT | Own only |
| GET | `/substrate/:id` | JWT | Single substrate |
| POST | `/` | JWT | Create substrate |
| PATCH | `/:id` | JWT | Update name/visibility + remove components |
| POST | `/components/:id` | JWT | Add components (insert only) |
| PATCH | `/components/:id` | JWT | Upsert components (insert or update) |
| DELETE | `/:id` | JWT | Delete substrate (owner only) |

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
```

### POST `/components/:id` and PATCH `/components/:id`

```json
// Request
{
  "components": [
    { "componentId": 1, "parts": 2.5 },
    { "componentId": 2, "parts": 1.0 }
  ]
}
```

`POST` fails on duplicate. `PATCH` uses `INSERT ... ON DUPLICATE KEY UPDATE` — safe to call repeatedly.

---

## Components — `/api/v2/components`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | JWT | All components with fineness + images |
| GET | `/fineness-levels` | JWT | All fineness levels |
| GET | `/component/:id` | JWT | Single component |
| POST | `/admin` | **admin** | Create component |
| PUT | `/admin/:id` | **admin** | Update component |
| DELETE | `/admin/:id` | **admin** | Delete component |

### POST `/admin`

```json
// Request
{ "name": "Perlite", "fineness": 1 }

// Response 201
{ "success": true, "data": { "id": 5 } }
```

---

## Images — `/api/v2/images`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/:entityType/:entityId` | JWT | Upload image |
| GET | `/:entityType` | JWT | List images for entity (`?entityId=<id>`) |
| GET | `/:entityType/:entityId` | JWT | Serve image (`?size=<px>`) |
| PATCH | `/image/:entityType/:id` | JWT | Replace file and/or update date |
| DELETE | `/image/:entityType/:id` | JWT | Delete single image |
| DELETE | `/:entityType/:entityId` | JWT | Delete all images for entity |

`entityType` must be one of: `plant`, `substrate`, `component`

### POST `/:entityType/:entityId`

Request: `multipart/form-data` with field `image` (JPEG or PNG, max size determined by Multer config).

```json
// Response 201
{
  "success": true,
  "data": {
    "path": "http://localhost:5000/uploads/plant/monstera-a1b2.webp",
    "date": "2024-06-01 10:30:00"
  }
}
```

**Processing pipeline:**
1. EXIF date extracted (`DateTimeOriginal`, `CreateDate`, `ModifyDate`, `GPSDateStamp`)
2. Filename anonymized (strips PII keywords like `iphone`, `admin`, `desktop`)
3. Resized to max 1024px width (no upscaling)
4. Converted to WebP at quality 70, near-lossless
5. Saved to `NAS_PATH/<entityType>/<filename>.webp`

### GET `/:entityType/:entityId`

Serves the most recent image for the entity. Optional `?size=<px>` resizes on-the-fly.

```
GET /api/v2/images/plant/1?size=400
→ image/webp (400px wide, from cache 24h)
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

Not under `/api/v2` — available at root level.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server status + DB connectivity |
| GET | `/health/ready` | Readiness probe (DB ping only) |

```json
// GET /health
{ "status": "ok", "uptime": 1234.5, "db": "connected", "version": "v2" }

// GET /health/ready
{ "ready": true }
```

---

← [Authentication](./authentication.md) · **Next:** [Error Handling](./error-handling.md)
