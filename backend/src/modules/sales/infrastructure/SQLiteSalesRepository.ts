/**
 * modules/sales/infrastructure/SQLiteSalesRepository.ts
 *
 * Sales items, price points and per-source refresh state in SQLite.
 * `active = 1` is written as a literal so the planner can use the partial
 * index idx_sales_active_first_seen (and `active = 0` idx_sales_inactive_seen).
 */

import { sql, type SqlBool, type Transaction } from 'kysely';
import { getKysely } from '../../../core/database/db';
import type { Database } from '../../../core/database/schema';
import { getConfig } from '../../../core/config';
import { applyKeyset, toPage, type Page } from '../../../core/pagination';
import type { Sale, SaleRow } from '../domain/Sale';
import {
  SALES_SORT,
  type PricePoint,
  type RetentionResult,
  type SalesPageRequest,
  type SalesRepository,
  type SalesSourceState,
  type SalesSourceStatePatch,
  type SalesSummary,
  type SnapshotResult,
} from '../domain/SalesRepository';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SALES_HISTORY_LIMIT = 30;
export const PRICE_POINT_RETENTION_DAYS = 180;

const ITEM_COLUMNS = [
  'sale_id',
  'source_key',
  'seller',
  'name',
  'link',
  'image_url',
  'old_price',
  'new_price',
  'discount_pct',
  'first_seen_at',
  'last_seen_at',
  'scraped_at',
  'active',
] as const;

const isActive = sql<SqlBool>`active = 1`;
const isInactive = sql<SqlBool>`active = 0`;

const uniqueById = (sales: readonly Sale[]): Sale[] => {
  const byId = new Map<string, Sale>();
  for (const sale of sales) if (!byId.has(sale.sale_id)) byId.set(sale.sale_id, sale);
  return [...byId.values()];
};

const toSnapshotRow = (sale: Sale) => ({
  sale_id: sale.sale_id,
  seller: sale.sale_seller,
  name: sale.sale_name,
  link: sale.sale_link,
  image_url: sale.sale_image_url,
  old_price: sale.sale_old_price,
  new_price: sale.sale_new_price,
  discount_pct: sale.sale_discount_pct,
  scraped_at: sale.sale_scraped_at,
});

export class SQLiteSalesRepository implements SalesRepository {
  async applySourceSnapshot(
    sourceKey: string,
    _seller: string,
    sales: readonly Sale[],
    runAt: number,
  ): Promise<SnapshotResult> {
    const items = uniqueById(sales);
    if (items.length === 0) return { upserted: 0, pricePointsAdded: 0, deactivated: 0 };
    const maxPoints = getConfig().sales.pricePointsMax;
    const rows = JSON.stringify(items.map(toSnapshotRow));
    const ids = JSON.stringify(items.map((sale) => sale.sale_id));

    return getKysely()
      .transaction()
      .execute(async (trx) => {
        await this.upsertItems(trx, sourceKey, rows, runAt);
        const pricePointsAdded = await this.recordPrices(trx, rows, runAt);
        await this.trimPrices(trx, ids, maxPoints);

        const deactivated = await trx
          .updateTable('sales_items')
          .set({ active: 0 })
          .where('source_key', '=', sourceKey)
          .where(isActive)
          .where(sql<SqlBool>`sale_id NOT IN (SELECT value FROM json_each(${ids}))`)
          .executeTakeFirst();

        return {
          upserted: items.length,
          pricePointsAdded,
          deactivated: Number(deactivated.numUpdatedRows),
        };
      });
  }

  async pageActive({ limit, cursor }: SalesPageRequest): Promise<Page<SaleRow>> {
    const rows = await applyKeyset(
      getKysely().selectFrom('sales_items').select(ITEM_COLUMNS).where(isActive),
      { column: 'first_seen_at', idColumn: 'sale_id', direction: 'desc', cursor, limit },
    ).execute();
    return toPage(rows, {
      limit,
      sort: SALES_SORT,
      key: (row) => ({ v: row.first_seen_at, id: row.sale_id }),
    });
  }

  async findById(saleId: string): Promise<SaleRow | null> {
    const row = await getKysely()
      .selectFrom('sales_items')
      .select(ITEM_COLUMNS)
      .where('sale_id', '=', saleId)
      .executeTakeFirst();
    return row ?? null;
  }

  async history(saleId: string): Promise<PricePoint[]> {
    const newestFirst = await getKysely()
      .selectFrom('sales_price_points')
      .select(['price', 'observed_at'])
      .where('sale_id', '=', saleId)
      .orderBy('observed_at', 'desc')
      .limit(SALES_HISTORY_LIMIT)
      .execute();
    return newestFirst.reverse();
  }

  async summary(since: number): Promise<SalesSummary> {
    const db = getKysely();
    const active = await db
      .selectFrom('sales_items')
      .select((eb) => [
        eb.fn.countAll<number>().as('total'),
        sql<number>`COALESCE(SUM(first_seen_at > ${since}), 0)`.as('new_since'),
        eb.fn.max<number | null>('first_seen_at').as('latest_first_seen_at'),
      ])
      .where(isActive)
      .executeTakeFirstOrThrow();
    const refreshed = await sql<{ refreshed_at: number | null }>`
      SELECT COALESCE(
        (SELECT MAX(last_success_at) FROM sales_source_state),
        (SELECT MAX(last_seen_at) FROM sales_items)
      ) AS refreshed_at`.execute(db);

    return {
      total: Number(active.total),
      new_since: Number(active.new_since),
      refreshed_at: refreshed.rows[0]?.refreshed_at ?? null,
      latest_first_seen_at: active.latest_first_seen_at ?? null,
    };
  }

  async pruneRetention(now: number): Promise<RetentionResult> {
    const itemCutoff = now - getConfig().sales.retentionDays * DAY_MS;
    const pointCutoff = now - PRICE_POINT_RETENTION_DAYS * DAY_MS;

    return getKysely()
      .transaction()
      .execute(async (trx) => {
        const items = await trx
          .deleteFrom('sales_items')
          .where(isInactive)
          .where('last_seen_at', '<', itemCutoff)
          .executeTakeFirst();
        const points = await trx
          .deleteFrom('sales_price_points')
          .where('observed_at', '<', pointCutoff)
          .where(
            sql<SqlBool>`observed_at < (SELECT MAX(p2.observed_at) FROM sales_price_points p2 WHERE p2.sale_id = sales_price_points.sale_id)`,
          )
          .executeTakeFirst();
        return {
          items: Number(items.numDeletedRows),
          pricePoints: Number(points.numDeletedRows),
        };
      });
  }

  async deactivateSource(sourceKey: string): Promise<number> {
    const result = await getKysely()
      .updateTable('sales_items')
      .set({ active: 0 })
      .where('source_key', '=', sourceKey)
      .where(isActive)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async getSourceState(sourceKey: string): Promise<SalesSourceState | null> {
    const row = await getKysely()
      .selectFrom('sales_source_state')
      .select([
        'source_key',
        'last_attempt_at',
        'last_success_at',
        'consecutive_failures',
        'next_due_at',
      ])
      .where('source_key', '=', sourceKey)
      .executeTakeFirst();
    return row ?? null;
  }

  async setSourceState(sourceKey: string, patch: SalesSourceStatePatch): Promise<void> {
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as SalesSourceStatePatch;
    const insert = getKysely()
      .insertInto('sales_source_state')
      .values({ ...changes, source_key: sourceKey });
    await (
      Object.keys(changes).length === 0
        ? insert.onConflict((oc) => oc.column('source_key').doNothing())
        : insert.onConflict((oc) => oc.column('source_key').doUpdateSet(changes))
    ).execute();
  }

  /** `WHERE true` keeps SQLite from parsing ON CONFLICT as a join constraint of the SELECT. */
  private async upsertItems(
    trx: Transaction<Database>,
    sourceKey: string,
    rows: string,
    runAt: number,
  ): Promise<void> {
    await sql`
      INSERT INTO sales_items (sale_id, source_key, seller, name, link, image_url, old_price,
        new_price, discount_pct, first_seen_at, last_seen_at, scraped_at, active)
      SELECT j.value ->> '$.sale_id', ${sourceKey}, j.value ->> '$.seller', j.value ->> '$.name',
        j.value ->> '$.link', j.value ->> '$.image_url', j.value ->> '$.old_price',
        j.value ->> '$.new_price', j.value ->> '$.discount_pct', ${runAt}, ${runAt},
        j.value ->> '$.scraped_at', 1
      FROM json_each(${rows}) AS j
      WHERE true
      ON CONFLICT (sale_id) DO UPDATE SET
        source_key = excluded.source_key,
        seller = excluded.seller,
        name = excluded.name,
        link = excluded.link,
        image_url = excluded.image_url,
        old_price = excluded.old_price,
        new_price = excluded.new_price,
        discount_pct = excluded.discount_pct,
        last_seen_at = excluded.last_seen_at,
        scraped_at = excluded.scraped_at,
        active = 1`.execute(trx);
  }

  /** Adds a point for every sale whose price differs from its latest point; returns how many. */
  private async recordPrices(
    trx: Transaction<Database>,
    rows: string,
    observedAt: number,
  ): Promise<number> {
    const inserted = await sql`
      INSERT OR IGNORE INTO sales_price_points (sale_id, observed_at, price)
      SELECT j.value ->> '$.sale_id', ${observedAt}, j.value ->> '$.new_price'
      FROM json_each(${rows}) AS j
      WHERE (j.value ->> '$.new_price') IS NOT (
        SELECT p.price FROM sales_price_points AS p
        WHERE p.sale_id = j.value ->> '$.sale_id'
        ORDER BY p.observed_at DESC
        LIMIT 1
      )`.execute(trx);
    return Number(inserted.numAffectedRows ?? 0);
  }

  private async trimPrices(
    trx: Transaction<Database>,
    ids: string,
    maxPoints: number,
  ): Promise<void> {
    await sql`
      DELETE FROM sales_price_points
      WHERE (sale_id, observed_at) IN (
        SELECT sale_id, observed_at FROM (
          SELECT p.sale_id, p.observed_at,
            row_number() OVER (PARTITION BY p.sale_id ORDER BY p.observed_at DESC) AS newest_rank
          FROM sales_price_points AS p
          WHERE p.sale_id IN (SELECT value FROM json_each(${ids}))
        )
        WHERE newest_rank > ${maxPoints}
      )`.execute(trx);
  }
}
