# Design — how to structure code

Three lenses on the same goal: code that's easy to change.

## SOLID — the one-liners

| | Question to ask | What it buys |
|---|---|---|
| **S**RP | "Can I name this without `and`?" | One reason to change. |
| **O**CP | "Can I add a new variant without editing this file?" | Extend without breaking callers. |
| **L**SP | "Does the subtype keep every promise the parent makes?" | Substitutable abstractions. No `throw 'not supported'` in subclasses. |
| **I**SP | "Do implementers leave methods empty / throw?" | Small, focused interfaces. |
| **D**IP | "Does business logic import a vendor SDK directly?" | Domain depends on abstractions; infra implements. |

In practice in this repo: one provider token (`VACANCY_EXTRACTOR`) with multiple impls (BAML, placeholder) is DIP + OCP + ISP at once. Use that shape when you have ≥2 real impls or a real test seam — not "just in case".

## Simplicity — DRY / KISS / YAGNI

**DRY is about knowledge, not lines.** Same business rule in two files = bug. Two unrelated DTOs that happen to share three fields = leave them alone.

**Rule of three.** First time: write it inline. Second time: note the duplication. Third time: extract.

**KISS.** The simplest solution that works is usually best. Don't reach for a pattern because you know it. Three similar lines beats a premature abstraction.

**YAGNI.** Build for today. Speculative options, configurability "just in case", future-proof abstractions — all costs you pay forever for value that may never arrive.

YAGNI does NOT cover: tests, error handling, types, naming. Those are needed *now*.

When principles collide, the priority order:

1. Working > perfect
2. Readable > clever
3. Simple > flexible
4. Tested > clean-but-untested

## Anti-patterns to recognize

| Smell | Symptom | Fix |
|---|---|---|
| **God class** | 500+ lines, 20+ methods, 10+ deps | Split by responsibility. |
| **Circular dep** | `A → B → A`, runtime import errors | Events, or extract a third shared module. |
| **Feature envy** | Method calls many getters on another object | Move logic to where the data lives. |
| **Shotgun surgery** | Adding a field touches 10 files | Centralize the schema; derive DTOs (`Pick<>`, `Partial<>`, BAML class). |
| **Copy-paste** | Same logic in N files, bugs fixed unevenly | Extract a shared utility — after rule of three. |
| **Premature optimization** | Cache layers around 2ms queries | Measure first; add caching when profiling proves it. |
| **Magic numbers / strings** | `setTimeout(fn, 86400000)`, `status === 'pending'` everywhere | Named constants, enums. |
| **Deep nesting** | 4+ indent levels | Early returns + extracted functions. |
| **Boolean blindness** | `fn(true, false, true)` at the call site | Options object or separate functions (`ingestRemote()` / `ingestAll()` instead of `ingest(remoteOnly: boolean)`). |
| **`await` in loops** | `for (x of xs) { await op(x); }` when iterations are independent | `await Promise.all(xs.map(op))`. Sequential is correct only inside transactions or when later iterations depend on earlier ones. |
| **Anonymous JSX handlers** | `onClick={() => fn(id)}` | Named `useCallback` handler; curried factory if you need an argument. |
| **Redundant if-blocks** | `if (a) return x; else return y` | Ternary or `??`. |

## When to apply, when to step back

- **New code**: design with these in mind from the start.
- **Refactoring**: use them as a guide for what to clean up.
- **Don't over-engineer**: SOLID is a guide, not a religion. Simple code that does one thing doesn't need an interface and a factory.
- **Start simple**: begin with a direct implementation, refactor toward abstractions when complexity demands it.
