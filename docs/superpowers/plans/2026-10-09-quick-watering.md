# Quick Watering (Round Mode + Snap to Log) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. On approval this file is copied to `docs/superpowers/plans/2026-10-09-quick-watering.md` and committed on `feat/quick-watering`.

**Goal:** Make logging a watering nearly free: a one-screen watering round with batch save, plus "snap a plant" photo recognition that runs locally on the Pi and logs the watering in one tap.

**Architecture:** Backend gets a batch watering endpoint and a new `recognition` module (ONNX DINOv2-small embeddings stored per plant photo in SQLite, cosine matching per user, temp snapshots that become plant photos on confirm). Frontend gets a `/tabs/water` view combining the round list and a snap flow (native camera through a file input, a candidate sheet, fertilizer and undo after logging).

**Tech Stack:** Fastify 5, Kysely, better-sqlite3, zod 4, sharp, onnxruntime-node 1.30.0, vitest 4; Ionic Vue 8 (Options API), Pinia, vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-10-09-quick-watering-design.md` (commit f46c590).

## Context

Watering logs are mostly never written because getting from "can in hand" to "this plant's page" takes too long. The brainstorm chose an in-app round plus camera recognition (no NFC/QR, no per-plant setup, Android and iPhone). This plan turns the approved spec into tasks that subagents can execute in parallel waves.

## Global Constraints

- Frontend stays on the Options API; `.vue` files never import `@/utils/apiUtils` or `tokenUtils` (`frontend/src/tests/conventions.test.ts`).
- Every new user-visible string gets a key in both `frontend/src/locales/en.ts` and `de.ts` (flat dotted keys); `pnpm run check-keys` must exit 0.
- Icons only from `frontend/src/theme/icons.ts`; styling only with design tokens (`frontend/docs/design-system.md`).
- No em dashes anywhere (code, comments, docs, commits). Comments only for non-obvious present behaviour; never narrate tasks or history.
- Commit messages carry no Claude/AI attribution or trailers (user global rule overrides the harness reminder).
- One feature branch `feat/quick-watering`, one PR at the end.
- Accepted upload types stay jpeg/png, 10 MB (`MAX_UPLOAD_BYTES`); snapshots expire after 10 minutes; batch size 1 to 200.
- Model: `https://huggingface.co/onnx-community/dinov2-small/resolve/main/onnx/model_quantized.onnx` (24,446,700 bytes), input `pixel_values` float32 `[1,3,224,224]`, output `last_hidden_state` `[1,257,384]`; embedding = CLS token `data.subarray(0, 384)`, L2-normalised. Preprocess: shortest edge 256 bicubic, centre crop 224, `/255`, mean `[0.485,0.456,0.406]`, std `[0.229,0.224,0.225]`, CHW.
- Backend gates: `pnpm run lint`, `format:check`, `typecheck`, `test:coverage`, `build`. Frontend gates: `pnpm run lint`, `format:check`, `pnpm exec vue-tsc --noEmit`, `pnpm run check-keys`, `pnpm exec vitest run --coverage`, `pnpm run build`.

## Review Focus

1. A user whose plants have no photos (or a brand new account) snaps a plant: match returns `candidates: []`, the sheet goes straight to "Other plant...", confirming seeds that plant's first photo. Tests: Task 4 (empty candidates), Task 7 (empty sheet state).
2. Double tap on a candidate or retry after a slow network: the second confirm must not log twice. Tests: Task 4 (confirm twice returns 404, one record), Task 7 (buttons disabled while confirming).
3. Real phone photos: EXIF-rotated 12 MP JPEGs near the size limit, and files over 10 MB. Tests: Task 4 (rotated jpeg accepted, oversize gives 413 envelope).
4. Batch with a duplicate plant id or a plant deleted meanwhile: duplicates are rejected with 400, a missing or foreign plant rejects the whole batch with 404 and writes nothing. Tests: Task 1.
5. Recognition unavailable (no model file, model load failure) or guest session: the round still works, snap is hidden, match answers 503. Tests: Task 4 (status false, 503), Task 7 (snap hidden).

## Execution: agent waves

Each task runs as one implementer subagent, followed by one reviewer subagent (spec + quality) before merge. Parallel tasks run in their own git worktree (`isolation: "worktree"`) branched from `feat/quick-watering`; the controller merges finished tasks back in order and resolves the only expected overlaps (locale files, `backend/package.json`/lockfile).

| Wave | Tasks (parallel inside a wave) | Depends on |
|------|-------------------------------|-----------|
| A | T1 batch watering API, T2 recognition core, T3 ONNX embedder + delivery, T6 frontend round | spec only (API contracts are fixed below) |
| B | T4 recognition API + images hook, T7 frontend snap flow | T4 needs T2+T3 merged; T7 needs T6 merged |
| C | T5 dev server, seed, docs | T1 to T4 merged |
| D | T8 full gates, manual Edge run, whole-branch review, PR | everything |

Fixed HTTP contracts (both sides build against these):

- `POST /api/v2/watering/batch` body `{ date?: string|number, entries: [{ plantId, usedFertilizer, fertilizerTypeId? }] }` -> 201 `{ data: { ids: number[] } }`
- `POST /api/v2/watering/batch/delete` body `{ ids: number[] }` -> 204
- `GET /api/v2/recognition/status` -> 200 `{ data: { available: boolean } }`
- `POST /api/v2/recognition/match` multipart field `image` -> 200 `{ data: { snapshotId: string, threshold: number, candidates: [{ plantId, score }] } }` (max 5, best first); 503 when unavailable
- `POST /api/v2/recognition/snapshots/:id/confirm` body `{ plantId, usedFertilizer?, fertilizerTypeId?, keepPhoto? }` -> 201 `{ data: { recordId: number, imageId: number | null } }`; 404 for unknown/expired/foreign snapshot or foreign plant

(Undo of a round uses `POST .../batch/delete` instead of `DELETE` with a body, because `ApiUtils.delete` sends no body.)

---

### Task 1: Batch watering API (wave A)

**Files:**
- Modify: `backend/src/modules/watering/domain/WateringRecord.ts` (repository port)
- Modify: `backend/src/modules/watering/infrastructure/SQLiteWateringRepository.ts`
- Modify: `backend/src/modules/watering/application/WateringUseCases.ts`
- Modify: `backend/src/modules/watering/presentation/wateringController.ts`, `wateringRoutes.ts`
- Test: `backend/tests/contract/wateringBatch.contract.test.ts`

**Interfaces:**
- Produces: `WateringRepository.createMany(userId: number, entries: NewWateringEntry[], date: number): Promise<number[] | null>`, `WateringRepository.deleteMany(userId: number, ids: number[]): Promise<boolean>`, `CreateWateringBatchUseCase`, `DeleteWateringBatchUseCase`, routes above.

- [ ] **Step 1: Write the failing contract tests**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createContractApp, type ContractApp } from './harness';
import { createPlant, createSubstrate } from './support';

let app: ContractApp;
beforeAll(async () => { app = await createContractApp(); });
afterAll(() => app.close());

const setup = async () => {
  const owner = await app.signIn('user');
  const substrate = await createSubstrate(app, owner.auth);
  const a = await createPlant(app, owner.auth, substrate.substrate_id);
  const b = await createPlant(app, owner.auth, substrate.substrate_id);
  return { owner, a, b };
};
const records = async (auth: Record<string, string>, plantId: number) =>
  (await app.client.request({ method: 'get', url: `${API}/watering/plant/${plantId}`, headers: auth })).body.data ?? [];
const batch = (auth: Record<string, string> | undefined, json: unknown) =>
  app.client.request({ method: 'post', url: `${API}/watering/batch`, headers: auth, json });

describe('POST /watering/batch', () => {
  it('creates one record per entry with per-entry fertilizer', async () => {
    const { owner, a, b } = await setup();
    const res = await batch(owner.auth, {
      entries: [
        { plantId: a.plant_id, usedFertilizer: true, fertilizerTypeId: 1 },
        { plantId: b.plant_id, usedFertilizer: false },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.ids).toHaveLength(2);
    expect(await records(owner.auth, a.plant_id)).toHaveLength(1);
    expect(await records(owner.auth, b.plant_id)).toHaveLength(1);
  });

  it('rejects the whole batch when one plant is foreign', async () => {
    const { owner, a } = await setup();
    const other = await setup();
    const res = await batch(owner.auth, {
      entries: [{ plantId: a.plant_id, usedFertilizer: false }, { plantId: other.a.plant_id, usedFertilizer: false }],
    });
    expect(res.status).toBe(404);
    expect(await records(owner.auth, a.plant_id)).toHaveLength(0);
  });

  it('rejects duplicates, empty and oversized batches', async () => {
    const { owner, a } = await setup();
    const dup = { plantId: a.plant_id, usedFertilizer: false };
    expect((await batch(owner.auth, { entries: [dup, dup] })).status).toBe(400);
    expect((await batch(owner.auth, { entries: [] })).status).toBe(400);
    expect((await batch(owner.auth, { entries: Array.from({ length: 201 }, () => dup) })).status).toBe(400);
  });

  it('requires auth and blocks guests', async () => {
    expect((await batch(undefined, { entries: [] })).status).toBe(401);
    const guest = await app.signIn('guest');
    expect((await batch(guest.auth, { entries: [{ plantId: 1, usedFertilizer: false }] })).status).toBe(403);
  });
});

describe('POST /watering/batch/delete', () => {
  it('deletes own records and refuses foreign ones', async () => {
    const { owner, a } = await setup();
    const other = await setup();
    const { ids } = (await batch(owner.auth, { entries: [{ plantId: a.plant_id, usedFertilizer: false }] })).body.data;
    const del = (auth: Record<string, string>) =>
      app.client.request({ method: 'post', url: `${API}/watering/batch/delete`, headers: auth, json: { ids } });
    expect((await del(other.owner.auth)).status).toBe(404);
    expect((await del(owner.auth)).status).toBe(204);
    expect(await records(owner.auth, a.plant_id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL (404 route not found)**

Run: `cd backend; pnpm exec vitest run tests/contract/wateringBatch.contract.test.ts`

- [ ] **Step 3: Repository port and implementation**

In the domain file add:

```ts
export interface NewWateringEntry {
  plantId: number;
  usedFertilizer: boolean;
  fertilizerTypeId?: number | null;
}
```

and to `WateringRepository`: `createMany(userId: number, entries: NewWateringEntry[], date: number): Promise<number[] | null>;` and `deleteMany(userId: number, ids: number[]): Promise<boolean>;`

In `SQLiteWateringRepository` (uses the `getKysely()` singleton like the existing methods):

```ts
async createMany(userId: number, entries: NewWateringEntry[], date: number): Promise<number[] | null> {
  return getKysely().transaction().execute(async (trx) => {
    const plantIds = [...new Set(entries.map((e) => e.plantId))];
    const owned = await trx
      .selectFrom('plants').select('id')
      .where('user_id', '=', userId).where('id', 'in', plantIds)
      .execute();
    if (owned.length !== plantIds.length) return null;
    const ids: number[] = [];
    for (const entry of entries) {
      const result = await trx
        .insertInto('watering_records')
        .values({
          plant_id: entry.plantId,
          date,
          used_fertilizer: entry.usedFertilizer ? 1 : 0,
          fertilizer_type_id: entry.usedFertilizer ? (entry.fertilizerTypeId ?? null) : null,
        })
        .executeTakeFirstOrThrow();
      ids.push(Number(result.insertId));
    }
    return ids;
  });
}

async deleteMany(userId: number, ids: number[]): Promise<boolean> {
  return getKysely().transaction().execute(async (trx) => {
    const owned = await trx
      .selectFrom('watering_records as w').innerJoin('plants as p', 'p.id', 'w.plant_id')
      .select('w.id').where('p.user_id', '=', userId).where('w.id', 'in', ids)
      .execute();
    if (owned.length !== new Set(ids).size) return false;
    await trx.deleteFrom('watering_records').where('id', 'in', ids).execute();
    return true;
  });
}
```

- [ ] **Step 4: Use cases** (in `WateringUseCases.ts`, reusing `parseOrThrow`, `NotFoundError`, `ValidationError` and the module's existing epoch helper used by `CreateWateringRecordUseCase`):

```ts
export const CreateWateringBatchSchema = z.object({
  date: z.union([z.string(), z.number()]).optional(),
  entries: z
    .array(z.object({
      plantId: z.number().int().positive(),
      usedFertilizer: z.boolean().default(false),
      fertilizerTypeId: z.number().int().nullable().optional(),
    }))
    .min(1).max(200)
    .refine((list) => new Set(list.map((e) => e.plantId)).size === list.length, {
      message: 'Each plant may appear only once',
    }),
});

export const DeleteWateringBatchSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
});

export class CreateWateringBatchUseCase {
  constructor(private readonly repo: WateringRepository) {}
  async execute(userId: number, input: unknown): Promise<number[]> {
    const data = parseOrThrow(CreateWateringBatchSchema, input, 'Invalid watering batch');
    const date = data.date === undefined ? Math.floor(Date.now() / 1000) : requireEpochSeconds(data.date);
    const ids = await this.repo.createMany(userId, data.entries, date);
    if (!ids) throw new NotFoundError('Plant');
    return ids;
  }
}

export class DeleteWateringBatchUseCase {
  constructor(private readonly repo: WateringRepository) {}
  async execute(userId: number, input: unknown): Promise<void> {
    const { ids } = parseOrThrow(DeleteWateringBatchSchema, input, 'Invalid watering batch');
    if (!(await this.repo.deleteMany(userId, ids))) throw new NotFoundError('Watering record');
  }
}
```

(If the epoch helper is named differently, use whatever `CreateWateringRecordUseCase` calls.)

- [ ] **Step 5: Controller and routes.** Add `addBatch` and `deleteBatch` to `WateringController` following `addRecord`:

```ts
addBatch: async (req, reply) => {
  const ids = await createBatch.execute(req.user!.id, req.body);
  return reply.code(HTTP_STATUS.CREATED).send({ data: { ids } });
},
deleteBatch: async (req, reply) => {
  await deleteBatch.execute(req.user!.id, req.body);
  return reply.code(HTTP_STATUS.NO_CONTENT).send();
},
```

Register before the parametric routes in `wateringRoutes.ts`:

```ts
app.post('/batch', { onRequest: authenticateToken }, ctrl.addBatch);
app.post('/batch/delete', { onRequest: authenticateToken }, ctrl.deleteBatch);
```

(Use the existing `HTTP_STATUS` member for 204; check its name in `core/config`.)

- [ ] **Step 6: Run tests, expect PASS;** then `pnpm run lint && pnpm run typecheck`.
- [ ] **Step 7: Document both endpoints in `backend/docs/api-reference.md`, commit** `feat(watering): batch create and delete endpoints`.

---

### Task 2: Recognition core: ports, ranking, storage, pixel embedder (wave A)

**Files:**
- Create: `backend/src/modules/recognition/domain/Recognition.ts`
- Create: `backend/src/modules/recognition/application/rankPlants.ts`
- Create: `backend/src/modules/recognition/infrastructure/SQLiteEmbeddingRepository.ts`
- Create: `backend/src/modules/recognition/infrastructure/PixelEmbedder.ts`
- Create: `backend/src/core/database/migrations/0005_image_embeddings.ts`
- Modify: `backend/src/core/database/migrations/index.ts`, `backend/src/core/database/schema.ts`, `backend/tests/integration/migrations.test.ts` (expected list)
- Test: `backend/tests/unit/modules/recognitionRanking.test.ts`, `backend/tests/integration/embeddingRepository.test.ts`

**Interfaces (produced, used by T3, T4, T5):**

```ts
// domain/Recognition.ts
export interface Embedder {
  readonly modelId: string;
  /** Best-candidate score at or above which the match counts as confident. */
  readonly confidentScore: number;
  embed(image: Buffer): Promise<Float32Array>;
}
export interface PlantVector { plantId: number; imageId: number; vector: Float32Array }
export interface PlantMatch { plantId: number; score: number }
export interface MissingImage { imageId: number; imageUrl: string }
export interface EmbeddingRepository {
  save(imageId: number, model: string, vector: Float32Array): Promise<void>;
  vectorsForUser(userId: number, model: string): Promise<PlantVector[]>;
  plantImagesMissing(model: string): Promise<MissingImage[]>;
  purgeOrphans(): Promise<void>;
}
```

- [ ] **Step 1: Failing unit test for ranking**

```ts
import { describe, expect, it } from 'vitest';
import { l2normalize, rankPlants } from '../../../src/modules/recognition/application/rankPlants';

const v = (...xs: number[]) => l2normalize(Float32Array.from(xs));

describe('rankPlants', () => {
  it('keeps the best score per plant and sorts descending', () => {
    const ranked = rankPlants(v(1, 0, 0), [
      { plantId: 1, imageId: 10, vector: v(0, 1, 0) },
      { plantId: 1, imageId: 11, vector: v(1, 0.1, 0) },
      { plantId: 2, imageId: 20, vector: v(1, 1, 0) },
    ]);
    expect(ranked.map((m) => m.plantId)).toEqual([1, 2]);
    expect(ranked[0].score).toBeGreaterThan(0.99);
  });
  it('limits the result and skips vectors of another dimension', () => {
    const vectors = Array.from({ length: 8 }, (_, i) => ({ plantId: i, imageId: i, vector: v(1, i, 0) }));
    vectors.push({ plantId: 99, imageId: 99, vector: v(1, 0) });
    const ranked = rankPlants(v(1, 0, 0), vectors, 5);
    expect(ranked).toHaveLength(5);
    expect(ranked.some((m) => m.plantId === 99)).toBe(false);
  });
  it('returns nothing without vectors', () => {
    expect(rankPlants(v(1, 0, 0), [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`pnpm exec vitest run tests/unit/modules/recognitionRanking.test.ts`).
- [ ] **Step 3: Implement `rankPlants.ts`**

```ts
import type { PlantMatch, PlantVector } from '../domain/Recognition';

export const l2normalize = (vector: Float32Array): Float32Array => {
  let sum = 0;
  for (const x of vector) sum += x * x;
  const norm = Math.sqrt(sum) || 1;
  return vector.map((x) => x / norm);
};

const dot = (a: Float32Array, b: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

export const rankPlants = (query: Float32Array, vectors: PlantVector[], limit = 5): PlantMatch[] => {
  const best = new Map<number, number>();
  for (const { plantId, vector } of vectors) {
    if (vector.length !== query.length) continue;
    const score = dot(query, vector);
    if (score > (best.get(plantId) ?? -Infinity)) best.set(plantId, score);
  }
  return [...best]
    .map(([plantId, score]) => ({ plantId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Migration, schema, registry**

`0005_image_embeddings.ts`:

```ts
/** One embedding vector (Float32 little-endian BLOB) per plant image and model. */

import { sql, type Kysely } from 'kysely';

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await sql`CREATE TABLE image_embeddings (
    image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    vector BLOB NOT NULL
  )`.execute(db);
};
```

Register `'0005_image_embeddings': imageEmbeddings` in `migrations/index.ts`, add `image_embeddings: { image_id: number; model: string; vector: Buffer }` to `Database` in `schema.ts`, append `'0005_image_embeddings'` to the expected list in `tests/integration/migrations.test.ts`.

- [ ] **Step 6: Failing repository integration test** (uses the contract harness to get an initialised temp DB):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContractApp, type ContractApp } from '../contract/harness';
import { createPlant, createSubstrate } from '../contract/support';
import { SQLiteEmbeddingRepository } from '../../src/modules/recognition/infrastructure/SQLiteEmbeddingRepository';

let app: ContractApp;
beforeAll(async () => { app = await createContractApp(); });
afterAll(() => app.close());

const plantWithImage = async () => {
  const owner = await app.signIn('user');
  const substrate = await createSubstrate(app, owner.auth);
  const plant = await createPlant(app, owner.auth, substrate.substrate_id);
  const { insertId } = await app.db.execute(
    "INSERT INTO images (image_url, entity_type, entity_id, upload_date) VALUES (?, 'plant', ?, 0)",
    [`/uploads/plant/${plant.plant_id}.webp`, plant.plant_id],
  );
  return { owner, plant, imageId: Number(insertId) };
};

describe('SQLiteEmbeddingRepository', () => {
  const repo = new SQLiteEmbeddingRepository();

  it('round-trips vectors and scopes them to the owner and model', async () => {
    const mine = await plantWithImage();
    const theirs = await plantWithImage();
    await repo.save(mine.imageId, 'm1', Float32Array.from([0.6, 0.8]));
    await repo.save(theirs.imageId, 'm1', Float32Array.from([1, 0]));
    const vectors = await repo.vectorsForUser(mine.owner.user.id, 'm1');
    expect(vectors).toHaveLength(1);
    expect(vectors[0].plantId).toBe(mine.plant.plant_id);
    expect(Array.from(vectors[0].vector)).toEqual([expect.closeTo(0.6), expect.closeTo(0.8)]);
    expect(await repo.vectorsForUser(mine.owner.user.id, 'm2')).toEqual([]);
  });

  it('lists images missing a vector for the model and upserts on model change', async () => {
    const { imageId } = await plantWithImage();
    expect((await repo.plantImagesMissing('m1')).map((m) => m.imageId)).toContain(imageId);
    await repo.save(imageId, 'm1', Float32Array.from([1]));
    expect((await repo.plantImagesMissing('m1')).map((m) => m.imageId)).not.toContain(imageId);
    await repo.save(imageId, 'm2', Float32Array.from([1]));
    expect((await repo.plantImagesMissing('m1')).map((m) => m.imageId)).toContain(imageId);
  });

  it('purges vectors whose image is gone', async () => {
    const { imageId } = await plantWithImage();
    await repo.save(imageId, 'm1', Float32Array.from([1]));
    await app.db.execute('DELETE FROM images WHERE id = ?', [imageId]);
    await repo.purgeOrphans();
    const rows = await app.db.query<{ n: number }>('SELECT COUNT(*) AS n FROM image_embeddings WHERE image_id = ?', [imageId]);
    expect(rows[0].n).toBe(0);
  });
});
```

(Adjust `owner.user.id` and `plant.plant_id` to the actual field names returned by `signIn` and `createPlant` in the harness.)

- [ ] **Step 7: Run, expect FAIL; implement `SQLiteEmbeddingRepository`:**

```ts
import { getKysely } from '../../../core/database/db';
import type { EmbeddingRepository, MissingImage, PlantVector } from '../domain/Recognition';

const toBlob = (v: Float32Array): Buffer => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const fromBlob = (b: Buffer): Float32Array =>
  new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

export class SQLiteEmbeddingRepository implements EmbeddingRepository {
  async save(imageId: number, model: string, vector: Float32Array): Promise<void> {
    const blob = toBlob(vector);
    await getKysely()
      .insertInto('image_embeddings')
      .values({ image_id: imageId, model, vector: blob })
      .onConflict((oc) => oc.column('image_id').doUpdateSet({ model, vector: blob }))
      .execute();
  }

  async vectorsForUser(userId: number, model: string): Promise<PlantVector[]> {
    const rows = await getKysely()
      .selectFrom('image_embeddings as e')
      .innerJoin('images as i', 'i.id', 'e.image_id')
      .innerJoin('plants as p', 'p.id', 'i.entity_id')
      .where('i.entity_type', '=', 'plant')
      .where('p.user_id', '=', userId)
      .where('e.model', '=', model)
      .select(['p.id as plantId', 'e.image_id as imageId', 'e.vector'])
      .execute();
    return rows.map((r) => ({ plantId: r.plantId, imageId: r.imageId, vector: fromBlob(r.vector) }));
  }

  async plantImagesMissing(model: string): Promise<MissingImage[]> {
    const rows = await getKysely()
      .selectFrom('images as i')
      .leftJoin('image_embeddings as e', (join) =>
        join.onRef('e.image_id', '=', 'i.id').on('e.model', '=', model),
      )
      .where('i.entity_type', '=', 'plant')
      .where('e.image_id', 'is', null)
      .select(['i.id as imageId', 'i.image_url as imageUrl'])
      .execute();
    return rows;
  }

  async purgeOrphans(): Promise<void> {
    await getKysely()
      .deleteFrom('image_embeddings')
      .where('image_id', 'not in', (qb) => qb.selectFrom('images').select('id'))
      .execute();
  }
}
```

(Import `getKysely` from wherever other repositories import it.)

- [ ] **Step 8: `PixelEmbedder.ts`** (model-free embedder for dev and tests):

```ts
import sharp from 'sharp';
import type { Embedder } from '../domain/Recognition';
import { l2normalize } from '../application/rankPlants';

export const createPixelEmbedder = (): Embedder => ({
  modelId: 'pixel-16',
  confidentScore: 0.97,
  async embed(image: Buffer): Promise<Float32Array> {
    const raw = await sharp(image).rotate().removeAlpha().resize(16, 16, { fit: 'fill' }).raw().toBuffer();
    return l2normalize(Float32Array.from(raw, (byte) => byte / 255));
  },
});
```

Add a unit test: two solid images of different hue embed to a cosine below 0.9; the same image embeds to cosine 1.

- [ ] **Step 9: Run all backend tests, lint, typecheck; commit** `feat(recognition): embedding storage, ranking and pixel embedder`.

---

### Task 3: ONNX embedder, config and model delivery (wave A)

**Files:**
- Create: `backend/src/modules/recognition/infrastructure/OnnxEmbedder.ts`
- Create: `backend/scripts/fetch-model.mjs`
- Modify: `backend/package.json` (dependency `onnxruntime-node@1.30.0`, script `model:fetch`; add it to `pnpm.onlyBuiltDependencies` if that list exists), `pnpm-lock.yaml`
- Modify: `backend/src/core/config/env.ts`, `backend/.env.example`, `.env.docker.example`, `docker-compose.yml`, `backend/Dockerfile`, `.gitignore` (`backend/models/`)
- Test: `backend/tests/integration/onnxEmbedder.test.ts`

**Interfaces:**
- Consumes: `Embedder`, `l2normalize` (Task 2; until merged, the implementer copies the `Embedder` interface verbatim from the Task 2 block).
- Produces: `loadOnnxEmbedder(modelPath: string | null, warn: (message: string) => void): Promise<Embedder | null>`; `getConfig().recognitionModelPath: string | null`.

- [ ] **Step 1: Config.** In `AppConfig` add `recognitionModelPath: string | null;`, in `loadConfig` add `recognitionModelPath: env.RECOGNITION_MODEL_PATH || null,`. Append to `backend/.env.example`:

```
# Path to the plant recognition ONNX model (empty = recognition disabled; pnpm run model:fetch downloads it to ./models)
RECOGNITION_MODEL_PATH=
```

Docker compose backend env: `RECOGNITION_MODEL_PATH: ${RECOGNITION_MODEL_PATH:-/app/models/dinov2-small-q8.onnx}`; mirror the key in `.env.docker.example`.

- [ ] **Step 2: `scripts/fetch-model.mjs`** downloads the model URL from Global Constraints to `backend/models/dinov2-small-q8.onnx` with `fetch` + `fs.writeFile`, verifies the byte size equals 24,446,700 and prints the sha256 (`crypto.createHash('sha256')`). Add `"model:fetch": "node scripts/fetch-model.mjs"`. Run it once and record the printed sha256 for Step 5.
- [ ] **Step 3: Failing integration test (skipped when the model is absent):**

```ts
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { loadOnnxEmbedder } from '../../src/modules/recognition/infrastructure/OnnxEmbedder';

const modelPath = process.env.RECOGNITION_MODEL_PATH ?? 'models/dinov2-small-q8.onnx';
const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);
const picture = (seed: number) =>
  sharp(Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => (i * seed) % 251)), {
    raw: { width: 64, height: 64, channels: 3 },
  }).resize(640, 480).jpeg().toBuffer();

describe.skipIf(!existsSync(modelPath))('OnnxEmbedder', () => {
  it('produces normalised 384-d vectors that are stable under small crops', async () => {
    const embedder = await loadOnnxEmbedder(modelPath, () => {});
    expect(embedder).not.toBeNull();
    const base = await picture(7);
    const cropped = await sharp(base).extract({ left: 20, top: 15, width: 600, height: 450 }).toBuffer();
    const other = await picture(13);
    const [a, b, c] = await Promise.all([base, cropped, other].map((img) => embedder!.embed(img)));
    expect(a).toHaveLength(384);
    expect(dot(a, a)).toBeCloseTo(1, 3);
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
  });

  it('returns null for a missing model file', async () => {
    expect(await loadOnnxEmbedder('models/missing.onnx', () => {})).toBeNull();
    expect(await loadOnnxEmbedder(null, () => {})).toBeNull();
  });
});
```

- [ ] **Step 4: Implement `OnnxEmbedder.ts`:**

```ts
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import type { Embedder } from '../domain/Recognition';
import { l2normalize } from '../application/rankPlants';

const RESIZE = 256;
const CROP = 224;
const DIM = 384;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

const toTensorData = async (image: Buffer): Promise<Float32Array> => {
  const { data: resized, info } = await sharp(image)
    .rotate()
    .removeAlpha()
    .resize({ width: RESIZE, height: RESIZE, fit: 'outside', kernel: 'cubic' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = await sharp(resized, { raw: { width: info.width, height: info.height, channels: 3 } })
    .extract({
      left: Math.floor((info.width - CROP) / 2),
      top: Math.floor((info.height - CROP) / 2),
      width: CROP,
      height: CROP,
    })
    .raw()
    .toBuffer();
  const plane = CROP * CROP;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = (pixels[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  }
  return out;
};

class OnnxEmbedder implements Embedder {
  readonly modelId = 'dinov2-small-q8';
  readonly confidentScore = 0.6;
  /** Inference runs one at a time so a burst of uploads cannot starve the Pi. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly session: ort.InferenceSession) {}

  embed(image: Buffer): Promise<Float32Array> {
    const run = this.tail.then(async () => {
      const input = new ort.Tensor('float32', await toTensorData(image), [1, 3, CROP, CROP]);
      const output = await this.session.run({ pixel_values: input });
      const hidden = output.last_hidden_state.data as Float32Array;
      return l2normalize(Float32Array.from(hidden.subarray(0, DIM)));
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
}

export const loadOnnxEmbedder = async (
  modelPath: string | null,
  warn: (message: string) => void,
): Promise<Embedder | null> => {
  if (!modelPath) return null;
  try {
    return new OnnxEmbedder(await ort.InferenceSession.create(modelPath));
  } catch (error) {
    warn(`Plant recognition disabled: could not load ${modelPath} (${(error as Error).message})`);
    return null;
  }
};
```

- [ ] **Step 5: Docker.** Add the model to the runtime stage (BuildKit `ADD --checksum`; add `# syntax=docker/dockerfile:1.7` as the first line if the Dockerfile has no syntax directive):

```dockerfile
ADD --checksum=sha256:<hash printed by pnpm run model:fetch> \
  https://huggingface.co/onnx-community/dinov2-small/resolve/main/onnx/model_quantized.onnx \
  /app/models/dinov2-small-q8.onnx
ENV RECOGNITION_MODEL_PATH=/app/models/dinov2-small-q8.onnx
```

Place it before `USER node` and make sure the file is readable by `node` (`RUN chmod 644 /app/models/dinov2-small-q8.onnx`).

- [ ] **Step 6:** `pnpm run model:fetch`, then run the test with the model present (expect PASS) and without (`RECOGNITION_MODEL_PATH=models/none.onnx`, expect skipped). Run lint, typecheck, build. If a container runtime is available, `docker build -f backend/Dockerfile backend` to prove the checksum.
- [ ] **Step 7: Update `backend/docs/deployment.md` (model baked into image, env var, disabling) and commit** `feat(recognition): onnx dinov2 embedder and model delivery`.

---

### Task 4: Recognition API, snapshots and images hook (wave B)

**Files:**
- Create: `backend/src/modules/recognition/infrastructure/TempSnapshotStore.ts`
- Create: `backend/src/modules/recognition/application/MatchSnapshot.ts`, `ConfirmSnapshot.ts`, `EmbedImages.ts`
- Create: `backend/src/modules/recognition/presentation/recognitionRoutes.ts`, `recognitionController.ts`
- Create: `backend/src/modules/recognition/index.ts`
- Modify: `backend/src/core/errors/AppError.ts` (`ServiceUnavailableError`, 503, same shape as the other subclasses), its barrel export
- Modify: `backend/src/modules/images/application/ImageUseCases.ts`, `presentation/imageController.ts`, `presentation/imageRoutes.ts` (factory with deps)
- Modify: `backend/src/app.ts` (`AppDeps.recognition`, wiring)
- Test: `backend/tests/unit/modules/tempSnapshotStore.test.ts`, `backend/tests/unit/modules/embedImages.test.ts`, `backend/tests/contract/recognition.contract.test.ts`

**Interfaces:**
- Consumes: Task 2 ports and `rankPlants`, `createPixelEmbedder`; Task 3 `loadOnnxEmbedder`, `getConfig().recognitionModelPath`; existing `CreateWateringRecordUseCase`, `SQLiteWateringRepository`, `SQLiteImageRepository.create`, `readUpload`, `translateUploadError`, `MAX_UPLOAD_BYTES`, `toStoredImagePath`, `getUploadsDirectory`, `authenticateToken`.
- Produces:

```ts
// index.ts
export interface RecognitionDeps { embedder?: Embedder | null }
export interface Recognition {
  readonly embedder: Embedder | null;
  onImageStored(event: StoredImageEvent): void;
}
export const createRecognition: (deps: RecognitionDeps, log: FastifyBaseLogger) => Promise<Recognition>;
export const recognitionRoutes: (recognition: Recognition) => FastifyPluginAsync;
// images module
export interface StoredImageEvent { imageId: number; entityType: EntityType; imageUrl: string }
export interface ImageRouterDeps { onImageStored?: (event: StoredImageEvent) => void }
export const imageRoutes: (deps?: ImageRouterDeps) => FastifyPluginAsync;
```

- [ ] **Step 1: Failing unit test for `TempSnapshotStore`** (injected clock and a temp dir):

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TempSnapshotStore } from '../../../src/modules/recognition/infrastructure/TempSnapshotStore';

const make = async () => {
  let now = 1_000;
  const dir = await mkdtemp(path.join(tmpdir(), 'snap-'));
  const store = new TempSnapshotStore(dir, 600_000, () => now);
  await store.init();
  return { store, advance: (ms: number) => { now += ms; } };
};

describe('TempSnapshotStore', () => {
  it('hands a snapshot out once, only to its owner', async () => {
    const { store } = await make();
    const id = await store.put(1, Buffer.from('x'), Float32Array.from([1]));
    expect(store.take(id, 2)).toBeNull();
    const snap = store.take(id, 1);
    expect(snap?.vector[0]).toBe(1);
    expect(store.take(id, 1)).toBeNull();
    store.stop();
  });
  it('expires after the ttl and sweeps the file', async () => {
    const { store, advance } = await make();
    const id = await store.put(1, Buffer.from('x'), Float32Array.from([1]));
    const file = store.peekPath(id)!;
    advance(600_001);
    expect(store.take(id, 1)).toBeNull();
    await store.sweep();
    expect(existsSync(file)).toBe(false);
    store.stop();
  });
});
```

- [ ] **Step 2: Implement `TempSnapshotStore`:**

```ts
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface PendingSnapshot { userId: number; path: string; vector: Float32Array; expiresAt: number }

export class TempSnapshotStore {
  private readonly items = new Map<string, PendingSnapshot>();
  private sweeper?: NodeJS.Timeout;

  constructor(
    private readonly dir: string,
    private readonly ttlMs = 10 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async init(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true });
    await mkdir(this.dir, { recursive: true });
    this.sweeper = setInterval(() => void this.sweep(), 60_000);
    this.sweeper.unref();
  }

  async put(userId: number, webp: Buffer, vector: Float32Array): Promise<string> {
    const id = randomUUID();
    const file = path.join(this.dir, `${id}.webp`);
    await writeFile(file, webp);
    this.items.set(id, { userId, path: file, vector, expiresAt: this.now() + this.ttlMs });
    return id;
  }

  peekPath(id: string): string | undefined {
    return this.items.get(id)?.path;
  }

  take(id: string, userId: number): PendingSnapshot | null {
    const snap = this.items.get(id);
    if (!snap || snap.userId !== userId || snap.expiresAt <= this.now()) return null;
    this.items.delete(id);
    return snap;
  }

  async sweep(): Promise<void> {
    const now = this.now();
    for (const [id, snap] of this.items) {
      if (snap.expiresAt > now) continue;
      this.items.delete(id);
      await rm(snap.path, { force: true });
    }
  }

  stop(): void {
    clearInterval(this.sweeper);
  }
}
```

Snapshots live in `path.join(os.tmpdir(), 'plantcare-snapshots')`, outside the statically served uploads folder; confirm copies the file (`copyFile`) so it works across filesystems.

- [ ] **Step 3: Use cases.**

`MatchSnapshot.ts`:

```ts
export interface MatchResult { snapshotId: string; threshold: number; candidates: PlantMatch[] }

export class MatchSnapshotUseCase {
  constructor(
    private readonly embedder: Embedder,
    private readonly embeddings: EmbeddingRepository,
    private readonly snapshots: TempSnapshotStore,
  ) {}

  async execute(userId: number, file: UploadedFile): Promise<MatchResult> {
    let webp: Buffer;
    try {
      webp = await sharp(file.buffer).rotate().resize({ width: 1024, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
    } catch {
      throw new ValidationError('Unreadable image', { image: 'Unreadable image' });
    }
    const vector = await this.embedder.embed(webp);
    const candidates = rankPlants(vector, await this.embeddings.vectorsForUser(userId, this.embedder.modelId));
    const snapshotId = await this.snapshots.put(userId, webp, vector);
    return { snapshotId, threshold: this.embedder.confidentScore, candidates };
  }
}
```

`ConfirmSnapshot.ts`:

```ts
const ConfirmSchema = z.object({
  plantId: z.number().int().positive(),
  usedFertilizer: z.boolean().default(false),
  fertilizerTypeId: z.number().int().nullable().optional(),
  keepPhoto: z.boolean().default(true),
});

export class ConfirmSnapshotUseCase {
  constructor(
    private readonly createWatering: CreateWateringRecordUseCase,
    private readonly images: ImageRepository,
    private readonly embeddings: EmbeddingRepository,
    private readonly snapshots: TempSnapshotStore,
    private readonly modelId: string,
    private readonly uploadsDir: string,
  ) {}

  async execute(userId: number, snapshotId: string, input: unknown): Promise<{ recordId: number; imageId: number | null }> {
    const data = parseOrThrow(ConfirmSchema, input, 'Invalid confirmation');
    const snap = this.snapshots.take(snapshotId, userId);
    if (!snap) throw new NotFoundError('Snapshot');
    try {
      const record = await this.createWatering.execute(data.plantId, userId, {
        usedFertilizer: data.usedFertilizer,
        fertilizerTypeId: data.fertilizerTypeId,
      });
      if (!data.keepPhoto) return { recordId: record.record_id, imageId: null };
      const filename = `${Date.now()}-snapshot.webp`;
      await mkdir(path.join(this.uploadsDir, 'plant'), { recursive: true });
      await copyFile(snap.path, path.join(this.uploadsDir, 'plant', filename));
      const imageId = await this.images.create('plant', data.plantId, toStoredImagePath('plant', filename), Math.floor(Date.now() / 1000));
      await this.embeddings.save(imageId, this.modelId, snap.vector);
      return { recordId: record.record_id, imageId };
    } finally {
      await rm(snap.path, { force: true });
    }
  }
}
```

`EmbedImages.ts`:

```ts
export class EmbedImagesService {
  constructor(
    private readonly embedder: Embedder,
    private readonly embeddings: EmbeddingRepository,
    private readonly uploadsDir: string,
    private readonly log: Pick<FastifyBaseLogger, 'warn' | 'info'>,
  ) {}

  async embedStored(imageId: number, imageUrl: string): Promise<boolean> {
    try {
      const buffer = await readFile(path.join(this.uploadsDir, 'plant', path.basename(imageUrl)));
      await this.embeddings.save(imageId, this.embedder.modelId, await this.embedder.embed(buffer));
      return true;
    } catch (err) {
      this.log.warn({ err, imageId }, 'plant image embedding failed');
      return false;
    }
  }

  async backfill(): Promise<number> {
    await this.embeddings.purgeOrphans();
    let embedded = 0;
    for (const { imageId, imageUrl } of await this.embeddings.plantImagesMissing(this.embedder.modelId)) {
      if (await this.embedStored(imageId, imageUrl)) embedded++;
    }
    if (embedded > 0) this.log.info({ embedded }, 'plant image embeddings backfilled');
    return embedded;
  }
}
```

Unit-test `EmbedImagesService` with an in-memory fake repository: backfill embeds only missing images, a missing file is logged and skipped without looping, and orphans are purged first.

- [ ] **Step 4: Images hook.** `UploadImageUseCase` gets an optional last constructor parameter `onStored?: (event: StoredImageEvent) => void`; after `repo.create` returns `imageId`, call `this.onStored?.({ imageId, entityType: input.entityType, imageUrl: stored })`. The image update use case calls the same hook when a new file replaces an image. `createImageController(repo, storage, access, onStored?)` passes it through; `imageRoutes` becomes `export const imageRoutes = (deps: ImageRouterDeps = {}): FastifyPluginAsync => async (app) => { ... }`. Existing image contract tests must stay green unchanged.
- [ ] **Step 5: `index.ts` composition:**

```ts
export const createRecognition = async (deps: RecognitionDeps, log: FastifyBaseLogger): Promise<RecognitionContext> => {
  const embedder =
    deps.embedder !== undefined
      ? deps.embedder
      : await loadOnnxEmbedder(getConfig().recognitionModelPath, (m) => log.warn(m));
  const embeddings = new SQLiteEmbeddingRepository();
  const embedImages = embedder ? new EmbedImagesService(embedder, embeddings, getUploadsDirectory(), log) : null;
  return {
    embedder,
    embeddings,
    embedImages,
    onImageStored: (event) => {
      if (embedImages && event.entityType === 'plant') void embedImages.embedStored(event.imageId, event.imageUrl);
    },
  };
};
```

(`RecognitionContext` extends `Recognition` with `embeddings` and `embedImages` for the routes.)

- [ ] **Step 6: Routes.** `recognitionRoutes(ctx)` registers `@fastify/multipart` exactly like `imageRoutes` (same limits, same `translateUploadError` error handler), creates `TempSnapshotStore(path.join(os.tmpdir(), 'plantcare-snapshots'))`, awaits `init()`, adds `app.addHook('onClose', () => snapshots.stop())` and `app.addHook('onReady', () => { void ctx.embedImages?.backfill(); })`, then:

```ts
app.get('/status', { onRequest: authenticateToken }, async () => ({ data: { available: ctx.embedder !== null } }));
app.post('/match', { onRequest: authenticateToken }, ctrl.match);
app.post('/snapshots/:id/confirm', { onRequest: authenticateToken }, ctrl.confirm);
```

Controller: `match` throws `ServiceUnavailableError('Plant recognition is not available')` when `ctx.embedder` is null, reads the file with `readUpload(req)` (missing file -> `ValidationError` like the images controller), replies 200 `{ data: result }`; `confirm` replies 201 `{ data }`. Guests are already blocked by `makeGuestReadOnly(V)`.

- [ ] **Step 7: Wire `app.ts`:**

```ts
export type AppDeps = { sales?: SalesRouterDeps; moreInfo?: MoreInfoRouterDeps; recognition?: RecognitionDeps };
// inside buildApp, before route registration:
const recognition = await createRecognition(deps.recognition ?? {}, app.log);
await app.register(imageRoutes({ onImageStored: recognition.onImageStored }), { prefix: `${V}/images` });
await app.register(recognitionRoutes(recognition), { prefix: `${V}/recognition` });
```

The contract harness defaults to no model path, so existing tests get `embedder: null` and are unaffected.

- [ ] **Step 8: Contract tests** `tests/contract/recognition.contract.test.ts` with `createContractApp({ recognition: { embedder: createPixelEmbedder() } })` and a second app with `{ recognition: { embedder: null } }`. Helpers:

```ts
const solid = (r: number, g: number, b: number) =>
  sharp({ create: { width: 64, height: 64, channels: 3, background: { r, g, b } } }).png().toBuffer();
const upload = (auth, plantId: number, data: Buffer) =>
  app.client.request({ method: 'post', url: `${API}/images/plant/${plantId}`, headers: auth,
    multipart: [{ field: 'image', filename: 'p.png', contentType: 'image/png', data }] });
const match = (auth, data: Buffer, contentType = 'image/png') =>
  app.client.request({ method: 'post', url: `${API}/recognition/match`, headers: auth,
    multipart: [{ field: 'image', filename: 'snap', contentType, data }] });
const waitForEmbeddings = async (count: number) => {
  for (let i = 0; i < 50; i++) {
    const [{ n }] = await app.db.query<{ n: number }>('SELECT COUNT(*) AS n FROM image_embeddings', []);
    if (n >= count) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('embeddings not written');
};
```

Cases (each a separate `it`):
1. red photo on plant A, blue on plant B; match with a red snapshot -> 200, `candidates[0].plantId === A`, `snapshotId` string, `threshold` 0.97.
2. another user's red plant never appears in candidates.
3. user without photos -> `candidates: []` and a `snapshotId`.
4. confirm `keepPhoto: true` -> 201; `GET /watering/plant/A` has 1 record; plant A has one more image; an `image_embeddings` row exists for the returned `imageId`.
5. confirm `keepPhoto: false` -> `imageId: null`, image count unchanged.
6. confirm the same snapshot twice -> second is 404 and only one record exists.
7. confirm another user's snapshot -> 404; confirm with a foreign `plantId` -> 404 and no record.
8. EXIF-rotated JPEG (`sharp(...).jpeg().withMetadata({ orientation: 6 })`) -> 200; a buffer over `MAX_UPLOAD_BYTES` -> 413 in the standard error envelope.
9. guest -> 403; no auth -> 401.
10. app with `embedder: null`: status `{ available: false }`, match 503.

- [ ] **Step 9: Run all backend gates; document the three endpoints in `backend/docs/api-reference.md` and the table in `backend/docs/database.md`; commit** `feat(recognition): snap matching, confirm and photo embedding hook`.

---

### Task 5: Dev server, seed and docs (wave C)

**Files:**
- Modify: `backend/src/tools/devMocks.ts`, `backend/src/tools/devServer.ts`
- Modify: `scripts/dev/seed/steps/06-images.mjs` (export the photo plan), `scripts/dev/seed/index.mjs`
- Create: `scripts/dev/seed/steps/09-recognition.mjs`
- Modify: `scripts/dev-up.mjs` (pass `RECOGNITION_MODEL_PATH` through explicitly), `.gitignore` (`scripts/dev/.snapshots/`), `CLAUDE.md` seed table

- [ ] **Step 1:** `devMocks.ts`: `export const createMockRecognition = (): RecognitionDeps => (process.env.RECOGNITION_MODEL_PATH ? {} : { embedder: createPixelEmbedder() });` and pass `recognition: createMockRecognition()` to `buildApp` in `devServer.ts`. With a model path set the dev stack uses the real model.
- [ ] **Step 2:** In `06-images.mjs` export `PLANT_PHOTOS` and a helper `photoVariant(plantName, index)` that reproduces the variant numbering the step already uses (iteration order of `PLANT_PHOTOS`, incrementing per photo).
- [ ] **Step 3:** `09-recognition.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PALETTE, gradientPng } from "../png.mjs";
import { PLANT_PHOTOS, photoVariant } from "./06-images.mjs";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.snapshots");

export default {
  name: "recognition",
  async run(ctx) {
    const token = ctx.token("grower");
    const status = await ctx.call("GET", "/recognition/status", { token });
    if (!status.available) return ctx.log("recognition unavailable, skipping snapshot fixtures");
    await mkdir(OUT, { recursive: true });
    for (const name of Object.keys(PLANT_PHOTOS)) {
      const variant = photoVariant(name, 0);
      const [top, bottom] = PALETTE[variant % PALETTE.length];
      await writeFile(path.join(OUT, `${name}.png`), gradientPng(640, 480, top, bottom, variant));
    }
    const form = new FormData();
    const monty = await import("node:fs/promises").then((fs) => fs.readFile(path.join(OUT, "Monty.png")));
    form.append("image", new Blob([monty], { type: "image/png" }), "Monty.png");
    for (let attempt = 0; attempt < 50; attempt++) {
      const result = await ctx.call("POST", "/recognition/match", { token, form });
      if (result.candidates[0]?.plantId === ctx.state.plants.Monty.id) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Monty snapshot does not match Monty");
  },
};
```

(Adjust for `ctx.call` unwrapping `data`, as other steps assume. The retry loop waits for the fire-and-forget embeddings.)

- [ ] **Step 4:** Add to the `CLAUDE.md` seed table: `| Snap to log | /tabs/water as grower: upload scripts/dev/.snapshots/Monty.png (Monty first); Unknown Orchid has no photo, use "Other plant..."; set RECOGNITION_MODEL_PATH before dev-up to use the real model |` and a `| Watering round | /tabs/water: due and overdue plants pre-ticked (Failing Fern, Spike, Sunny Pothos, the long named plant) |` row.
- [ ] **Step 5:** `node scripts/dev-up.mjs --id seedcheck` must finish seeding without errors; then `node scripts/dev-down.mjs --id seedcheck`. Commit `chore(dev): recognition mock, snapshot fixtures and seed docs`.

---

### Task 6: Frontend watering round (wave A)

**Files:**
- Create: `frontend/src/types/recognitionTypes.d.ts` (ambient, includes batch types)
- Create: `frontend/src/utils/waterRound.ts`
- Create: `frontend/src/views/water/WaterRound.vue`, `frontend/src/components/water/RoundList.vue`
- Modify: `frontend/src/stores/watering.ts` (`addBatch`, `removeBatch`)
- Modify: `frontend/src/router/index.ts`, `frontend/src/theme/icons.ts`, `frontend/src/components/SideMenu.vue`, `frontend/src/views/TabsPage.vue`
- Modify: `frontend/public/favicons/manifest.json`, `frontend/src/locales/en.ts`, `de.ts`
- Test: `frontend/src/tests/waterRound.test.ts`, `frontend/src/tests/waterRoundView.test.ts`

**Interfaces:**

```ts
// recognitionTypes.d.ts (ambient, no imports)
interface WateringBatchEntry { plantId: number; usedFertilizer: boolean; fertilizerTypeId?: number | null }
interface RecognitionCandidate { plantId: number; score: number }
interface MatchResult { snapshotId: string; threshold: number; candidates: RecognitionCandidate[] }
interface ConfirmSnapshot { plantId: number; usedFertilizer?: boolean; fertilizerTypeId?: number | null; keepPhoto?: boolean }
interface ConfirmResult { recordId: number; imageId: number | null }

// utils/waterRound.ts
export interface RoundRow {
  plantId: number; name: string; imageUrl?: string; tone: WateringTone; rank: number;
  checked: boolean;
  /** undefined follows the round's fertilizer, null means none for this plant */
  fertilizerTypeId: number | null | undefined;
}
export function buildRoundRows(plants: Plant[], recordsFor: (id: number) => WateringRecord[], now?: number): RoundRow[];
export function buildBatchEntries(rows: RoundRow[], roundFertilizer: number | null): WateringBatchEntry[];
export function rerankCandidates(c: RecognitionCandidate[], toneOf: (plantId: number) => WateringTone | undefined, limit?: number): RecognitionCandidate[];
// watering store
addBatch(entries: WateringBatchEntry[]): Promise<number[]>;
removeBatch(recordIds: number[], plantIds: number[]): Promise<void>;
```

- [ ] **Step 1: Failing unit tests for `waterRound.ts`:**

```ts
import { describe, expect, it } from "vitest";
import { buildBatchEntries, buildRoundRows, rerankCandidates, type RoundRow } from "@/utils/waterRound";

const DAY = 86_400_000;
const now = 100 * DAY;
const plant = (id: number, name: string) => ({ id, name, images: [] }) as unknown as Plant;
const rec = (daysAgo: number) => ({ date_millis: now - daysAgo * DAY }) as WateringRecord;

describe("buildRoundRows", () => {
  it("puts thirsty plants first and pre-ticks only them", () => {
    const history: Record<number, WateringRecord[]> = { 1: [rec(1), rec(8)], 2: [rec(20), rec(27)], 3: [] };
    const rows = buildRoundRows([plant(1, "Ok"), plant(2, "Thirsty"), plant(3, "Never")], (id) => history[id], now);
    expect(rows[0].name).toBe("Thirsty");
    expect(rows.find((r) => r.name === "Thirsty")!.checked).toBe(true);
    expect(rows.find((r) => r.name === "Ok")!.checked).toBe(false);
  });
});

describe("buildBatchEntries", () => {
  const row = (plantId: number, checked: boolean, fertilizerTypeId: number | null | undefined): RoundRow =>
    ({ plantId, name: "", tone: "ok", rank: 0, checked, fertilizerTypeId });
  it("applies the round fertilizer unless a row overrides it", () => {
    expect(buildBatchEntries([row(1, true, undefined), row(2, true, null), row(3, false, 2), row(4, true, 2)], 1)).toEqual([
      { plantId: 1, usedFertilizer: true, fertilizerTypeId: 1 },
      { plantId: 2, usedFertilizer: false, fertilizerTypeId: null },
      { plantId: 4, usedFertilizer: true, fertilizerTypeId: 2 },
    ]);
  });
});

describe("rerankCandidates", () => {
  it("lets an overdue plant overtake a slightly better ok plant and keeps three", () => {
    const tones: Record<number, WateringTone> = { 1: "ok", 2: "overdue" };
    const out = rerankCandidates(
      [{ plantId: 1, score: 0.82 }, { plantId: 2, score: 0.8 }, { plantId: 3, score: 0.5 }, { plantId: 4, score: 0.4 }],
      (id) => tones[id],
    );
    expect(out.map((c) => c.plantId)).toEqual([2, 1, 3]);
    expect(out[0].score).toBe(0.8);
  });
});
```

(Adjust the "Ok"/"Thirsty" history so `wateringStatus` from `@/utils/wateringStats` classifies them as stated; the expected interval is the average gap.)

- [ ] **Step 2: Run, expect FAIL** (`cd frontend; pnpm exec vitest run src/tests/waterRound.test.ts`).
- [ ] **Step 3: Implement `waterRound.ts`:**

```ts
import { wateringStatus, type WateringTone } from "@/utils/wateringStats";

const TONE_BONUS: Record<WateringTone, number> = { overdue: 0.05, due: 0.03, ok: 0 };

export const buildRoundRows = (plants: Plant[], recordsFor: (id: number) => WateringRecord[], now = Date.now()): RoundRow[] =>
  plants
    .map((plant) => {
      const status = wateringStatus(recordsFor(plant.id) ?? [], now);
      return {
        plantId: plant.id, name: plant.name, imageUrl: plant.imageUrl,
        tone: status.tone, rank: status.rank, checked: status.tone !== "ok", fertilizerTypeId: undefined,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

export const buildBatchEntries = (rows: RoundRow[], roundFertilizer: number | null): WateringBatchEntry[] =>
  rows
    .filter((row) => row.checked)
    .map((row) => {
      const fertilizer = row.fertilizerTypeId === undefined ? roundFertilizer : row.fertilizerTypeId;
      return { plantId: row.plantId, usedFertilizer: fertilizer !== null, fertilizerTypeId: fertilizer };
    });

export const rerankCandidates = (
  candidates: RecognitionCandidate[],
  toneOf: (plantId: number) => WateringTone | undefined,
  limit = 3,
): RecognitionCandidate[] =>
  candidates
    .map((c) => ({ c, adjusted: c.score + TONE_BONUS[toneOf(c.plantId) ?? "ok"] }))
    .sort((a, b) => b.adjusted - a.adjusted)
    .slice(0, limit)
    .map(({ c }) => c);
```

(plus the `RoundRow` interface from the Interfaces block). Run, expect PASS.

- [ ] **Step 4: Store actions** in `watering.ts` (match how `ApiUtils.post` returns the unwrapped `data` for `addRecord`):

```ts
async addBatch(entries: WateringBatchEntry[]): Promise<number[]> {
  const { ids } = await handleRequest(
    ApiUtils.post<{ entries: WateringBatchEntry[] }, { ids: number[] }>(`${BASE_ENDPOINT}/batch`, { entries }),
    RESOURCE_KEY, "watering.add",
  );
  await Promise.all([...new Set(entries.map((e) => e.plantId))].map((id) => this.ensureRecords(id, { force: true })));
  return ids;
},
async removeBatch(recordIds: number[], plantIds: number[]): Promise<void> {
  await handleRequest(ApiUtils.post<{ ids: number[] }, void>(`${BASE_ENDPOINT}/batch/delete`, { ids: recordIds }), RESOURCE_KEY, "watering.delete");
  await Promise.all(plantIds.map((id) => this.ensureRecords(id, { force: true })));
},
```

Add a store test in the style of the existing watering store tests (mock `ApiUtils`, assert the POST path and body, and that records are refetched).

- [ ] **Step 5: View and list.** `RoundList.vue` (Options API) renders rows: checkbox, thumbnail (`imageUrl`), name, tone badge (reuse the badge the plant overview uses for `statusTone`), and an `ion-select interface="popover"` per row with options "round default" (undefined), "none" (null) and each fertilizer type; emits `toggle(plantId)` and `set-fertilizer(plantId, value)`.

`WaterRound.vue` (Options API, `ion-page`):
- `mapState(usePlantsStore, ["personalPlants"])`, `mapState(useWateringStore, ["byPlantId", "fertilizerTypes"])`, `mapActions(useWateringStore, ["addBatch", "removeBatch", "ensureRecordsFor", "ensureFertilizerTypes"])`.
- `created`: `ensureLoaded()` on plants, `ensureFertilizerTypes()`, `ensureRecordsFor(ids)`; `rows` is rebuilt with `buildRoundRows` when plants or records change, keeping user toggles in a `Map<plantId, Partial<RoundRow>>` of overrides.
- Header slot `<div class="snap-slot" />` where Task 7 mounts the snap button.
- `ion-searchbar` filters rows by name; `ion-segment` for the round fertilizer (none + `fertilizerTypes`).
- Footer `ion-button` "Log N waterings" disabled when N is 0 or while saving; on click: `const ids = await this.addBatch(buildBatchEntries(rows, roundFertilizer))`, then `ToastService.showToastWithAction({ key: "water.round_logged", vars: { count } }, this.t("plantdetail.undo"), () => void this.undoRound(ids, plantIds), 6000)`; `undoRound` calls `removeBatch` then `ToastService.showSuccess({ key: "plantdetail.undone" })`.
- Guests: hide the footer and the snap slot (use the guest flag the session store already exposes; find it with `grep -n guest src/stores/session.ts`).

View test (`waterRoundView.test.ts`, `shallowMount` + `createTestingPinia` like `wateringStatusComponent.test.ts`, toast mocked): pre-ticked count renders in the button label; clicking save calls `addBatch` with the built entries; the undo handler passed to `showToastWithAction` calls `removeBatch`; guest hides the footer.

- [ ] **Step 6: Navigation and shortcut.**
  - `icons.ts`: `NavDestination` adds `"water"`; `navIcons.water = { idle: waterOutline, selected: water }` (import from `ionicons/icons`).
  - Router child after `plant-overview`: `{ name: "water-round", path: "water", meta: authMeta, component: WaterRound }` with `const WaterRound = () => import("@/views/water/WaterRound.vue");`.
  - `SideMenu.vue` `destinations()`: insert `{ tab: "water", label: "tabs.water" }` after plants.
  - `TabsPage.vue`: add an `ion-tab-button tab="water" href="/tabs/water"` block after plants, same markup as the plants one.
  - `manifest.json`: `"shortcuts": [{ "name": "Log watering", "short_name": "Water", "url": "/tabs/water", "icons": [{ "src": "<same 192px icon path the manifest already lists>", "sizes": "192x192", "type": "image/png" }] }]`.
- [ ] **Step 7: Locale keys (en and de):** `tabs.water`, `water.title`, `water.search`, `water.round_fertilizer`, `water.fertilizer_none`, `water.fertilizer_round_default`, `water.log_count` (with `{count}`), `water.round_logged` (with `{count}`), `water.empty`. Run `pnpm run check-keys`.
- [ ] **Step 8: Run all frontend gates; commit** `feat(water): watering round view with batch logging`.

---

### Task 7: Frontend snap flow (wave B)

**Files:**
- Create: `frontend/src/services/RecognitionService.ts`
- Create: `frontend/src/stores/snapSettings.ts`
- Create: `frontend/src/components/water/SnapButton.vue`, `SnapMatchSheet.vue`, `PlantPickerModal.vue`
- Modify: `frontend/src/views/water/WaterRound.vue`, `frontend/src/components/SideMenu.vue`, `frontend/src/App.vue`, locale files
- Test: `frontend/src/tests/snapMatchSheet.test.ts`, `frontend/src/tests/waterSnapFlow.test.ts`, `frontend/src/tests/recognitionService.test.ts`

**Interfaces:**
- Consumes: Task 6 types, `rerankCandidates`, view slot; store actions `editRecord`, `deleteRecord`, `ensureRecords`; `usePlantsStore().getPlant(id, true)`; `ImageService` delete method for a single image; `IMAGE_ACCEPT` and validation from `@/utils/imageValidation`.
- Produces: `RecognitionService.status(): Promise<boolean>`, `.match(photo: File): Promise<MatchResult>`, `.confirm(snapshotId: string, body: ConfirmSnapshot): Promise<ConfirmResult>`; `useSnapSettingsStore` with `keepPhoto: boolean` (default true), `ensureLoaded()`, `setKeepPhoto(value: boolean)`.

- [ ] **Step 1: Service test then implementation** (pattern of `ImageService.ts`):

```ts
const BASE_ENDPOINT = "/recognition";
const RESOURCE_KEY = "resource.recognition";

export default {
  async status(): Promise<boolean> {
    try {
      const result = await withoutErrorToasts(() => ApiUtils.get<{ available: boolean }>(`${BASE_ENDPOINT}/status`));
      return result.available;
    } catch {
      return false;
    }
  },
  async match(photo: File): Promise<MatchResult> {
    const form = new FormData();
    form.append("image", photo);
    return handleRequest(ApiUtils.upload<MatchResult>(`${BASE_ENDPOINT}/match`, form), RESOURCE_KEY, "recognition.match");
  },
  async confirm(snapshotId: string, body: ConfirmSnapshot): Promise<ConfirmResult> {
    return handleRequest(
      ApiUtils.post<ConfirmSnapshot, ConfirmResult>(`${BASE_ENDPOINT}/snapshots/${snapshotId}/confirm`, body),
      RESOURCE_KEY, "recognition.confirm",
    );
  },
};
```

(Check `withoutErrorToasts`'s exact signature in `requestFeedback.ts` and match the resource-key naming other services use.)

- [ ] **Step 2: `snapSettings.ts`** cloned from the `layout.ts` pattern: state `{ keepPhoto: true, loaded: false }`, `PersistEntry` key `snap_keep_photo`, `keepOnClear: true`, `allowExpired: true`, `apply: (state, data) => { state.keepPhoto = data !== false; }`; actions `ensureLoaded()` and `setKeepPhoto(value)`. Call `useSnapSettingsStore().ensureLoaded()` in `App.vue` next to the layout store. Add an `ion-toggle` "Save watering snapshots to the plant's photos" in the SideMenu Preferences section below dark mode.
- [ ] **Step 3: `SnapButton.vue`:** a large `ion-button` that clicks a hidden `<input type="file" :accept="IMAGE_ACCEPT" capture="environment">`; on change, validates with the existing image validation helper (type and 10 MB) and emits `photo(file)`; resets the input value so the same photo can be picked again. Prop `disabled`.
- [ ] **Step 4: `SnapMatchSheet.vue` tests first, then component.** `ion-modal` with `:breakpoints="[0, 0.65, 1]" :initial-breakpoint="0.65"`, `useMountWhileOpen` like `BaseFormModal`. Props: `isOpen`, `state: "matching" | "candidates" | "logged"`, `candidates: Array<{ plantId: number; name: string; imageUrl?: string; tone: WateringTone }>`, `confident: boolean`, `busy: boolean`, `loggedName: string`, `fertilizerTypes: FertilizerType[]`. Emits `close`, `pick(plantId)`, `other`, `fertilize(typeId)`, `undo`.
  - matching: spinner + "Looking for your plant...".
  - candidates: heading `water.snap_is_this` when `confident`, otherwise `water.snap_not_sure`; up to 3 rows (thumbnail, name, tone badge), first row highlighted only when confident; "Other plant..." button; all buttons disabled while `busy`. Empty list shows `water.snap_no_match` and only "Other plant...".
  - logged: "{name} watered", one chip per fertilizer type, Undo, Done.
  Tests: confident vs not-sure heading; empty state shows only the other button; `busy` disables candidate buttons (Review Focus 2); `pick` emits the plant id; logged state emits `fertilize` and `undo`.
- [ ] **Step 5: `PlantPickerModal.vue`:** `ion-modal` + `ion-searchbar` + list of `personalPlants` filtered by name; emits `pick(plantId)` and `close`.
- [ ] **Step 6: Flow in `WaterRound.vue`** (mount `SnapButton` in the snap slot only when `recognitionAvailable && !isGuest`; `recognitionAvailable` comes from `RecognitionService.status()` in `created`):

```ts
async onPhoto(file: File) {
  this.sheet = { open: true, state: "matching" };
  try {
    this.match = await RecognitionService.match(file);
  } catch {
    this.sheet.open = false;
    return;
  }
  const toneOf = (id: number) => this.rows.find((r) => r.plantId === id)?.tone;
  this.candidates = rerankCandidates(this.match.candidates, toneOf);
  this.confident = (this.match.candidates[0]?.score ?? 0) >= this.match.threshold;
  this.sheet.state = "candidates";
},
async onPick(plantId: number) {
  if (!this.match || this.busy) return;
  this.busy = true;
  try {
    this.logged = { plantId, ...(await RecognitionService.confirm(this.match.snapshotId, { plantId, keepPhoto: this.keepPhoto })) };
    this.match = null;
    await Promise.all([this.ensureRecords(plantId, { force: true }), this.getPlant(plantId, true)]);
    this.sheet.state = "logged";
  } finally {
    this.busy = false;
  }
},
async onFertilize(typeId: number) {
  await this.editRecord(this.logged.plantId, this.logged.recordId, { usedFertilizer: true, fertilizerTypeId: typeId });
},
async onUndo() {
  await this.deleteRecord(this.logged.plantId, this.logged.recordId);
  if (this.logged.imageId) await ImageService.deleteImage(this.logged.imageId);
  await this.getPlant(this.logged.plantId, true);
  this.sheet.open = false;
},
```

("Other plant..." opens `PlantPickerModal`, whose `pick` calls `onPick`. Use the actual single-image delete method name from `ImageService.ts`.) Flow test (`waterSnapFlow.test.ts`): status false hides the snap button (Review Focus 5); a successful match then pick calls `confirm` once even when `onPick` is invoked twice quickly (Review Focus 2); undo deletes the record and the image.
- [ ] **Step 7: Locale keys (en, de):** `water.snap`, `water.snap_matching`, `water.snap_is_this`, `water.snap_not_sure`, `water.snap_no_match`, `water.snap_other`, `water.snap_logged` (`{name}`), `water.snap_done`, `water.picker_title`, `menu.snap_keep_photo`, `resource.recognition` (if resource keys are localised), `recognition.match`, `recognition.confirm`. Run `check-keys`.
- [ ] **Step 8: All frontend gates; commit** `feat(water): snap a plant to log its watering`.

---

### Task 8: Verification, review and PR (wave D, controller)

- [ ] Run every backend and frontend gate from Global Constraints on the merged branch.
- [ ] `node scripts/dev-up.mjs --id snap --user grower`. In a new Edge window (Playwright Edge MCP), open the printed URL and go to `/tabs/water`. Check that:
  - the round pre-ticks Failing Fern, Spike, Sunny Pothos and the long named plant;
  - logging the round with Organic and then undoing it leaves the records unchanged;
  - snapping with `scripts/dev/.snapshots/Monty.png` shows Monty first, and picking it logs a record and adds a 5th photo to Monty;
  - after logging, Synthetic patches the record and Undo removes both the record and the photo;
  - "Other plant..." can log Unknown Orchid, which gains its first photo;
  - at 375px width, the layout fits and the sheet is usable.

  Finish with `node scripts/dev-down.mjs --id snap`.
- [ ] Repeat the snap check once with `RECOGNITION_MODEL_PATH=backend/models/dinov2-small-q8.onnx` set before dev-up, so the real model runs locally.
- [ ] Dispatch one whole-branch reviewer subagent against the spec, this plan and the Review Focus list; fix the findings.
- [ ] Push `feat/quick-watering` and open a single PR (no AI attribution). Ask the user to measure match latency on the Pi 5 with a real plant photo and to tune `OnnxEmbedder.confidentScore` from real scores.

## Self-review notes

- Spec coverage: round (T6), snap flow (T7), batch API (T1), recognition module, migration, snapshots, hook, backfill (T2, T4), model delivery and availability (T3), dev mock and seed (T5), manifest shortcut and local setting (T6, T7), docs (T1, T3, T4, T5). Deviation from the spec: undo of a round uses `POST /watering/batch/delete` rather than `DELETE`, and snapshots live in the OS temp dir rather than under uploads (that folder is publicly served).
- Names are consistent across tasks: `Embedder`, `rankPlants`, `l2normalize`, `createPixelEmbedder`, `loadOnnxEmbedder`, `TempSnapshotStore`, `createRecognition`, `recognitionRoutes`, `StoredImageEvent`, `addBatch` and `removeBatch`, `RecognitionService`, `rerankCandidates`.
