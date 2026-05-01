# Testing

Tests buy confidence to change code without breaking it. They are not a coverage number.

## Pyramid

- **Unit** — many, fast. Business logic, pure functions, single services with mocked deps.
- **Integration** — some, moderate. A service + its real DB; a controller + a test module. Catches wiring bugs unit tests can't.
- **E2E / smoke** — few, slow. One golden path per critical workflow. For metahunt: `curl /rss` → workflow runs to `completed` in Temporal UI.

## What NOT to test

- Framework code (NestJS internals, Drizzle methods).
- Trivial getters / setters.
- Private methods directly — test through the public surface.
- Implementation details ("did it call `repo.save` with these exact args"). Test behavior — the observable result.

## Patterns

### Arrange / Act / Assert

Three blocks per test, in order. Blank line between is fine.

### One thing per test

Multiple `expect()` is fine; multiple *concerns* is not. If the test name needs "and", split it.

### Isolation

No shared mutable state across tests. `beforeEach` resets; `beforeAll` only for read-only setup.

### Factories for test data

Build domain objects through small `createX(overrides)` helpers. Promotes shared shapes; lets each test override only what matters. Keep one shared factory module; local one-offs are fine when truly one-off.

### Mocking

Mock at the seam — the interface, not the SDK.

- Drizzle: build a chained mock around `select` / `insert` / `update`.
- External APIs: mock the client, not `fetch`.
- LLM: the `VACANCY_EXTRACTOR` token + impls is the testable seam; preserve that shape for new pluggable boundaries.

## Naming

```
describe('<thing>', () => {
  describe('<method>', () => {
    it('does X when Y', …)
  })
})
```

Good test names read like a spec:

- "returns the record when the hash matches"
- "throws NotFound when the source is missing"
- "skips records already present by hash"

## Coverage

Aim for ≥80% on services / business logic, less on glue. Coverage doesn't measure test quality — focus on critical paths and the failure cases that scare you.
