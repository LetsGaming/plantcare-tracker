# Refactor history

The two-wave refactor of PlantCare Tracker, in the order it happened.

| Document | Content |
|----------|---------|
| [wave1-audit.md](./wave1-audit.md) | Code audit that started wave 1: security, bugs, quality, dependencies, documentation drift |
| [wave1-summary.md](./wave1-summary.md) | Result of wave 1: tooling, safety nets, contract changes, Kysely and Fastify, Pinia stores, docs pass; finding status, metrics, open items |
| [wave2-ux-audit.md](./wave2-ux-audit.md) | Frontend UX audit (about 140 findings) that drove the redesign |
| [wave2-summary.md](./wave2-summary.md) | Result of wave 2: design system, states, watering-first screens, forms, PWA; the second critique round on modals, admin and Sales |

Current documentation lives next to the code: `backend/docs`, `frontend/docs`, `PRODUCT.md`, `DESIGN.md`. These
files are a record of decisions and are not updated when the code moves on.
