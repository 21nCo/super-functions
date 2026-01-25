## Phase 12

### Phase goal (1 sentence)

Complete extension-context support by implementing subscribe/unsubscribe and deterministic event forwarding over the canonical RPC envelopes.

### In scope

- Extend the extension RPC protocol implementation to support:
  - subscribe
  - unsubscribe
  - inbound event fanout (`DatafnRpcEvent`)
- Ensure deterministic mapping between subscription requests and delivered events.
- Add tests that validate RPC request/response correlation and event delivery.

### Out of scope

- Any browser-specific service worker lifecycle concerns beyond message handling.

### Deliverables (explicit files/modules)

- Modify: `datafn/client/src/extension/rpc.ts`
- Modify: `datafn/client/src/extension/transport.ts`
- Modify tests:
  - `datafn/client/__tests__/extension-rpc.test.ts`

### Requirements covered

- EXT-001

### Implementation tasks (ordered checklist)

- Define/implement subscribe/unsubscribe methods:
  - subscribe request contains `filter?: DatafnEventFilter`
  - subscribe response returns `subscriptionId`
- Implement event forwarding:
  - background emits `{ type:"event", subscriptionId, event }`
  - transport dispatches to local subscribers
- Ensure correlation and cleanup:
  - unsubscribe stops local delivery
  - transport handles unknown subscriptionId deterministically (ignore or log; specify and test)
- Add tests to validate:
  - request/response envelopes (`TV-EXT-001`)
  - event delivery (`TV-EXT-002`)

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/client
```

Expected outcome:

- All client tests pass.

### Stop condition

Report:

- The final subscribe/unsubscribe API surface exposed to consumers
- Test run result for `@datafn/client`

