# @metahunt/database

Shared `@Global()` Nest module for Postgres access via Drizzle ORM.

## Build

```bash
pnpm --filter @metahunt/database build         # tsc -p tsconfig.json
pnpm --filter @metahunt/database build:watch   # tsc -w
```

Output: `libs/database/dist/`. The package's `main` field points at `dist/index.js`, so consumers always resolve compiled code, not sources.

## Public surface

| Export | Type | Purpose |
|---|---|---|
| `DatabaseModule` | NestJS module (`@Global()`) | Import once in app root, provides a Drizzle DB instance. |
| `DRIZZLE` | DI token (`Symbol`) | Inject via `@Inject(DRIZZLE)` to get typed `DrizzleDB`. |
| `DrizzleDB` | Type alias | Typed `NodePgDatabase` with this package schema. |
| `schema` | namespace export | Drizzle tables (`sources`, `rss_ingests`, `rss_records`). |

## Consume from another workspace

```json
"dependencies": { "@metahunt/database": "workspace:*" }
```

```ts
import { DatabaseModule, DRIZZLE, type DrizzleDB } from "@metahunt/database";
```

Because `DatabaseModule` is `@Global()`, import it once in your app root module. Then inject `DRIZZLE` in any provider/controller.

## DB workflow from repo root

```bash
pnpm db:up         # docker compose up -d db
pnpm db:migrate    # apply migrations from libs/database/migrations
pnpm db:seed       # seed reference rows
pnpm db:generate   # generate a new migration from schema changes
```

## Migration rule

- Change schema in `libs/database/src/schema/*`.
- Generate migration with `pnpm db:generate`.
- Commit generated SQL and matching `migrations/meta/*` snapshot together.
- Do not manually drop `.sql` into `migrations/` without corresponding meta updates.

## Docs

Engineering docs live at the repo root in `/docs/`. See [`/docs/architecture/overview.md`](../../docs/architecture/overview.md) for how this lib fits into the monorepo.
