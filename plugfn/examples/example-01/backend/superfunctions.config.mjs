const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres@localhost:6432/plugfn_example_01';

export default {
  adapter: {
    type: 'drizzle',
    drizzle: {
      dialect: 'postgres',
      connectionString: databaseUrl,
    },
  },
  libraries: ['./src/plugfn.ts'],
  migrationsDir: './drizzle',
};
