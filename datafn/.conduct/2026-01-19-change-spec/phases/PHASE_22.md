## Phase goal

Support extension contexts by shipping an RPC transport that forwards DFQL calls and subscriptions to a background-owned runtime using the canonical RPC envelope.

---

## In scope

- Define RPC request/response/event envelope types (EXT-001).
- Implement an in-memory bus transport for tests.
- Implement a browser-extension transport adapter (Chrome/Firefox messaging) behind the same interface (API only; e2e optional).

## Out of scope

- Extension UI integration (Svelte/React) beyond transport.

---

## Deliverables (files to create/modify)

Add:
- `superfunctions/datafn/client/src/extension/rpc.ts`
- `superfunctions/datafn/client/src/extension/transport.ts`
- `superfunctions/datafn/client/__tests__/extension-rpc.test.ts`

---

## Requirements covered

- EXT-001

---

## Implementation tasks

- [ ] Implement canonical RPC envelopes from `SPEC.md`:
  - [ ] `DatafnRpcRequest`, `DatafnRpcResponse`, `DatafnRpcEvent`
- [ ] Implement in-memory test bus:
  - [ ] Request/response correlation by `id`
  - [ ] Deterministic event forwarding for subscriptions
- [ ] Implement transport interface compatible with `DatafnRemoteAdapter`:
  - [ ] query/mutation/transact/seed/clone/pull/push forwarding
- [ ] Add tests implementing:
  - [ ] `TV-EXT-001`, `TV-EXT-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- Extension RPC vectors pass exactly.

---

## Stop condition

Report:
- RPC transport exists and forwards DFQL calls using the canonical envelope with deterministic errors.

