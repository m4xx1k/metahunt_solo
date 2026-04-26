import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './libs/database/src/schema/index.ts',
  out: './libs/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://metahunt:metahunt@localhost:54322/metahunt',
  },
  strict: true,
  verbose: true,
});
