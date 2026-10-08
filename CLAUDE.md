# PlantCare Tracker

Monorepo: `backend` (Fastify 5, Kysely, SQLite) and `frontend` (Ionic Vue, Options API, Pinia).

## Running the app locally

Never run `pnpm dev` directly. Use the isolated dev stack, which gives every session its own
database, uploads folder, logs and free ports, and fills the database with mock data:

```bash
node scripts/dev-up.mjs --id <short-session-name>      # start, seed, print the app url (already signed in)
node scripts/dev-down.mjs --id <short-session-name>    # stop exactly that session and delete its state
```

Options: `--user admin|grower|newbie` (account of the printed url), `--no-seed`, `--loggedout`.
Accounts all use the password `DevPass123!`; the guest is the "continue as guest" button.

The backend runs `backend/src/tools/devServer.ts`: the real app with mocked shop scrapers
(`Leafy Rarities` healthy, `Jungle Corner` degraded, `Broken Botanics` failing, `Patchy Plants`
degraded by missing images), a mocked AI care
guide (a plant name containing "fail" ends its stream with an error) and mocked link searchers.
Nothing leaves the machine.

## What the seed covers

| Feature | How to test it |
|---------|----------------|
| Roles | `admin` (components, scraper health), `grower` (owns most data), `collector` (owns public plants and a public substrate), `newbie` (empty account), guest button on login |
| Plant list watering states | `grower`: ok (Monty, Pink Princess, Gummibaum Ünal, Calathea Cleo, Snake Plant), watered today (Dracaena Dave), due (Failing Fern, Spike), overdue (Sunny Pothos, the long named plant), never watered (Unknown Orchid, Blue Echeveria) |
| Public tab and ownership | Public plants and substrates of `admin` and `collector` appear for everyone; `Private Treasure` is private and must not appear for others |
| Watering records | Fertilizer organic and synthetic, short and long rhythms, edit and delete through the calendar |
| Photos | Monty (4 dated photos), Calathea Cleo (3), Pink Princess and Rare Albo (2), single photos, and many plants without any |
| Substrates | Four components, seven components (component search), none (`Moss pole filler`), public and private |
| Components | Admin only; some with photos, three fineness levels |
| Care guide | Success (any plant), error mid stream (`Failing Fern`), no external link (`Unknown Orchid`) |
| Sales | Four mock shops (healthy, degraded, failing, partial with half of its items lacking an image), NEW pills, tab badge; prices of every third item drop on each of the first four loads, so open Sales and pull to refresh twice to get price history charts |
| Scraper health (admin) | Sales sources ok, degraded, failing, partial (degraded with an `images_missing` issue), plus three link search sources (kind search) ok, degraded, failing |
| Local only | Reminders, categories, first weekday, language and dark mode live in the browser; create them in the app |

## Adding mock data for a new feature

Seeding goes through the real HTTP API. Add `scripts/dev/seed/steps/NN-name.mjs` exporting
`{ name, run(ctx) }` and list it in `scripts/dev/seed/index.mjs`. `ctx` has `call(method, path,
{ token, json, form })`, `token(username)`, `sql(...)` (for what the API cannot do) and `state`
(ids handed from earlier steps). Network-bound features get their stand-in in `devMocks.ts`.
Extend the seed in the same change that adds the feature.

## Gates

Backend: `pnpm run lint`, `format:check`, `typecheck`, `test:coverage`, `build`.
Frontend: `pnpm run lint`, `format:check`, `pnpm exec vue-tsc --noEmit`, `pnpm run check-keys`, `pnpm exec vitest run --coverage`, `pnpm run build`.

Product and visual context: `PRODUCT.md`, `DESIGN.md`, `frontend/docs/design-system.md`. New user-visible text needs a key in both locale files; icons come from `frontend/src/theme/icons.ts`; styling uses tokens only.
Frontend stays on the Options API (a test enforces it).
