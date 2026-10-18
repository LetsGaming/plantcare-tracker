import { sleep } from "../../lib/session.mjs";

const POLL_MS = 500;
const TIMEOUT_MS = 30_000;
const STABLE_POLLS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const FIRST_SEEN_DAYS_AGO = 20;
const NEW_EVERY = 4;
const CHART_EVERY = 3;

const waitForRefresher = async (ctx, token) => {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = 0;
  let stable = 0;
  while (Date.now() < deadline) {
    const { total } = await ctx.call("GET", "/sales/summary", { token });
    if (total > 0 && total === last) stable += 1;
    else stable = 0;
    last = total;
    if (stable >= STABLE_POLLS) return total;
    await sleep(POLL_MS);
  }
  throw new Error(
    `Sales stayed empty for ${TIMEOUT_MS / 1000} s. The sales refresher must be enabled in the dev backend ` +
      "(SALES_REFRESH_ENABLED) and its warm-up must finish in time; check DEV_MOCK_SALES_DELAY_MS (mock page delay).",
  );
};

export default {
  name: "sales",
  async run(ctx) {
    const total = await waitForRefresher(ctx, ctx.token("grower"));
    const now = Date.now();
    ctx.sql(
      "UPDATE sales_items SET first_seen_at = ?",
      now - FIRST_SEEN_DAYS_AGO * DAY_MS,
    );
    ctx.sql(
      `UPDATE sales_items SET first_seen_at = ? WHERE rowid % ${NEW_EVERY} = 0`,
      now - HOUR_MS,
    );
    ctx.sql(
      `INSERT OR IGNORE INTO sales_price_points (sale_id, observed_at, price)
       SELECT s.sale_id, ? - d.days * ${DAY_MS}, ROUND(s.new_price * (1 + d.days * 0.06), 2)
       FROM sales_items s
       CROSS JOIN (SELECT 4 AS days UNION ALL SELECT 3 UNION ALL SELECT 2 UNION ALL SELECT 1) d
       WHERE s.rowid % ${CHART_EVERY} = 0`,
      now,
    );
    ctx.state.sales = { total };
  },
};
