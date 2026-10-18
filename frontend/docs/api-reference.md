# API Reference

## Base URL

```
/api/v2
```

All requests require an `Authorization: Bearer <accessToken>` header except
`/auth/login`, `/auth/login/guest`, `/auth/register`, and `/auth/refresh-token`.
Guest accounts are read-only: every mutating route (POST / PATCH / PUT / DELETE)
answers `403` for guest tokens.

## Response Format

```json
// Success (200 / 201)
{ "data": { ... } }

// No Content (successful DELETE, logout)
// → 204, empty body

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

Mutating endpoints (POST / PATCH / PUT) respond with the **full resource** in
the same shape a subsequent GET would return, no follow-up fetch is needed
after a write. POST additionally sets a `Location` header. Successful DELETEs
answer `204` with an empty body.

---

## Auth: `/api/v2/auth`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/register` | none | Create account |
| POST | `/login` | none | Login |
| POST | `/login/guest` | none | Guest login (read-only) |
| POST | `/refresh-token` | cookie | Refresh access token |
| POST | `/ticket` | JWT | Get one-time SSE ticket |
| POST | `/logout` | cookie | Logout |
| PATCH | `/me` | JWT | Update own profile |
| DELETE | `/me` | JWT | Delete own account |

### POST `/register` and POST `/login`

```json
{ "username": "alice", "password": "mypassword" }
// → 201/200: { "data": { "accessToken": "eyJ..." } }
```

### POST `/ticket`

No request body. Returns `{ "data": { "ticket": "abc123" } }`. The ticket is
single-use, valid for 60 seconds, and passed as a `ticket` query parameter on
SSE endpoints.

---

## Plants: `/api/v2/plants`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | optional | Paged: `scope=mine|public`, `limit`, `cursor`, `q`, `sort`, `tz_offset` |
| GET | `/:id` | optional | Single plant by ID |
| POST | `/` | JWT | Create plant |
| PATCH | `/:id` | JWT | Update plant |
| DELETE | `/:id` | JWT | Delete plant |

### GET `/` response shape

Lists answer `{ "data": { "items": [...], "next_cursor": string | null, "total"?: number } }` (`total` on the first page only). Items:

```json
{
  "plant_id": 7, "plant_name": "Monstera", "user_id": 42, "is_public": true,
  "created_at": 1726839000000, "species_name": "Monstera deliciosa",
  "substrate": { "substrate_id": 5, "substrate_name": "Aroid Mix" },
  "cover": { "id": 10, "url": "...", "srcset": "...", "width": 1024, "height": 768, "placeholder": "#4a6b3c", "date": 1748779200 },
  "image_count": 4,
  "watering": { "last_watered_at": 1740819600000, "last_fertilized_at": null, "avg_interval_days": 6.5 }
}
```

Dates are epoch milliseconds, except `cover.date` (seconds). `watering` is set only for the owner (`scope=mine`, own detail). The detail adds `images`. See the backend API reference for all parameters.

### POST `/` request body

```json
{ "name": "Monstera", "species": "Monstera deliciosa", "substrateId": 5, "isPublic": true }
```

---

## Substrates: `/api/v2/substrates`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | JWT | All public + own substrates (deduped) |
| GET | `/:id` | JWT | Single substrate by ID |
| POST | `/` | JWT | Create substrate |
| PATCH | `/:id` | JWT | Update name / isPublic / remove components |
| POST | `/:id/components` | JWT | Add components |
| PATCH | `/:id/components` | JWT | Upsert (replace) components |
| DELETE | `/:id` | JWT | Delete substrate |

### POST `/:id/components` request body

```json
{ "components": [{ "componentId": 1, "parts": 3 }, { "componentId": 2, "parts": 1 }] }
```

The substrate ID belongs in the URL only, do **not** include it in the body.

---

## Watering: `/api/v2/watering`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/fertilizer-types` | JWT | All fertilizer type options |
| GET | `/plant/:plantId` | JWT | All records for a plant |
| GET | `/:id` | JWT | Single record |
| POST | `/:plantId` | JWT | Add record |
| PATCH | `/:id` | JWT | Update record |
| DELETE | `/:id` | JWT | Delete record |

### GET `/plant/:plantId` response shape

Paged (`limit` default 50, cursor parameter `before`), newest first: `{ id, plant_id, date (epoch ms), used_fertilizer, fertilizer_type_id }`. Writes answer `{ record, summary }`, deletes `{ summary }`, batches `{ records, summaries }`; `tz_offset` goes in the body (query for DELETE).

---

## Components: `/api/v2/components`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | JWT | All components |
| GET | `/fineness-levels` | JWT | Available fineness options |
| GET | `/:id` | JWT | Single component |
| POST | `/` | admin | Create component |
| PUT | `/:id` | admin | Update component |
| DELETE | `/:id` | admin | Delete component |

---

## Images: `/api/v2/images`

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/:entityType/:entityId` | JWT | Upload image (multipart/form-data) |
| GET | `/:entityType` | JWT | List images for entity (`?entityId=<id>`) |
| PATCH | `/:id` | JWT | Replace file and/or update date |
| DELETE | `/:id` | JWT | Delete single image by image ID |
| DELETE | `/:entityType/:entityId` | JWT | Delete all images for an entity |

Uploads with an unsupported MIME type (png, jpeg, jpg and webp are accepted) or
larger than **10 MB** answer `400`.

`entityType` must be one of: `plant`, `substrate`, `component`.

---

## Sales: `/api/v2/sales`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/?ticket=<ticket>` | SSE replay of the stored sales (arrays of `APISale`, then `done { total }`) |
| GET | `/summary?since=<ms>` | `{ total, new_since, refreshed_at, latest_first_seen_at }` |
| GET | `/:id` | One sale plus `history: [{ price, observed_at }]` |

Sale times (`sale_first_seen_at`, `sale_scraped_at`) are epoch milliseconds. The server scrapes in the background; a cold database replays `done { total: 0 }`.

---

## More Info: `/api/v2/more-info` (SSE)

```
GET /api/v2/more-info?ticket=<ticket>&plantName=<name>&lang=<lang>
// plantName is required and limited to 100 characters (JSON 400 otherwise)
```

### Stream events

| Event name | Data shape | Description |
|------------|------------|-------------|
| `message` | `{ type: "link", value: string }` | External resource link |
| `message` | `{ type: "ai_chunk", value: string }` | Markdown text chunk |
| `done` | `{ status: "completed" }` | Stream complete |
| `error` | `{ message: string }` | Stream error |
