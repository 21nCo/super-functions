# @superfunctions/cli

Command-line tool for managing Superfunctions library schemas and migrations.

## Installation

```bash
npm install @superfunctions/cli --save-dev

# Plus your ORM of choice (peer dependencies)
npm install drizzle-orm         # For Drizzle
npm install @prisma/client      # For Prisma  
npm install kysely              # For Kysely
```

---

## For Downstream Users (Using Superfunctions Libraries)

### Quick Start

#### 1. Initialize Your Libraries

Configure your libraries once in your application code:

```typescript
// src/conduct.ts
import { createConductBackend } from 'conduct';
import { adapter } from './db';

export const conduct = createConductBackend({
  database: adapter,
  storage: s3Storage,
  
  // Schema customizations
  additionalFields: {
    project: {
      department: { type: 'string', required: false },
      priority: { type: 'number', required: false },
    }
  },
  
  plugins: [
    conductAuditPlugin(),
  ]
});
```

```typescript
// src/auth.ts
import { createAuthFn } from '@superfunctions/authfn';
import { adapter } from './db';

export const auth = createAuthFn({
  database: adapter,
  
  additionalFields: {
    user: {
      role: { type: 'string', required: true },
      department: { type: 'string', required: false },
    }
  },
  
  plugins: [
    authFnTwoFactorPlugin(),
  ],
});
```

#### 2. Configure CLI

Create `superfunctions.config.js`:

**Option A: Explicit file paths (recommended for production)**

```javascript
import { defineConfig } from '@superfunctions/cli';

export default defineConfig({
  adapter: {
    type: 'drizzle',
    drizzle: {
      dialect: 'postgres',
      connectionString: process.env.DATABASE_URL,
    }
  },
  
  // Point to files that initialize libraries
  libraries: [
    './src/conduct.ts',
    './src/auth.ts',
  ],
  
  migrationsDir: './migrations',
});
```

**Option B: Auto-discovery (good for small projects/prototyping)**

```javascript
import { defineConfig } from '@superfunctions/cli';

export default defineConfig({
  adapter: {
    type: 'drizzle',
    drizzle: {
      dialect: 'postgres',
      connectionString: process.env.DATABASE_URL,
    }
  },
  
  // Auto-discover initialization files
  autoDiscover: true,  // Scans src/, lib/, server/, app/ directories
  
  migrationsDir: './migrations',
});
```

**Option C: Custom auto-discovery patterns**

```javascript
import { defineConfig } from '@superfunctions/cli';

export default defineConfig({
  adapter: { /* ... */ },
  
  // Custom patterns
  autoDiscover: {
    patterns: [
      'src/**/*.ts',
      'api/**/*.ts',
    ],
    exclude: [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/examples/**',
    ]
  },
  
  migrationsDir: './migrations',
});
```

#### 3. Generate Migrations

```bash
npx superfunctions generate
```

**Output:**
```
🔍 Parsing library initialization files...
   ✅ ./src/conduct.ts: Found 1 initialization(s)
   ✅ ./src/auth.ts: Found 1 initialization(s)

📦 Found 2 library initialization(s):
   - conduct (createConductBackend)
   - authfn (createAuthFn)

📖 Processing conduct...
   ✅ Generated schema (v1, 8 tables)

📖 Processing authfn...
   ✅ Generated schema (v1, 4 tables)

💾 Writing migration files...
   ✅ ./migrations/1234567890_conduct_v1.sql
   ✅ ./migrations/1234567891_authfn_v1.sql

✨ Generated 2 migration file(s)

💡 Next steps:
   1. Review the generated migration files
   2. Apply migrations using your ORM tool:
      npx drizzle-kit push
```

#### 4. Apply Migrations

Use your ORM tool to apply migrations:

```bash
npx drizzle-kit push
# or
npx prisma migrate deploy
# or  
npx kysely migrate latest
```

### Benefits of This Approach

✅ **Single source of truth**: Configure libraries once in your app code  
✅ **No duplication**: CLI reads from your actual initialization  
✅ **Type safety**: Full IDE autocomplete and type checking  
✅ **Less boilerplate**: No separate `*.config.ts` files needed  

---

## For Library Authors (Building with @superfunctions/db)

If you're building a library that uses `@superfunctions/db` adapter, you need to export a `getSchema` function for CLI integration.

### Required Export

```typescript
// your-library/src/schema/index.ts
import type { TableSchema } from '@superfunctions/db';

export interface YourLibraryConfig {
  // Your library's config structure
  additionalFields?: Record<string, Record<string, FieldDefinition>>;
  plugins?: Plugin[];
  // ... other options
}

/**
 * Generate schema from config
 * This is called by @superfunctions/cli to generate migrations
 */
export function getSchema(config: YourLibraryConfig = {}): {
  version: number;
  schemas: TableSchema[];
} {
  const baseSchema = getBaseSchema(config);
  const pluginSchemas = getPluginSchemas(config);
  
  return {
    version: 1,  // Increment when schema changes
    schemas: [
      ...baseSchema,
      ...pluginSchemas,
    ],
  };
}

function getBaseSchema(config: YourLibraryConfig): TableSchema[] {
  return [
    {
      modelName: 'your_table',
      fields: {
        id: { type: 'number', required: true },
        name: { type: 'string', required: true },
        ...config.additionalFields?.your_table,  // Apply custom fields
      },
    },
    // ... more tables
  ];
}

function getPluginSchemas(config: YourLibraryConfig): TableSchema[] {
  if (!config.plugins || config.plugins.length === 0) {
    return [];
  }
  
  const schemas: TableSchema[] = [];
  for (const plugin of config.plugins) {
    if (plugin.schema) {
      // Plugins can contribute additional tables
      schemas.push(...Object.values(plugin.schema));
    }
  }
  return schemas;
}
```

### Export from Main Entry Point

```typescript
// your-library/src/index.ts

// Runtime exports
export { createYourLibrary } from './main.js';
export type { YourLibraryConfig } from './types.js';

// CLI integration export
export { getSchema } from './schema/index.js';
export type { YourLibraryConfig as YourLibrarySchemaConfig } from './schema/index.js';
```

### Add Package Metadata

Add `superfunctions` metadata to your `package.json`:

```json
{
  "name": "@your-org/your-library",
  "version": "1.0.0",
  
  "superfunctions": {
    "initFunction": "createYourLibrary",
    "schemaVersion": 1
  },
  
  "exports": {
    ".": "./dist/index.js"
  }
}
```

**Fields:**
- `initFunction` (required): Name of your library's initialization function
- `schemaVersion` (optional): Current schema version number

The CLI will automatically discover your library by scanning `node_modules` for packages with this metadata. **No registration with the CLI repo needed!**

### Plugin Schema Support

Plugins can add their own tables:

```typescript
// Plugin example
export function yourLibraryAuditPlugin() {
  return {
    name: 'audit',
    schema: {
      audit_log: {
        modelName: 'audit_logs',
        fields: {
          id: { type: 'number', required: true },
          entity_type: { type: 'string', required: true },
          entity_id: { type: 'string', required: true },
          action: { type: 'string', required: true },
          user_id: { type: 'string', required: false },
          timestamp: { type: 'date', required: true },
          changes: { type: 'json', required: false },
        },
      },
    },
    // ... plugin logic
  };
}
```

When users enable the plugin in their config:

```typescript
createYourLibrary({
  plugins: [
    yourLibraryAuditPlugin(),
  ]
});
```

The CLI will automatically include the audit_logs table in the generated migrations.

---

## CLI Commands

### `generate [library]`

Generate migration files from schema diffs.

```bash
# Generate for all libraries
npx superfunctions generate

# Generate for specific library
npx superfunctions generate conduct

# Dry run (preview without writing)
npx superfunctions generate --dry-run
```

### `status`

Check current schema versions and migration status.

```bash
npx superfunctions status
```

**Output:**
```
📊 Schema Status

Library: conduct
  Current version: 1
  Latest version: 1
  Status: ✅ Up-to-date

Library: authfn
  Current version: 0
  Latest version: 1
  Status: ⚠️  Needs migration
```

### `validate`

Validate configuration file structure.

```bash
npx superfunctions validate
```

---

## How It Works

### High-Level Flow

1. **Parse initialization files**: CLI reads files specified in `libraries` array
2. **Extract configs**: Uses TypeScript AST parser to extract library initialization calls and their configs
3. **Generate schemas**: For each library, calls `libraryPackage.getSchema(extractedConfig)`
4. **Introspect database**: Connects to database and reads current schema
5. **Diff schemas**: Compares desired schema with current state
6. **Generate migrations**: Creates ORM-specific SQL migration files
7. **Track versions**: Stores schema versions in database for tracking

### What Gets Parsed

The CLI can extract configs from:

✅ **Object literals**
```typescript
createLibrary({
  additionalFields: { ... },
  plugins: [ ... ]
});
```

✅ **Variable references**
```typescript
const config = { ... };
createLibrary(config);
```

✅ **Spread operators**
```typescript
const baseConfig = { ... };
createLibrary({ ...baseConfig, plugins: [ ... ] });
```

✅ **Plugin function calls**
```typescript
plugins: [
  conductAuditPlugin(),
  conductMetricsPlugin({ ... })
]
```

⚠️ **Runtime values are marked as `undefined`**
```typescript
// These cannot be evaluated statically:
connectionString: process.env.DATABASE_URL  // → undefined
name: `${prefix}_table`  // → undefined
```

**Workaround**: Keep database/storage/auth in runtime config, keep schema customizations as static objects.

---

## Adapter Support

### Drizzle

```javascript
export default defineConfig({
  adapter: {
    type: 'drizzle',
    drizzle: {
      dialect: 'postgres',  // or 'mysql', 'sqlite'
      connectionString: process.env.DATABASE_URL,
    }
  },
});
```

Generated migrations work with `drizzle-kit push`.

#### Conduct schema fallback for composite unique + CHECK constraints

When a downstream app needs schema details not yet represented in generated output, use a direct Drizzle schema module and import it next to your generated schema.

This fallback is the supported path for Conduct's required constraints:

- Composite unique key on `spec_id` + `phase_number`
- CHECK constraint on `status` (`pending | in_progress | complete | failed | blocked`)

```typescript
import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

export const conductSpecs = pgTable(
  'conduct_specs',
  {
    id: text('id').notNull(),
    specId: text('spec_id').notNull(),
    phaseNumber: integer('phase_number').notNull(),
    status: text('status').notNull(),
  },
  (table) => ({
    specPhaseUnique: uniqueIndex('conduct_specs_spec_phase_unique').on(table.specId, table.phaseNumber),
    statusCheck: check(
      'conduct_specs_status_check',
      sql`${table.status} in ('pending','in_progress','complete','failed','blocked')`
    ),
  })
);
```

The repository includes a local harness proving this path in `packages/cli/src/__tests__/conduct-schema-fallback.test.ts`.

### Prisma

```javascript
export default defineConfig({
  adapter: {
    type: 'prisma',
    prisma: {
      // Prisma client instance will be used
    }
  },
});
```

Generated migrations work with `npx prisma migrate deploy`.

### Kysely

```javascript
export default defineConfig({
  adapter: {
    type: 'kysely',
    kysely: {
      dialect: 'postgres',  // or 'mysql', 'sqlite'
      connectionString: process.env.DATABASE_URL,
    }
  },
});
```

Generated migrations work with `npx kysely migrate latest`.

---

## Troubleshooting

### No library initializations found

**Problem**: CLI can't find library initialization calls in your files.

**Solution**: 
- Make sure files are specified correctly in `libraries` array
- Verify function names match registry (e.g., `createConductBackend`, not `initConduct`)
- Check that initialization calls are at the top level (not inside functions/conditions)

### Cannot extract config

**Problem**: Config uses complex expressions that can't be statically analyzed.

**Solution**:
```typescript
// Instead of:
const conduct = createConductBackend(getConfig());

// Do this:
export const conductConfig = {
  additionalFields: { ... },
  plugins: [ ... ]
};
export const conduct = createConductBackend({
  database: adapter,
  ...conductConfig
});
```

### Library doesn't export getSchema

**Problem**: Library hasn't integrated with CLI yet.

**Solution**: Contact library maintainer or see "For Library Authors" section to add support.

---

## FAQ

### Why not use separate config files like before?

**Problem with separate configs**: Users had to maintain two configs - one for CLI (`conduct.config.ts`) and one for runtime (`app.ts`). This creates duplication and drift risk.

**Solution**: Configure once in your app code. CLI parses those files directly.

### Can I still use separate config files?

Yes, if needed:

```typescript
// conduct.config.ts
export const conductConfig = {
  additionalFields: { ... },
  plugins: [ ... ]
};

// app.ts
import { conductConfig } from './conduct.config';
export const conduct = createConductBackend({
  database: adapter,
  ...conductConfig
});
```

Point CLI to `app.ts` - it will resolve the import and extract the config.

### How does the CLI discover libraries?

The CLI scans `node_modules` for packages with `superfunctions` metadata in their `package.json`. This allows any library to integrate without needing changes to the CLI itself.

### How does this compare to better-auth?

**better-auth**: Single library, single config  
**superfunctions**: Multiple libraries, need to identify which is which

**Solution**: Point to specific files containing each library's initialization. CLI uses function names (`createConductBackend`, `createAuthFn`) to identify libraries.

### What if I have multiple instances of the same library?

CLI will detect all instances and generate schemas for each. Make sure they use different namespaces to avoid conflicts.

### Can the parser handle TypeScript?

Yes, uses TypeScript compiler API to parse both `.ts` and `.js` files.

### What about JavaScript projects?

Works with JavaScript too. Just point to `.js` files in `libraries` array.

### Should I use explicit paths or auto-discovery?

**Use explicit paths (`libraries`) when:**
- ✅ Production applications
- ✅ Monorepos with multiple packages
- ✅ Complex project structures
- ✅ Need predictable behavior
- ✅ Want fast CLI performance

**Use auto-discovery (`autoDiscover`) when:**
- ✅ Small/simple projects
- ✅ Prototyping
- ✅ Don't want to maintain file list
- ✅ Standard project structure (src/, lib/, etc.)

**Performance note:** Auto-discovery scans your codebase which can be slow in large projects. Explicit paths are always faster.

---

## Examples

### Full Stack App Example

```
my-app/
├── superfunctions.config.js
├── src/
│   ├── db.ts                    # Database adapter
│   ├── conduct.ts               # Conduct initialization
│   ├── auth.ts                  # AuthFn initialization
│   └── server.ts                # Main app
├── migrations/
│   ├── 1234567890_conduct_v1.sql
│   └── 1234567891_authfn_v1.sql
└── package.json
```

**superfunctions.config.js:**
```javascript
import { defineConfig } from '@superfunctions/cli';

export default defineConfig({
  adapter: {
    type: 'drizzle',
    drizzle: {
      dialect: 'postgres',
      connectionString: process.env.DATABASE_URL,
    }
  },
  libraries: [
    './src/conduct.ts',
    './src/auth.ts',
  ],
  migrationsDir: './migrations',
});
```

**src/db.ts:**
```typescript
import { createDrizzleAdapter } from '@superfunctions/db/drizzle';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

export const adapter = createDrizzleAdapter({ db });
```

**src/conduct.ts:**
```typescript
import { createConductBackend } from 'conduct';
import { adapter } from './db';

export const conduct = createConductBackend({
  database: adapter,
  storage: { /* ... */ },
  
  additionalFields: {
    project: {
      department: { type: 'string', required: false },
      owner: { type: 'string', required: true },
    }
  },
  
  plugins: [
    conductAuditPlugin(),
  ]
});
```

**src/auth.ts:**
```typescript
import { createAuthFn } from '@superfunctions/authfn';
import { adapter } from './db';

export const auth = createAuthFn({
  database: adapter,
  
  additionalFields: {
    user: {
      role: { type: 'string', required: true },
      department: { type: 'string', required: false },
    }
  },
  
  plugins: [
    authFnTwoFactorPlugin(),
  ],
});
```

**src/server.ts:**
```typescript
import express from 'express';
import { toExpressRouter } from '@superfunctions/http-express';
import { conduct } from './conduct';
import { auth } from './auth';

const app = express();

app.use('/api/conduct', toExpressRouter(conduct));
app.use('/api/auth', toExpressRouter(auth));

app.listen(3000);
```

---

## License

MIT
