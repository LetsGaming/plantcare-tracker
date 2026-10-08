/** Streams the sales once so the admin scraper screens show a healthy, a degraded and a failing
 *  source instead of "unknown" on a fresh database. */
export default {
  name: "scraper-health",
  async run(ctx) {
    const token = ctx.token("grower");
    const { ticket } = await ctx.call("POST", "/auth/ticket", { token });
    const res = await fetch(`${ctx.apiUrl}/sales?ticket=${encodeURIComponent(ticket)}`);
    if (!res.ok) throw new Error(`GET /sales answered ${res.status}`);
    await res.text();
  },
};
