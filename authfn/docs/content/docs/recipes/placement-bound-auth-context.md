---
title: Placement-bound auth context
description: Trusted in-process and private-service AuthFn context for regional application data planes.
---

# Placement-bound auth context

Use this contract when a canonical application gateway has already authenticated an AuthFn session and needs a **non-spoofable, placement-bound routing context** for a downstream data plane such as DataFn. AuthFn authenticates and exposes trusted context. It does not mint DataFn tickets, select DataFn URLs, or return a regional AuthFn authority to the browser.

The API is **opt-in**. Public AuthFn routes, cookies, OAuth issuer behavior, and regional table ownership are unchanged. Enable it only in trusted server-side consumer code.

## Trust boundary

| Actor | May see | Must not do |
| --- | --- | --- |
| Browser / native client | Canonical AuthFn authority, cookies, OAuth | Choose a region, carry placement epoch, or learn a regional AuthFn URL |
| Canonical AuthFn / application gateway | Verified session, placement directory, opaque subject | Treat client headers or body fields as region/epoch/subject authority |
| Nucleum (or another consumer) | Immutable context or a short-lived audience-bound assertion | Reconstruct routing from session email, request host, or private internals |
| Regional DataFn cell | Consumer-minted ticket derived from this context | Trust a client-supplied region or an AuthFn internal routing assertion |

Derive subject, home region, and placement epoch **only after** AuthFn session validation succeeds. Strip every incoming `x-authfn-routing-*` header. Ignore client-supplied subject, region, epoch, issuer, and audience values.

## TypeScript

```ts
import {
  createAuthFnPlacementContextIssuer,
  createInMemoryAuthFnPlacementDirectory,
} from '@authfn/multi-region';

const issuer = createAuthFnPlacementContextIssuer({
  config: runtimeConfig,
  publicAuthority: 'https://account.example.com',
  placementDirectory,
  identityKeyForUserId: identityKeys.fromUserId,
  subjectSecret: await secrets.resolve('authfn-placement-subject'),
  audiences: ['nucleum-datafn'],
  keyring, // optional; required only for the signed private-service form
  ttlSeconds: 60,
});

// In-process Nucleum gateway: immutable context after a valid session.
const context = await issuer.derive(request);
const ticket = await datafnTickets.mint({
  subject: context.subject,
  regionId: context.homeRegion,
  epoch: context.placementEpoch,
  audience: 'datafn-sync',
  expiresAt: context.expiresAt,
});

// Same value through a consumer callback.
await issuer.withContext(request, async (context) => {
  return datafnTickets.mint(context);
});

// Private remote consumer: audience-bound assertion, not a browser bearer token.
const { assertion } = await issuer.issueSigned(request);
const verified = remoteIssuer.verifySigned(assertion);
```

The context is frozen and contains:

| Claim | Meaning |
| --- | --- |
| `subject` | HMAC-derived opaque user subject. Stable for the AuthFn user id. |
| `homeRegion` | Authoritative placement region. |
| `placementEpoch` | Placement fence. Downstream grants should copy this. |
| `issuer` | Canonical AuthFn public authority. |
| `sessionBinding` | HMAC of the AuthFn session or API-key id. |
| `sessionVersion` | HMAC of the session `tokenHash` or API-key `secretHash`. Changes if the credential is rotated. |
| `authenticatedAt` | Last authentication time from the regional session record. |
| `issuedAt` / `expiresAt` | Context lifetime. Capped by both `ttlSeconds` and session expiry. |
| `audience` | Consumer allowlist entry such as `nucleum-datafn`. |
| `assurance` | AuthFn methods on the session (`password`, `email-otp`, …). |
| `scopes` | Present for user-owned API keys. |
| `requestId` | Correlation id. |
| `actorType` | `user` or `api-key`. |
| `userId` | Omitted unless `includeUserId: true`. |

Raw email, phone, cookie material, signing secrets, and internal cell destinations are never included.

Gateway-mode servers can omit `placementDirectory`, `identityKeyForUserId`, and `publicAuthority` when those already exist on `authFnMultiRegionEnvironment({ routing })`. Direct regional-authority mode keeps working for AuthFn traffic; this issuer still requires an explicit placement directory so a client host cannot become placement authority.

## Python

```python
from authfn import create_placement_context_issuer

issuer = create_placement_context_issuer(
    config=config,
    public_authority="https://account.example.com",
    placement_directory=directory,
    identity_key_for_user_id=identity_keys.from_user_id,
    subject_secret=subject_secret,
    audiences=["nucleum-datafn"],
    keyring=keyring,
)

context = await issuer.derive(request)
issued = await issuer.issue_signed(request)
verified = issuer.verify_signed(issued["assertion"])
```

## Session revocation semantics

| Event | New grants | Already-issued context / signed assertion |
| --- | --- | --- |
| Logout, session revoke, API-key revoke | Fail closed (`AUTHFN_SESSION_REVOKED` / `AUTHFN_API_KEY_REVOKED`) | Remain verifiable until `expiresAt`. Bind DataFn tickets to `sessionVersion` and keep TTL short. |
| Session expiry | `AUTHFN_SESSION_EXPIRED` | Same bounded expiry. |
| Identity deleted / missing user row | `AUTHFN_UNAUTHENTICATED` | Existing grants expire; do not mint new tickets. |
| Placement `moving` or `deleting` | `AUTHFN_PLACEMENT_MOVING` | Downstream cells should fence on epoch. Re-bootstrap through the canonical gateway. |
| Tombstone / missing placement | `AUTHFN_REGION_NOT_FOUND` | Fail closed. |
| Directory unavailable | `AUTHFN_PLACEMENT_DIRECTORY_UNAVAILABLE` | Fail closed. Do not guess a region. |
| Placement epoch advance | New context uses the new region/epoch | Old assertions still verify until TTL; DataFn must reject a stale epoch. |

There is no public AuthFn introspection route. Immediate revocation of downstream tickets is a consumer concern: short TTL, epoch fencing, or a private lookup the consumer owns.

## Nucleum integration

1. Keep browser/native traffic on the canonical AuthFn authority from [AUTH-1](https://linear.app/21n/issue/AUTH-1/support-canonical-gateway-routing-in-authfn-multi-region).
2. After the gateway validates the AuthFn session, call `derive` or `issueSigned` in trusted process or service-bound code.
3. Map `context.subject` to the product user-home / DataFn namespace. Do not use email.
4. Select the DataFn cell from **server-owned** configuration keyed by `homeRegion` + `placementEpoch`.
5. Mint the DataFn regional route ticket in Nucleum/DataFn. Return only that short-lived descriptor to the client.
6. On ticket expiry, mismatch, or WebSocket close, the client returns to the canonical bootstrap path.

AuthFn and DataFn placement records can drift. Nucleum should treat one product-level user-home authority as canonical and reject mismatched epochs rather than picking either copy.

## Observability

| Event | When |
| --- | --- |
| `authfn.placement_context.issued` | Context derived from a valid session and active placement. |
| `authfn.placement_context.rejected` | Unauthenticated, revoked, expired, moving, missing, or invalid audience. `metadata.errorType` is the AuthFn error code. |
| `authfn.placement_context.verified` | Signed assertion verified. |
| `authfn.placement_context.verification_failed` | Bad signature, audience, issuer, expiry, or key. |

Events hash the opaque subject. They must not contain email, tokens, or cell destinations.

## Related

- [Canonical-gateway multi-region](./canonical-gateway-multi-region)
- [Concepts → Regions](../core-concepts/regions)
- [Plugins → Multi-region](../plugins/multi-region)
