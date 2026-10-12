import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, createContractApp, type ContractApp } from './harness';
import { createPlant, createSubstrate } from './support';

let app: ContractApp;
let png: Buffer;
let uploadsDir: string;

beforeAll(async () => {
  app = await createContractApp();
  png = await app.png();
  uploadsDir = (await import('../../src/core/config')).getUploadsDirectory();
});
afterAll(() => app.close());

const uploadImage = async (
  auth: Record<string, string>,
  entityType: 'plant' | 'substrate',
  entityId: number,
): Promise<string> => {
  const res = await app.client.request({
    method: 'post',
    url: `${API}/images/${entityType}/${entityId}`,
    headers: auth,
    multipart: [{ field: 'image', filename: 'photo.png', contentType: 'image/png', data: png }],
  });
  expect(res.status).toBe(201);
  return path.join(uploadsDir, entityType, path.basename(new URL(res.body.data.path).pathname));
};

const count = (table: string, where: string, ...params: number[]) =>
  app.db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, params)[0].n;

describe('DELETE /auth/me for a substrate owner', () => {
  it('deletes the account, its data and its image files, and detaches other users plants', async () => {
    const owner = await app.signIn('user');
    const other = await app.signIn('user');

    const publicSubstrate = await createSubstrate(app, owner.auth, {
      name: 'Public Mix',
      isPublic: true,
    });
    const privateSubstrate = await createSubstrate(app, owner.auth, { name: 'Private Mix' });
    const ownPlant = await createPlant(app, owner.auth, privateSubstrate.substrate_id);
    const foreignPlant = await createPlant(app, other.auth, publicSubstrate.substrate_id);

    const files = [
      await uploadImage(owner.auth, 'substrate', publicSubstrate.substrate_id),
      await uploadImage(owner.auth, 'substrate', privateSubstrate.substrate_id),
      await uploadImage(owner.auth, 'plant', ownPlant.plant_id),
    ];
    const foreignFile = await uploadImage(other.auth, 'plant', foreignPlant.plant_id);
    files.forEach((file) => expect(fs.existsSync(file)).toBe(true));

    const res = await app.client.request({
      method: 'delete',
      url: `${API}/auth/me`,
      headers: owner.auth,
    });

    expect(res.status).toBe(204);
    expect(count('users', 'id = ?', owner.user.id)).toBe(0);
    expect(count('substrates', 'user_id = ?', owner.user.id)).toBe(0);
    expect(count('plants', 'user_id = ?', owner.user.id)).toBe(0);
    expect(
      count(
        'images',
        "(entity_type = 'substrate' AND entity_id IN (?, ?)) OR (entity_type = 'plant' AND entity_id = ?)",
        publicSubstrate.substrate_id,
        privateSubstrate.substrate_id,
        ownPlant.plant_id,
      ),
    ).toBe(0);
    files.forEach((file) => expect(fs.existsSync(file)).toBe(false));

    const kept = app.db.query<{ substrate_id: number | null }>(
      'SELECT substrate_id FROM plants WHERE id = ?',
      [foreignPlant.plant_id],
    );
    expect(kept).toEqual([{ substrate_id: null }]);
    expect(count('images', "entity_type = 'plant' AND entity_id = ?", foreignPlant.plant_id)).toBe(
      1,
    );
    expect(fs.existsSync(foreignFile)).toBe(true);
  });

  it('answers 404 for an unknown user and leaves other accounts untouched', async () => {
    const bystander = await app.signIn('user');
    const substrate = await createSubstrate(app, bystander.auth);

    const gone = await app.signIn('user');
    app.db.execute('DELETE FROM users WHERE id = ?', [gone.user.id]);
    const res = await app.client.request({
      method: 'delete',
      url: `${API}/auth/me`,
      headers: gone.auth,
    });

    expect(res.status).toBe(404);
    expect(count('substrates', 'id = ?', substrate.substrate_id)).toBe(1);
  });
});
