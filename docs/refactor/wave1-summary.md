# Wave 1 summary

Stacked PRs #17 to #33, one per step, each based on the previous branch. #16 (audit) is merged.

## PRs

| PR | Branch | Content |
|----|--------|---------|
| 17 | w1-01-tooling | Prettier and ESLint flat config in both packages, CI lint and format steps, tests type-checked |
| 18 | w1-02-backend-safety-net | `createApp`, HTTP contract suite on real SQLite, repository tests |
| 19 | w1-03-frontend-safety-net | Coverage provider, session, service, SSE and guard tests |
| 20 | w1-04-dependency-security | Dependency security updates (DEP-01, DEP-02) |
| 21 | w1-05-contract-authz-session | Authorization, session ids, status codes (SEC-01..06, BUG-01, BUG-02, BUG-05) |
| 22 | w1-06-contract-errors-validation | Error mapping, input limits, stream errors, escaping (BUG-03, SEC-07, SEC-09, BUG-09) |
| 23 | w1-07-backend-cleanup | Typed config, `core/auth`, species resolver (QUAL-05, QUAL-06) |
| 24 | w1-08-db-kysely | Kysely repositories, versioned migrations, dump importer (QUAL-02, BUG-07) |
| 25 | w1-09-data-integrity | Image cleanup port, orphan purge, relative image paths (BUG-04, BUG-08) |
| 26 | w1-10-fastify | Express replaced by Fastify 5 in one PR; only `tests/contract/harness.ts` changed in the contract suite |
| 27 to 31 | w1-11 to w1-15 | Pinia stores: session and infrastructure, plants, watering, substrates and components, sales, more-info, admin health, calendar; `BaseService` removed (QUAL-04, BUG-06) |
| 32 | w1-16-frontend-cleanup | Dev-only debug route, prop mutation fixes (SEC-10, part of QUAL-07) |
| 33 | w1-17-docs-pass | Docs drift pass (DOC-01), this summary |

## Contract changes

All are listed in `backend/docs/api-reference.md` and were applied to the frontend in the same PR.

| Change | PR |
|--------|----|
| Ownership checks on profile and entity writes; guest is read-only; image access follows the owning entity | 21 |
| Sales stream requires a one-time ticket | 21 |
| Access token cookie ignored; refresh and logout bound to a session id | 21 |
| Body-parser and SQLite errors map to 400, 409 and 413 instead of 500 | 22 |
| Password and field limits; stream failures send an `error` event | 22 |
| Image urls stored without origin and rendered with `PUBLIC_BASE_URL` or the request origin | 25 |
| Timestamps documented as epoch seconds | 33 |

## Audit finding status

| Status | Findings |
|--------|----------|
| Fixed | SEC-01..07, SEC-09, SEC-10, BUG-01..09, DEP-01, DEP-02 (build tooling remains transitive), QUAL-01..06, QUAL-08, DOC-01 |
| Partly fixed | QUAL-07: prop mutations fixed except 8 suppressed in `FormComponent`; per-component `t()` duplicates and multi-word names remain |
| Deferred | SEC-08 helmet (conflicts with the cross-origin image policy, needs a CORP decision); route schemas with a Zod provider; unifying `PlantLinkSearchers` fetch helpers with `HttpFetcher`; DI container |

BUG-02 ships as a code fix only: production uses guest id 2, so no data migration was needed.

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| Backend tests | see audit | 571 |
| Backend line coverage | 64% | 90% |
| Frontend tests | see audit | 293 |
| Frontend line coverage | untracked | 61% |
| Lint | none | 0 errors; 72 frontend warnings (`no-explicit-any`) |

## Decisions applied

D1 Kysely, D2 all contract changes, D3 ticket for sales, D4 guest id 2, D7 Fastify as one PR, D22 stacked PRs without asking. The other decisions follow the audit recommendations.

## Open items for the owner

- Run a backup of the database and uploads before deploying: migration `0002` deletes orphan image rows and files.
- Set `PUBLIC_BASE_URL` in production if the API sits behind a proxy with a different public origin.
- Decide the helmet and CORP policy (SEC-08).
- Public `/uploads` files remain unauthenticated by design (UUID file names).

## Wave 2 readiness

Wave 1 is complete once the stack is merged. Wave 2 starts with the UX audit in `docs/refactor/wave2-ux-audit.md`.
