# PHASE_10: Extension RPC and Documentation Fixes

## Phase Goal

Fix extension RPC subscription event delivery to include subscriptionId, and correct all README documentation mismatches with implemented APIs.

## In Scope

- Extension RPC subscriptionId delivery in events
- core/README.md: DatafnError correction (interface, not class)
- client/README.md: DFQL "filters" key (not "where")
- server/README.md: Correct capability strings
- svelte/README.md: Complete createDatafnClient example
- Deterministic RPC IDs (remove Math.random, covered in PHASE_15)

## Out of Scope

- Extension RPC protocol changes beyond subscriptionId
- New documentation features
- API changes

## Deliverables

- `client/src/extension/transport.ts` - Fix subscriptionId delivery
- `core/README.md` - Corrected DatafnError description
- `client/README.md` - Corrected DFQL examples
- `server/README.md` - Corrected capability strings
- `svelte/README.md` - Complete example
- `client/src/extension/__tests__/rpc.test.ts` - RPC tests

## Requirements Covered

- **EXT-001**: Subscription event subscriptionId delivery (P1)
- **DOCS-001**: Core README DatafnError correction (P1)
- **DOCS-002**: Client README DFQL filters key (P1)
- **DOCS-003**: Server README capabilities (P1)
- **DOCS-004**: Svelte README createDatafnClient example (P1)

## Implementation Tasks

### Extension RPC Fix

- [x] Review client/src/extension/transport.ts event forwarding
- [x] Update event message structure:
  - [x] Background runtime emits: `{ type: "event", subscriptionId, event }`
  - [x] Transport forwards to content/sidepanel with subscriptionId
  - [x] Consumer receives: `{ subscriptionId, event }`
- [x] Update subscription tracking to store subscriptionId
- [x] Write test in client/src/extension/__tests__/rpc.test.ts:
  - [x] Event includes subscriptionId
  - [x] Multiple subscriptions deliver correct subscriptionId per event

### Documentation Fixes

- [x] Update core/README.md:
  - [x] Change "DatafnError class" to "DatafnError interface"
  - [x] Document shape: `{ code, message, details: { path, ...} }`
  - [x] Remove any "new DatafnError(...)" examples
  - [x] Add interface example
- [x] Update client/README.md:
  - [x] Find all query examples
  - [x] Replace "where" with "filters"
  - [x] Replace "update" operation with "merge"
  - [x] Ensure all examples use canonical DFQL keys
  - [x] Add event filter examples (action, fields, contextKeys)
- [x] Update server/README.md:
  - [x] Update capability strings to: ["dfql.query", "dfql.mutation", "dfql.transact", "sync.seed", "sync.clone", "sync.pull", "sync.push"]
  - [x] Document `/datafn/status` response shape
  - [x] Ensure config examples match actual API
- [x] Update svelte/README.md:
  - [x] Add complete example at top:
    ```typescript
    import { createDatafnClient } from '@datafn/client';
    import { toSvelteStore } from '@datafn/svelte';
    
    const client = createDatafnClient({
      schema,
      remote: httpRemote({ baseUrl: '/api' })
    });
    
    const signal = client.tasks.signal({
      filters: { status: 'active' }
    });
    
    const store = toSvelteStore(signal);
    
    // In Svelte component:
    // {#each $store.data as task}
    //   <div>{task.title}</div>
    // {/each}
    ```
  - [x] Ensure no manual signal construction needed

## Verification Steps

### Automated Tests

```bash
# Run extension RPC tests
npm test client/src/extension/__tests__/rpc.test.ts

# Expected: All tests pass, subscriptionId delivered
```

### Manual Verification - Extension RPC

```javascript
// Background runtime
const client = createDatafnClient({ schema, remote });
const subscriptionId1 = client.subscribe((event) => {
  console.log('Sub 1:', event);
});
const subscriptionId2 = client.subscribe((event) => {
  console.log('Sub 2:', event);
});

// Content script via RPC transport
const events = [];
transport.onMessage((msg) => {
  if (msg.type === 'event') {
    events.push(msg);
    console.log('Received event with subscriptionId:', msg.subscriptionId);
  }
});

// Trigger mutation in background
await client.tasks.mutate({ operation: 'insert', /* ... */ });

// Verify: events array contains subscriptionId for each subscription
console.log('Events:', events);
// Expected: [
//   { type: 'event', subscriptionId: '<sub-1-id>', event: { ... } },
//   { type: 'event', subscriptionId: '<sub-2-id>', event: { ... } }
// ]
```

### Manual Verification - Documentation

```bash
# Review each README file manually
# Check:
# 1. core/README.md: DatafnError is interface, not class
# 2. client/README.md: All examples use "filters" (not "where")
# 3. client/README.md: All examples use "merge" (not "update")
# 4. server/README.md: Capability strings match implementation
# 5. svelte/README.md: Complete createDatafnClient example present

# Expected: All documentation accurate
```

### Test Vectors Verification

Run test vectors:
- TV-EXT-SUB-ID-001
- TV-EXT-SUB-MULTI-001
- TV-DOCS-CORE-001 (manual check)
- TV-DOCS-CLIENT-001 (manual check)
- TV-DOCS-SERVER-001 (manual check)
- TV-DOCS-SVELTE-001 (manual check)

Expected: All vectors pass (automated for EXT, manual for DOCS)

## Stop Condition

Report completion when:
1. ✅ Extension RPC tests pass with subscriptionId delivery
2. ✅ Manual verification confirms subscriptionId in events
3. ✅ All 4 README files reviewed and corrected
4. ✅ Test vectors TV-EXT-* pass
5. ✅ Documentation review confirms 100% accuracy
6. ✅ No regressions in existing extension/client tests

**Estimated Duration**: 1-2 days

**Dependencies**: None (independent fixes)

**Blocks**: None (documentation and RPC fixes)
