This document serves as a comprehensive refactoring specification for transitioning the current backend (V1) to a robust, scalable, and maintainable **V2 architecture**. It is designed to be used by AI agents to guide architectural decisions and code generation.

---

# Backend V2 Refactoring Instructions

## 1. Core Architectural Strategy: Modular Monolith
The goal is to transition from a controller-centric architecture to a **Layered Modular Monolith**. We prioritize clear boundaries, high cohesion, and low coupling.

### The Folder Hierarchy
Each module must follow this internal structure to separate concerns:

* **`/domain`**: Pure business logic. Entities, value objects, and repository interfaces. **No dependencies** on frameworks (Express), databases, or external APIs.

* **`/application`**: Use Cases (e.g., `CreatePlant.js`, `FetchSalesOverview.js`). Orchestrates domain logic and infrastructure.

* **`/infrastructure`**: Implementations of interfaces. Database queries (SQL), external API clients (OpenAI, Scrapers), and file system access.

* **`/presentation`**: Entry points. Express routes and **thin** controllers that only translate HTTP to application calls.

---

## 2. Implementation Rules

### 2.1 Domain-Driven Thinking

* **Entities over Plain Objects**: Instead of returning raw JSON from the DB, use class-based entities that enforce business invariants (e.g., a `Plant` class with a `water()` method).

* **Dependency Injection**: Inject repositories and services into use cases. This allows for easier testing and swapping of implementations.

### 2.2 Performance & Reliability

* **Strategic Caching**: Move caching logic out of controllers into a dedicated `core/cache` layer. Caching should be declarative and managed at the application level.

* **Concurrency & Infrastructure**: Move the scraper system and OpenAI clients from `/controllers` to `/infrastructure`. They must implement a common interface so the application layer remains agnostic of the source.

* **Observability**: Implement structured logging, request ID correlation, and health checks from the start.

### 2.3 Strict Engineering Standards

* **DTOs and Validation**: Use explicit Data Transfer Objects (DTOs) for all inputs. Never trust raw request bodies.

* **Centralized Error Handling**: Use domain-specific errors (e.g., `NotFoundError`) and map them to HTTP codes in a single global middleware.

* **Database Correctness**: Ensure all foreign keys and frequently filtered columns are indexed. Use versioned, reversible migrations for all schema changes.

---

## 3. Refactoring Roadmap (The "Sales" Pilot)

To validate this architecture, refactor the **Sales Module** first. It is the most complex module as it involves scraping, concurrency, and data transformation.

1. **Define the Interface**: Create a `SalesSource` interface in the domain.
2. **Move Scrapers**: Relocate scraper logic to `infrastructure/scrapers`.
3. **Create Use Case**: Logic for merging and filtering sales data moves to `application/FetchSalesOverview.js`.
4. **Thin the Controller**: The `salesController` should only call the use case and return the result.

---

## 4. Technical Constraints
* **Language**: Move toward **TypeScript** with strict mode enabled to eliminate the "raw JSON" bugs prevalent in V1.
* **No Copy-Paste**: Do not copy V1 code directly. Re-implement logic within the new boundary rules.

