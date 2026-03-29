# DataFn Sharing App Example

This example demonstrates DataFn sharing semantics in a deterministic multi-actor, multi-workspace setup.

## Model

- **Workspace -> Namespace**
  - `acme` -> `org:acme`
  - `globex` -> `org:globex`
- **Actor**
  - Selected with demo session controls (`user:alice`, `user:bob`, `user:charlie`)
  - Server derives actor from demo headers on every request
- **Principals**
  - User principals: `user:*`
  - Team principal: `team:design`
- **Deterministic reset**
  - `POST /demo/reset` reseeds baseline docs, memberships, and grants
  - Used by manual walkthroughs and Playwright tests

## Prerequisites

- Node 18+

## Install

```bash
npm --prefix datafn/examples/sharing-app install
npm --prefix datafn/examples/sharing-app/client install
npm --prefix datafn/examples/sharing-app/server install
```

Install Playwright browser (once):

```bash
npm --prefix datafn/examples/sharing-app exec playwright install chromium
```

## Run (manual)

Start server:

```bash
npm --prefix datafn/examples/sharing-app run dev:server
```

Start client (separate terminal):

```bash
npm --prefix datafn/examples/sharing-app run dev:client
```

Open client URL shown by Vite (default `http://localhost:5173`).

## Reset Baseline

From terminal:

```bash
curl -X POST http://localhost:3001/demo/reset \
  -H 'content-type: application/json' \
  -d '{"scenario":"baseline"}'
```

Or in UI, use **Reset baseline + resync**.

## Playwright E2E

Run from example root:

```bash
npm --prefix datafn/examples/sharing-app run test:e2e
```

The suite starts server and client preview automatically and runs deterministic scenarios without external services.

## Walkthrough

1. **Record share lifecycle**
   - Alice shares `doc:acme-private-alice` to Bob as `viewer`
   - Bob can read but save fails with `FORBIDDEN`
   - Alice upgrades Bob to `editor`; Bob can save, but cannot reshare
   - Alice unshares Bob; Bob pulls and document disappears

2. **Team scope grant + isolation**
   - In `acme`, Alice grants `team:design` scope viewer
   - Bob gains visibility to covered records, Charlie does not
   - Switching Bob to `globex` shows only `globex` records

3. **Two-context sync flow**
   - Alice creates and shares a historical document to Bob
   - Bob clicks **Pull now** and receives backfill
   - Alice revokes Bob; Bob pulls and record is removed

## Notes

- Cross-workspace share attempts are deterministically denied in this demo (`DEMO_CROSS_WORKSPACE_DENIED`).
- The app is intentionally scoped for teaching DataFn sharing modeling and deterministic testing.
