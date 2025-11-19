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
