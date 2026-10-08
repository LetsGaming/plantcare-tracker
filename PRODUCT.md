# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Hobby plant owners (assumed from the product, unconfirmed) who keep a collection of houseplants and track watering, fertilizer, substrates and photos on a phone, usually one-handed next to the plant. A smaller group are collectors who follow plant sales from specialist shops. One admin role curates the component catalogue and watches the scraper health. Guests can browse public plants read-only.

## Product Purpose
PlantCare Tracker records what each plant needs and what it got: watering history with fertilizer, substrates built from components, a photo timeline, an AI care guide per plant name, and a streamed overview of discounted plants from several shops. Success is that the owner knows at a glance which plant to water next and can log it in one step.

## Positioning
A personal plant logbook that joins care history, substrate recipes and shop sales in one app, with public and private sharing of plants and substrates.

## Operating Context
Mobile-first installable web app (Ionic Vue), also used on desktop. German and English UI. Light and dark. Data comes from a Fastify and SQLite backend; shop sales and the AI guide stream over server-sent events.

## Capabilities and Constraints
- Frontend stays on the Vue Options API and Pinia stores; Ionic components.
- Roles: admin, user, guest (read-only).
- Contract and stores are documented in `backend/docs` and `frontend/docs`.
- Undecided: whether Sales is a top-level tab (the redesign makes it one).

## Brand Commitments
Name: PlantCare Tracker. Primary color family stays green. The owner asked for a warm, botanical feel (confirmed in the critique round); this record is otherwise inferred from the repository and labeled as such.

## Evidence on Hand
No testimonials, customer data or brand assets exist. Mock data for development lives in `scripts/dev/seed`.

## Product Principles
- Watering state is the product; the catalogue serves it.
- Every state (loading, empty, error, not found) tells the user what happened and what to do next.
- One consistent control vocabulary: labeled, 44px, keyboard reachable.
- Works one-handed on a phone and does not look like a stretched phone on a desktop.

## Accessibility & Inclusion
WCAG AA contrast, visible focus, accessible names on every control, reduced motion respected, German and English parity.
