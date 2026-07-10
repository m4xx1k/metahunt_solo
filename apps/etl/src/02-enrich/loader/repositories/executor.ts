import type { DrizzleDB } from "@metahunt/database";

// Either the root db handle or an in-flight transaction. Repository write
// methods accept an Executor so a caller (VacancyLoaderService) can compose
// several writes into one atomic unit of work. Derived from the transaction
// callback's parameter so it tracks the Drizzle version automatically.
export type Executor = DrizzleDB | Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];
