const SOURCES = [
  ["wikiPlants", "Wiki Plants", "ok", "jsonLd", 12, 0, null],
  ["plantCareGuide", "Plant Care Guide", "degraded", "heuristic", 3, 0, null],
  ["leafLibrary", "Leaf Library", "failing", null, 0, 4, "Search page layout changed (mock source)"],
];

/** The plant link searchers are mocked without a health reporter, so their rows are written directly. They
 *  fill the second group of the admin scraper screen (kind "search"). */
export default {
  name: "search-health",
  async run(ctx) {
    const now = new Date().toISOString();
    for (const [key, seller, status, strategy, items, failures, error] of SOURCES) {
      ctx.sql(
        `INSERT OR REPLACE INTO scrape_source_health
           (source_key, kind, seller, status, active_strategy, last_item_count, consecutive_failures,
            last_success_at, last_failure_at, last_error, updated_at)
         VALUES (?, 'search', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        key,
        seller,
        status,
        strategy,
        items,
        failures,
        status === "failing" ? null : now,
        failures > 0 ? now : null,
        error,
        now,
      );
    }
  },
};
