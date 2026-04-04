const databaseUrl =
  process.env.DATABASE_URL
  ?? 'postgres://postgres:postgres@127.0.0.1:5432/authfn_examples_multi_region_routing';

export default {
  adapter: {
    type: 'drizzle',
    drizzle: {
      dialect: 'postgres',
      connectionString: databaseUrl
    }
  },
  libraries: ['./src/auth.schema.ts'],
  migrationsDir: './drizzle'
};
