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
(`Leafy Rarities` healthy, `Jungle Corner` degraded, `Broken Botanics` failing), a mocked AI care
guide (a plant name containing "fail" ends its stream with an error) and mocked link searchers.
Nothing leaves the machine.

## Adding mock data for a new feature

Seeding goes through the real HTTP API. Add `scripts/dev/seed/steps/NN-name.mjs` exporting
`{ name, run(ctx) }` and list it in `scripts/dev/seed/index.mjs`. `ctx` has `call(method, path,
{ token, json, form })`, `token(username)`, `sql(...)` (for what the API cannot do) and `state`
(ids handed from earlier steps). Network-bound features get their stand-in in `devMocks.ts`.
Extend the seed in the same change that adds the feature.

## Gates

Backend: `pnpm run lint`, `format:check`, `typecheck`, `test:coverage`, `build`.
Frontend: `pnpm run lint`, `format:check`, `pnpm exec vue-tsc --noEmit`, `pnpm exec vitest run --coverage`, `pnpm run build`.
Frontend stays on the Options API (a test enforces it).
