# API Reference

## Base URL

```
/api/v2
```

All requests require an `Authorization: Bearer <accessToken>` header except
`/auth/login`, `/auth/login/guest`, `/auth/register`, and `/auth/refresh-token`.

## Response Format

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

---

## Auth — `/api/v2/auth`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/register` | — | Create account |
| POST | `/login` | — | Login |
| POST | `/login/guest` | — | Guest login (read-only) |
| POST | `/refresh-token` | cookie | Refresh access token |
| POST | `/request-ticket` | JWT | Get one-time SSE ticket |
| POST | `/logout` | cookie | Logout |
| PUT | `/update` | JWT | Update own profile |
| DELETE | `/delete` | JWT | Delete own account |

### POST `/register` and POST `/login`

```json
{ "username": "alice", "password": "mypassword" }
// → 201/200: { "success": true, "data": { "accessToken": "eyJ..." } }
```

### POST `/request-ticket`

No request body. Returns `{ "ticket": "abc123" }` used as a query parameter
on SSE endpoints.

---

## Plants — `/api/v2/plants`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | optional | All public plants + own plants |
| GET | `/:id` | optional | Single plant by ID |
| POST | `/` | JWT | Create plant |
| PATCH | `/:id` | JWT | Update plant |
| DELETE | `/:id` | JWT | Delete plant |

### GET `/` response shape

```json
[
  {
    "plant_id": 7,
    "plant_user_id": 42,
    "plant_name": "Monstera Deliciosa",
    "plant_species": "Monstera deliciosa",
    "is_public": true,
    "plant_created_at": 1726839000,
    "image_url": "https://…/plant.webp",
    "substrate": { "substrate_id": 5, "substrate_name": "Aroid Mix" },
    "images": [{ "id": 10, "url": "…", "date": 1748779200 }]
  }
]
```

All date/time fields (`plant_created_at`, `images[].date`) are **Unix epoch seconds** (integer).
Use `Utils.convertToMillis()` on the frontend to obtain milliseconds for display.

Note: `substrate` is a **lightweight reference** `{ substrate_id, substrate_name }`,
not the full `SubstrateData`. Fetch from `/substrates/:id` for full details.

### POST `/` request body

```json
{ "name": "Monstera", "species": "Monstera deliciosa", "substrateId": 5, "isPublic": true }
```

---

## Substrates — `/api/v2/substrates`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | JWT | All public + own substrates (deduped) |
| GET | `/:id` | JWT | Single substrate by ID |
| POST | `/` | JWT | Create substrate |
| PATCH | `/:id` | JWT | Update name / isPublic / remove components |
| POST | `/components/:id` | JWT | Add components |
| PATCH | `/components/:id` | JWT | Upsert (replace) components |
| DELETE | `/:id` | JWT | Delete substrate |

### POST `/components/:id` request body

```json
{ "components": [{ "componentId": 1, "parts": 3 }, { "componentId": 2, "parts": 1 }] }
```

The substrate ID belongs in the URL only — do **not** include it in the body.

---

## Watering — `/api/v2/watering`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/fertilizer-types` | JWT | All fertilizer type options |
| GET | `/plant/:plantId` | JWT | All records for a plant |
| GET | `/:id` | JWT | Single record |
| POST | `/:plantId` | JWT | Add record |
| PATCH | `/:id` | JWT | Update record |
| DELETE | `/:id` | JWT | Delete record |

### GET `/plant/:plantId` response shape

```json
[
  {
    "record_id": 11,
    "plant_id": 7,
    "plant_name": "Monstera Deliciosa",
    "owner_id": 42,
    "watering_date": 1740819600,
    "used_fertilizer": true,
    "fertilizer_type_id": 1,
    "fertilizer_type": "Organic"
  }
]
```

`watering_date` is a **Unix epoch integer (seconds)**, not an ISO date string.
Use `Utils.convertToMillis()` on the frontend for display.

---

## Components — `/api/v2/components`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | JWT | All components |
| GET | `/fineness-levels` | JWT | Available fineness options |
| GET | `/component/:id` | JWT | Single component |
| POST | `/admin` | admin | Create component |
| PUT | `/admin/:id` | admin | Update component |
| DELETE | `/admin/:id` | admin | Delete component |

---

## Images — `/api/v2/images`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/:entityType/:entityId` | JWT | Upload image (multipart/form-data) |
| PATCH | `/image/:entityType/:id` | JWT | Replace file and/or update date |
| DELETE | `/image/:entityType/:id` | JWT | Delete single image |
| DELETE | `/:entityType/:entityId` | JWT | Delete all images for an entity |

`entityType` must be one of: `plant`, `substrate`, `component`.

---

## Sales — `/api/v2/sales` (SSE)

```
GET /api/v2/sales?ticket=<ticket>
```

Requires a one-time ticket from `POST /auth/request-ticket`.

### Stream events

| Event name | Data shape | Description |
|------------|------------|-------------|
| `message` | `APISale` | A single sale item |
| `done` | `{ total: number }` | Stream complete |
| `error` | `{ message: string }` | Stream error |

---

## More Info — `/api/v2/more-info` (SSE)

```
GET /api/v2/more-info?ticket=<ticket>&plantName=<name>&lang=<lang>
```

### Stream events

| Event name | Data shape | Description |
|------------|------------|-------------|
| `message` | `{ type: "link", value: string }` | External resource link |
| `message` | `{ type: "ai_chunk", value: string }` | Markdown text chunk |
| `done` | `{ status: "completed" }` | Stream complete |
| `error` | `{ message: string }` | Stream error |
