# botfn monorepo

[![Tests](https://github.com/21nOrg/botfn/actions/workflows/test.yml/badge.svg)](https://github.com/21nOrg/botfn/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/21nOrg/botfn/branch/main/graph/badge.svg)](https://codecov.io/gh/21nOrg/botfn)

Turborepo-based monorepo for bot implementations with platform-agnostic architecture.

## structure

```
.
├── bots/
│   └── discord-bot/          # Discord bot with GitHub and Linear integration
│   └── [more bots...]        # Additional bot implementations
├── packages/
│   ├── discord-core/         # Discord-specific utilities and verification
│   ├── github-integration/   # GitHub API helpers
│   ├── linear-integration/   # Linear API helpers
│   └── shared-types/         # Shared TypeScript types and Zod schemas
├── AGENTS.md                 # Architecture documentation
├── package.json              # Root workspace config
└── turbo.json                # Turborepo pipeline config
```

## getting started

### install dependencies

```bash
npm install
```

### develop a bot

```bash
cd bots/discord-bot
npm run dev
```

### build all packages

```bash
npm run build
```

## npm package boundaries

The shared-types, discord-core, github-integration and linear-integration
packages ship compiled ESM with TypeScript declarations. Their builds and tests
use package-local compiler settings and declared test dependencies; they do not
resolve sibling workspace source.

The Discord bot's minimum npm prerequisite set is:

- `@superfunctions/botfn-shared-types`
- `@superfunctions/botfn-discord-core`
- `@superfunctions/botfn-github-integration`
- `@superfunctions/botfn-linear-integration`
- `@superfunctions/botfn-persistence-service`

These five foundations have no dependencies on each other and may be released in
any order before installing or releasing `@superfunctions/botfn-discord-bot`. Slack core is
independent of the Discord closure and exports both ESM and CommonJS.

Run `npm install --workspaces=false`, `npm run build`, `npm test` and
`npm pack --dry-run` from an isolated copy of each package to check its release
boundary. Build before packing: npm exports point at `dist`, not TypeScript source.
Use `@superfunctions/botfn-persistence-service/client` for the public persistence client;
deep imports into the package's source tree are not supported.

BotFn's npm libraries live in the controlled `@superfunctions` organization.
The npm user scope `@botfn` belongs to an unrelated account; old namespace
references and release slugs are removed, not retained as aliases.


## testing

This repository has comprehensive test coverage using Vitest:

- **119 tests** across 4 packages
- **Unit tests** for core functionality
- **Integration tests** with MSW for API mocking  
- **CI/CD** integration with GitHub Actions

Run tests:
```bash
npm test                 # Run all tests
npm run test:coverage    # With coverage report
```

See [TESTING.md](./TESTING.md) for detailed testing guidelines.

## architecture

See [AGENTS.md](./AGENTS.md) for detailed architecture documentation.

### key principles

- **Platform-agnostic core logic**: Business logic in `core.ts` is reusable across platforms
- **Multi-platform deployment**: Deploy to Cloudflare Workers, Digital Ocean, Vercel, etc.
- **Shared packages**: Common utilities and types in workspace packages
- **Type-safe validation**: Zod schemas for runtime validation
- **Monorepo tooling**: Turborepo for efficient builds and caching

## technology stack

- **Framework**: [Hono](https://hono.dev/)
- **Validation**: [Zod](https://zod.dev/)
- **Monorepo**: [Turborepo](https://turbo.build/)
- **Runtime**: Cloudflare Workers, Node.js (adaptable)

## adding a new bot

1. Create bot directory: `mkdir -p bots/my-bot/src`
2. Follow the structure in [AGENTS.md](./AGENTS.md)
3. Create `core.ts` with business logic
4. Create platform-specific entry points (e.g., `index.cloudflare.ts`)
5. Add workspace dependencies to `package.json`

## deployment

Each bot can be deployed independently:

### Cloudflare Workers

```bash
cd bots/discord-bot
npm run deploy
```

### other platforms

See [AGENTS.md](./AGENTS.md) for Digital Ocean and Vercel deployment guides.
