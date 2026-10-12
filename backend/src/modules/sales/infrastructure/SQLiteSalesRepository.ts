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

    return getKysely()
      .transaction()
      .execute(async (trx) => {
        let pricePointsAdded = 0;
        for (const sale of items) {
          await this.upsertItem(trx, sourceKey, sale, runAt);
          if (await this.recordPrice(trx, sale.sale_id, sale.sale_new_price, runAt, maxPoints)) {
            pricePointsAdded++;
          }
        }

        const ids = JSON.stringify(items.map((sale) => sale.sale_id));
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

  private async upsertItem(
    trx: Transaction<Database>,
    sourceKey: string,
    sale: Sale,
    runAt: number,
  ): Promise<void> {
    await trx
      .insertInto('sales_items')
      .values({
        sale_id: sale.sale_id,
        source_key: sourceKey,
        seller: sale.sale_seller,
        name: sale.sale_name,
        link: sale.sale_link,
        image_url: sale.sale_image_url,
        old_price: sale.sale_old_price,
        new_price: sale.sale_new_price,
        discount_pct: sale.sale_discount_pct,
        first_seen_at: runAt,
        last_seen_at: runAt,
        scraped_at: sale.sale_scraped_at,
        active: 1,
      })
      .onConflict((oc) =>
        oc.column('sale_id').doUpdateSet((eb) => ({
          source_key: eb.ref('excluded.source_key'),
          seller: eb.ref('excluded.seller'),
          name: eb.ref('excluded.name'),
          link: eb.ref('excluded.link'),
          image_url: eb.ref('excluded.image_url'),
          old_price: eb.ref('excluded.old_price'),
          new_price: eb.ref('excluded.new_price'),
          discount_pct: eb.ref('excluded.discount_pct'),
          last_seen_at: eb.ref('excluded.last_seen_at'),
          scraped_at: eb.ref('excluded.scraped_at'),
          active: 1,
        })),
      )
      .execute();
  }

  /** Adds a point when the price differs from the latest one; returns whether it did. */
  private async recordPrice(
    trx: Transaction<Database>,
    saleId: string,
    price: number,
    observedAt: number,
    maxPoints: number,
  ): Promise<boolean> {
    const latest = await trx
      .selectFrom('sales_price_points')
      .select('price')
      .where('sale_id', '=', saleId)
      .orderBy('observed_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (latest && latest.price === price) return false;

    const inserted = await trx
      .insertInto('sales_price_points')
      .orIgnore()
      .values({ sale_id: saleId, observed_at: observedAt, price })
      .executeTakeFirst();
    if (Number(inserted.numInsertedOrUpdatedRows ?? 0) === 0) return false;

    await trx
      .deleteFrom('sales_price_points')
      .where('sale_id', '=', saleId)
      .where('observed_at', 'not in', (qb) =>
        qb
          .selectFrom('sales_price_points')
          .select('observed_at')
          .where('sale_id', '=', saleId)
          .orderBy('observed_at', 'desc')
          .limit(maxPoints),
      )
      .execute();
    return true;
  }
}
