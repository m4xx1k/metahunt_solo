# Style — formatting, naming, TS rules

Surface-level rules. Lint enforces most; the rest live here.

## Formatting (Prettier)

- 100-char line width, 2-space indent, no tabs.
- Single quotes, semicolons, trailing commas everywhere.

## Naming

| Element | Convention | Example |
|---|---|---|
| Backend file / folder | kebab-case | `rss-parse.activity.ts` |
| Class / Interface / Type | PascalCase | `RssParserService`, `ExtractedVacancy` |
| Enum | PascalCase | `Seniority` |
| Enum value | SCREAMING_SNAKE_CASE | `WORK_FORMAT_REMOTE` |
| Function / method / variable | camelCase | `extractVacancy()` |
| Module-level constant | SCREAMING_SNAKE_CASE | `MAX_RETRIES` |
| DB table | snake_case (plural) | `rss_records` |
| DB column | snake_case | `created_at` |
| Foreign key column | `<referenced>_id` | `source_id` |

## TypeScript

### No `any` ever
`any` defeats the type system. Define the real type — a service return, a DTO, a generated type.

### Don't reach for `unknown` to silence the checker
Allowed only in:
- Implicit `catch (err) { … }` — narrow with `instanceof Error` before use.
- True system boundaries (`JSON.parse`, raw HTTP / RSS payloads). Convert to a real type within 1–2 lines using a parser (Zod, BAML SAP, type guard).

### No unnecessary casts
`as T` and `as unknown as T` are last resorts. If the source type is wrong, fix it. Treat existing casts as bugs to remove, not patterns to copy.

### Reuse types — hard rule
Before declaring a new interface / type / enum / string-literal union, grep for an existing one. Inline shapes count as duplicates. Narrow with `Pick<…>` / `Omit<…>` / `Partial<…>` instead of redeclaring.

### `const` over `let`
Use `let` only when reassignment is real.

### No magic numbers in logic
`if (count > 12)` → extract `const SUMMARIZATION_THRESHOLD = 12`. Layout dimensions (component-local heights / paddings) don't count.

## Imports

Group with a blank line between:

1. Node built-ins (`node:fs/promises`, `path`)
2. External packages (NestJS first, then alphabetical)
3. Internal absolute (`@metahunt/...`, `src/...`)
4. `..` parent
5. `./` siblings
6. Side-effect / styles last

## Comments

Default: don't write one. Add only when the *why* is non-obvious — a hidden constraint, a bug workaround, a subtle invariant. If removing the comment wouldn't confuse the next reader, don't write it.

Don't write:

- What the code does (well-named identifiers do that).
- History / "removed in PR #123" / "now lives in X" — belongs in the PR description, rots in code.
- Notes about what the code is *not* doing.

JSDoc: only on complex public functions. Skip simple ones.

`TODO(name)` and `FIXME` are fine — leave a name and the reason.

## Code structure

- Early returns over deep nesting; keep the happy path at primary indentation.
- Ternary / `??` over `if/else` for trivial assignments.
- Destructure parameters, especially with defaults: `function f({ page = 1, limit = 10 })`.
- `as const` for literal-typed config; `satisfies T` when you also want type-checking against an interface.

## React (when frontend exists)

- Never use array index as `key` — use a stable id.
- All hook deps in `useEffect` / `useCallback` / `useMemo`.
- No `console.log` in committed code.
- No inline arrow handlers in JSX — extract `const handleX = useCallback(…)`. If the handler needs an argument, use a curried factory: `const handleDelete = (id: string) => () => onDelete(id)`.
- Don't define components inside other components.

## Pre-commit checklist

- Lint passes.
- No `any`, no lazy `unknown`, no unnecessary casts.
- No duplicate types — grep first, declare second.
- No magic numbers in logic.
- Imports ordered.
- No `console.log` left behind.
- Hook deps complete; no array-index keys; no inline JSX handlers.
- Meta / history comments removed.
