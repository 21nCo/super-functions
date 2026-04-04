import { defineConfig } from 'drizzle-kit';
import { config as loadEnv } from 'dotenv';

loadEnv();

const databaseUrl =
  process.env.DATABASE_URL
  ?? 'postgres://postgres:postgres@127.0.0.1:5432/authfn_examples_account_settings';

export default defineConfig({
  schema: './src/db/generated/authfn-schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
    ssl: false
  }
});
