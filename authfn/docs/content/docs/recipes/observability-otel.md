---
title: OpenTelemetry instrumentation
description: Wire authfn's observability events into OpenTelemetry spans for full distributed tracing.
---

# OpenTelemetry instrumentation

## Goal

Every authfn event becomes a span event on the active OpenTelemetry trace.

## Setup

```ts
import { trace } from '@opentelemetry/api';

createAuthFn({
  // ...
  observability: {
    emit(event) {
      const span = trace.getActiveSpan();
      if (!span) return;
      span.addEvent(event.type, {
        'authfn.requestId': event.requestId,
        'authfn.userId': event.userId,
        'authfn.regionId': event.regionId,
        'authfn.outcome': event.outcome,
        ...flatten(event.metadata ?? {}),
      });
    },
  },
});

function flatten(obj: Record<string, unknown>, prefix = 'authfn.metadata'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[`${prefix}.${k}`] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}
```

## With request id correlation

Use `event.requestId` as a tag on every span event so you can correlate in your tracing UI even when spans are wide:

```ts
span.setAttribute('authfn.requestId', event.requestId);
```

If you want a *new span* per authfn event (instead of an event on the existing one), wrap the emission:

```ts
const tracer = trace.getTracer('authfn');
observability: {
  async emit(event) {
    await tracer.startActiveSpan(event.type, async (span) => {
      span.setAttribute('authfn.requestId', event.requestId);
      span.setAttribute('authfn.userId', event.userId ?? '');
      span.end();
    });
  },
}
```

## Performance note

`emit` runs in the request path. Span events are essentially free (they're attached to the active span). Starting new spans is more expensive — only do that if you need separate timing.

## Related

- [Concepts → Observability](../core-concepts/observability)
