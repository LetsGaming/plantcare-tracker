# Error Handling

All errors in V2 flow through a single centralized handler. Controllers never write error responses directly — they call `next(err)` and the global handler takes care of the rest.

## The AppError Hierarchy

Every expected error extends `AppError`, which carries its own HTTP status code:

```
AppError
├── ValidationError    400  — invalid request data (+ optional field map)
├── UnauthorizedError  401  — missing or invalid token
├── ForbiddenError     403  — valid token, insufficient permissions
├── NotFoundError      404  — resource does not exist
├── ConflictError      409  — duplicate resource (e.g. username taken)
└── InternalError      500  — unexpected server error (non-operational)
```

All classes live in `src/core/errors/AppError.ts` and are re-exported from `src/core/errors/index.ts`.

## Reaching the Handler: asyncHandler

Every async controller is wrapped in `asyncHandler` (`core/middleware`, a re-export of `express-async-handler`), so a rejected promise lands in the global handler without try/catch boilerplate:

```typescript
getPlant: asyncHandler(async (req, res) => {
  const plant = await getOne.execute(Number(req.params.id)); // may throw NotFoundError
  res.json({ data: plant.toJSON() });
}),
```

## Validation: parseOrThrow

Use cases never call `schema.parse` directly. `parseOrThrow(schema, input, message)` (`core/validation`) runs the zod schema and converts failures into a `ValidationError` whose `fields` map carries one message per invalid field — the same shape on every endpoint:

```typescript
const data = parseOrThrow(CreatePlantSchema, input, 'Invalid plant data');
// on failure → ValidationError('Invalid plant data', { species: 'Species is required' })
```

## Throwing Errors

Throw typed errors from anywhere — use cases, repositories, middleware — and they will be caught and serialized automatically:

```typescript
import { NotFoundError, ValidationError, ConflictError } from '../../../core/errors';

// 404
throw new NotFoundError('Plant');
// → { "error": { "type": "NotFoundError", "message": "Plant not found", "statusCode": 404 } }

// 400 with per-field details
throw new ValidationError('Invalid plant data', {
  name: 'Required',
  species: 'Must be at least 1 character',
});
// → { "error": { ..., "fields": { "name": "Required", "species": "..." } } }

// 409
throw new ConflictError('Username already exists');
```

## The Global Handler

`src/core/middleware/errorHandler.ts` — registered last in `server.ts`:

```typescript
app.use(notFoundHandler);   // catches unmatched routes → 404
app.use(globalErrorHandler); // catches everything thrown via next(err)
```

The handler distinguishes two categories:

| Category | `isOperational` | Logged as | Meaning |
|----------|:--------------:|-----------|---------|
| Operational | `true` | `warn` | Expected business errors (NotFound, Validation, etc.) |
| Non-operational | `false` | `error` | Programming bugs (InternalError, uncaught exceptions) |

In **development** (`NODE_ENV !== 'production'`), the full stack trace is included in the error response under `error.stack`.

## Response Shape

```json
{
  "error": {
    "type": "ValidationError",
    "message": "Invalid plant data",
    "statusCode": 400,
    "fields": {
      "name": "Required",
      "species": "Must be at least 1 character"
    }
  }
}
```

`fields` is only present on `ValidationError`. `stack` is only present in development mode.

## Adding a New Error Type

1. Add a class to `src/core/errors/AppError.ts`:

```typescript
export class PaymentRequiredError extends AppError {
  constructor(message = 'Payment required to access this resource') {
    super(message, 402);
  }
}
```

2. Export it from `src/core/errors/index.ts`.

3. Throw it from any use case or middleware — the global handler picks it up automatically.

## Type Guard

Use `isAppError` to distinguish `AppError` instances from unknown errors in catch blocks:

```typescript
import { isAppError } from '../core/errors';

try {
  await someOperation();
} catch (err) {
  if (isAppError(err)) {
    // err.statusCode, err.message, err.isOperational are all typed
  } else {
    // unknown error — log and re-throw or wrap in InternalError
  }
}
```

## Unhandled Routes

`notFoundHandler` converts any request that doesn't match a route into a structured 404:

```json
{
  "error": {
    "type": "NotFoundError",
    "message": "Route GET /api/v2/nonexistent not found",
    "statusCode": 404
  }
}
```

---

← [API Reference](./api-reference.md) · **Next:** [Testing](./testing.md)
