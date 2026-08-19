# AuthFn Current-Tree Code, Security, and Release Audit

## Executive decision

**Status: action required; do not release or deploy this AuthFn snapshot until the two critical findings, SF-AUTH-003, 004, 005, 007, 008, 010, 012, 014, 015, 037, and 038, and the hard release/test blockers are remediated. SF-AUTH-006, 009, 011, and 013 require an explicit deployment/consumer applicability decision before release.**

The audit identified **2 critical, 15 high, 23 medium, and 1 low findings** in the current working tree. Four High findings are conditional: SF-AUTH-006 requires shared/replicated session storage plus a region-isolation boundary; SF-AUTH-009 depends on AuthFn/gateway throttling and proxy trust; SF-AUTH-011 depends on consumers authorizing from issued scope strings; and SF-AUTH-013 depends on proxy/runtime authority handling and, for OAuth code leakage, provider registration. If a deployment conclusively excludes a stated condition, triage that item as Medium. The most urgent issues are:

1. Apple form_post identity handling allows unsigned profile JSON to replace the signed email while inheriting the signed token's verified-email status. When verified-email linking is enabled, an attacker can link their Apple identity to a victim and receive a victim session.
2. The Python OAuth token vault derives its Fernet key solely from namespace and key-reference strings. A database reader can derive the same key and decrypt every stored OAuth token.
3. OAuth and native handoff transactions are not bound to the initiating browser or app, and some handoff modes return full session bearer tokens in URL fragments.
4. TypeScript and Python OTP/2FA workflows have concurrency or attempt-budget gaps that invalidate the advertised brute-force and one-time-use boundaries.
5. Session issuance region is not persisted, so deployments with shared or replicated session storage can accept a cross-region replay and relabel it as the receiving region.
6. Opaque custom-scheme URLs all compare with origin `"null"`; allowlisting one scheme can admit another and redirect a live session bearer to it.
7. TypeScript and Python persist mutually incompatible password-record encodings despite the advertised parity and shared-storage story.

Substantial defensive work is already present: high-entropy session and handoff secrets, hashed session/API-key storage, scrypt password hashing, CSRF enforcement on reviewed cookie-authenticated mutations, atomic TypeScript OAuth-state consumption, fixed provider endpoints, encrypted TypeScript 2FA seeds, mandatory admin authorization, and generally effective sensitive-field logging redaction. Those controls do not neutralize the release blockers above.

## Metadata

| Field | Value |
|---|---|
| Audit ID | q8v4m2zd |
| Timestamp | 2026-08-08T04:10:33Z |
| Agent name | Codex |
| Model | GPT-5 |
| Launcher | Codex Desktop |
| Repository | superfunctions-dev |
| Branch | dev |
| Commit | 713f82b3bff8624308473d0d6d19775bd7cbc7b6 |
| Upstream snapshot | origin/dev contains 10 commits not in HEAD; HEAD contains 0 commits not in origin/dev; no fetch was performed |
| Source state | Current dirty working tree, including tracked modifications and untracked AuthFn packages |
| AuthFn worktree delta | 93 tracked changed paths and 17 untracked entries at audit time |
| Environment | Darwin arm64, zsh, Node 22.22.1, npm 10.9.4 |
| Audit mode | Static review plus local tests, type checks, dependency audit, secret-pattern scan, and URL-behavior probes |

The checkout already contained extensive unrelated changes. This audit intentionally treated the current files on disk as the source of truth and did not fetch, stage, commit, push, deploy, or modify AuthFn source.

## Audit scope

### Included

- authfn/core and all current first-party plugins:
  - password
  - email-otp
  - social-oauth
  - two-factor
  - api-keys
  - multi-region
  - native-handoff
  - schema-plugin
- AuthFn admin, JavaScript client, Svelte integration, Python implementation, and Swift implementation.
- Region lookup adapters for Cloudflare Durable Objects and DynamoDB.
- AuthFn documentation and runnable examples.
- Direct shared security boundaries used by AuthFn:
  - packages/auth
  - packages/http, packages/http-express, packages/http-hono, and packages/http-openapi
  - packages/oauth-core, packages/oauth-flow, packages/oauth-http, packages/oauth-router, packages/oauth-storage, and provider packages
- Current package manifests, generated-publication strategy, tests, and installed dependency graph.

### Excluded or unavailable

- Production proxy, DNS, CORS, WAF, rate-limit store, KMS, database, and provider-console configuration.
- Live multi-region topology and tenant-sharing configuration.
- Deployed build artifacts and published npm tarballs.
- A formal AuthFn security specification or threat model: none was present in the checkout.
- Unrelated monorepo functions and packages except where they directly define an AuthFn boundary.

Generated directories such as node_modules, dist, .svelte-kit, .turbo, Python caches, and Swift .build were not treated as implementation source. The dist filename inventory and packaging manifest were inspected only for the publication-integrity finding; generated logic was not treated as current implementation. Existing ignored build output may have been refreshed by validation commands.

## Inputs audited (intent + spec bundles)

- Intent and notes: README.md, authfn/core/README.md, authfn/docs/content, authfn/examples, exported AuthFn types/interfaces, route metadata, schemas, package manifests, and tests.
- Implementation: authfn/core; authfn/password; authfn/email-otp; authfn/social-oauth; authfn/two-factor; authfn/api-keys; authfn/multi-region; authfn/native-handoff; authfn/schema-plugin; authfn/admin; authfn/client; authfn/svelte; authfn/python; authfn/swift; and authfn/adapters.
- Direct shared boundaries: packages/auth, packages/http, packages/http-express, packages/http-hono, packages/http-openapi, packages/oauth-core, packages/oauth-flow, packages/oauth-http, packages/oauth-router, packages/oauth-storage, and OAuth provider packages.
- Formal specification paths: **none provided or present**.
- External threat model or security requirements: **none provided or present**.

## High-level findings

AuthFn contains substantial defensive machinery, but the current dirty-tree refactor is not releasable. The release tag resolver is blocked by the `@authfn/core` to `authfn` rename; both multi-region lookup adapters fail type checking; the client suite is red; eight extracted plugin packages have test scripts but no direct tests; and the passing core suite resolves ignored `dist` artifacts for package imports, so it is not reliable proof that current plugin source passed. The highest-risk runtime defects affect Apple identity binding, OAuth token-vault confidentiality, custom-scheme return targets, OAuth/handoff transaction binding, OTP/2FA concurrency, public provider authorization/revocation, bearer logout, and cross-runtime password compatibility.

## Intent Inventory (numbered)

No formal AuthFn spec bundle or requirements file exists in this checkout. The audit therefore derived intended behavior from the input paths above. Several docs and examples are stale relative to the modular source, so current exported contracts and handlers were given precedence.

1. **INT-01:** Session tokens are unpredictable, hashed at rest, expiry-bound, and consistently revocable through every public surface.
2. **INT-02:** Cookie sessions use safe attributes and enforce CSRF on every state-changing cookie-authenticated route.
3. **INT-03:** Password authentication resists enumeration, and recovery terminates attacker persistence without losing a valid recovery challenge on a failed write.
4. **INT-04:** OTP attempt limits and one-time consumption remain correct under concurrency.
5. **INT-05:** OAuth/OIDC identity claims are cryptographically bound, callback state is bound to the initiating user agent, and return targets cannot receive credentials outside the exact allowlist.
6. **INT-06:** 2FA challenges have bounded attempts and TOTP/recovery material is single-use under concurrency.
7. **INT-07:** API-key scopes are server-governed, exposed through the shared authorization contract, and revocation is authoritative.
8. **INT-08:** Region and tenant context is immutable, namespace-isolated, and validated across storage and routing.
9. **INT-09:** Native/web handoff is one-time, recipient-bound, source-session-bound, and never places a long-lived bearer in a URL.
10. **INT-10:** Admin operations deny by default without an explicit authorization policy.
11. **INT-11:** JavaScript, Svelte, Python, and Swift integrations preserve server-side session semantics and origin/authority boundaries.
12. **INT-12:** Public auth routes have bounded parsing, reliable distributed throttling, and safe proxy attribution.
13. **INT-13:** Credentials, secrets, and raw internal failures are not cached or reflected to clients.
14. **INT-14:** Declared route authentication/CSRF requirements are centrally enforced and represented in OpenAPI.
15. **INT-15:** Reviewed source, tests, compiled adapters, examples, documentation, release metadata, and published artifacts remain aligned.

## Intent → Spec coverage matrix (complete; no sampling)

All 15 derived requirements have **SPEC MISSING** coverage because no formal AuthFn spec was present. The requirement table below therefore maps implementation evidence and findings directly to derived intent; it must not be read as conformance to an absent external specification.

## Requirement coverage summary (PASS/PARTIAL/FAIL/UNVERIFIED counts per spec bundle)

| Requirement bundle | PASS | PARTIAL | FAIL | UNVERIFIED |
|---|---:|---:|---:|---:|
| Formal spec bundles (none present) | 0 | 0 | 0 | 0 |
| Derived AuthFn intent baseline (INT-01 through INT-15) | 1 | 2 | 12 | 0 |

## Requirement-by-requirement results (tables + per-requirement notes)

| ID | Derived security requirement | Spec coverage | Result | Associated findings | Primary evidence or gap |
|---|---|---|---|---|---|
| INT-01 | Session tokens are unpredictable, stored only as hashes, expire, and can be revoked consistently through every public API | SPEC MISSING | **Fail** | SF-AUTH-010, 014, 020, 035 | Token generation/storage is sound, but provider and bearer revocation contracts are nonfunctional and recovery/logout semantics are incomplete |
| INT-02 | Cookie sessions use secure attributes and every state-changing cookie route enforces CSRF | SPEC MISSING | **Partial** | SF-AUTH-023, 025, 039 | Reviewed handlers enforce CSRF, but parent-domain cookies and custom-prefix browser discovery remain unsafe |
| INT-03 | Password authentication resists enumeration and password recovery terminates attacker persistence | SPEC MISSING | **Fail** | SF-AUTH-014, 022, 038, 041 | Password timing/state responses enumerate accounts; reset flows retain sessions/consume codes before writes; runtime formats diverge |
| INT-04 | OTP attempts and one-time consumption remain bounded under concurrency | SPEC MISSING | **Fail** | SF-AUTH-008, 009, 021 | Both runtimes race attempt updates; Python success consumption is also non-atomic |
| INT-05 | OAuth identity claims are cryptographically bound and callbacks are bound to the initiating user agent | SPEC MISSING | **Fail** | SF-AUTH-001, 003, 004, 012, 016, 029, 037 | Apple unsigned-email substitution, unbound browser state, opaque-origin allowlist bypass, and unverified code-flow ID-token claims |
| INT-06 | 2FA challenges have an attempt budget and TOTP/recovery material is single-use under concurrency | SPEC MISSING | **Fail** | SF-AUTH-007, 009 | No challenge attempt counter in either runtime; challenge/recovery consumption is incomplete |
| INT-07 | API-key scopes are granted by server policy and revocation is authoritative | SPEC MISSING | **Fail** | SF-AUTH-010, 011, 020, 028 | Cookie users can self-select metadata-only scopes; shared authorization is nonfunctional; authentication can race revocation |
| INT-08 | Region/tenant context is immutable, isolated, and validated | SPEC MISSING | **Fail** | SF-AUTH-006, 017, 018, 019 | Sessions omit issuance region; lookup keys omit namespace; records and client routing are insufficiently constrained |
| INT-09 | Native/web handoff is one-time, recipient-bound, and never transports a long-lived bearer through a URL | SPEC MISSING | **Fail** | SF-AUTH-004, 005, 035 | Storage consumption is strong, but transaction/browser binding and URL delivery semantics are unsafe |
| INT-10 | Admin operations are denied without an explicit authorization policy | SPEC MISSING | **Pass** | None | authfn/admin/src/index.ts:120-207 requires authorization before sensitive operations |
| INT-11 | Client integrations preserve server-side logout and origin/authority boundaries | SPEC MISSING | **Fail** | SF-AUTH-010, 015, 030, 031 | Swift bridge has no origin check, sign-out is local only, and caller-supplied endpoints can receive credentials |
| INT-12 | Public auth routes have reliable distributed throttling and bounded request parsing | SPEC MISSING | **Fail** | SF-AUTH-007, 008, 009, 024, 040 | Limiting is optional/proxy-sensitive; Python lacks it; parsing is unbounded; hot paths block/write synchronously |
| INT-13 | Secrets and internal failures are not cached or reflected to clients | SPEC MISSING | **Partial** | SF-AUTH-025, 026 | Logging redaction is generally strong, but secret responses omit no-store and raw error causes/details can reach clients |
| INT-14 | Declared route security is enforced and represented to generated clients | SPEC MISSING | **Fail** | SF-AUTH-027, 028 | route.meta.auth is descriptive only and is omitted from OpenAPI security |
| INT-15 | Reviewed source, compiled adapters, tests, docs, and published artifacts remain aligned | SPEC MISSING | **Fail** | SF-AUTH-018, 032, 033, 038 plus release blockers | Password formats diverge; adapters and client gates fail; release tags and source-resolved tests are broken |

## Spec conflicts / spec gaps (explicit)

- **SPEC MISSING:** no formal AuthFn requirements, threat model, supported deployment topology, trusted-proxy contract, tenant/isolation model, logout semantics, or security severity policy was found.
- Public docs and examples contain stale configuration/API shapes relative to the current modular implementation.
- The shared AuthProvider authorization/revocation contract conflicts with AuthFn's always-deny/no-op implementation, and shared first-class scopes conflict with AuthFn's metadata-only API-key scopes.
- Python's advertised parity conflicts with its `/runtime` route, cookie-only session responses/authentication, and incompatible password-record encoding relative to the current TypeScript surface.
- Route metadata declares authentication and CSRF intent, but the router and OpenAPI generator do not enforce or publish it.
- Multi-region code supports shared-domain and cross-region behavior without an explicit documented token-audience or lookup-directory isolation contract.
- Swift signOut naming does not document that it only forgets local credentials.

## Cross-cutting audits (security/determinism/limits/errors/compat)

| Area | Result |
|---|---|
| Authentication and authorization | Critical/high defects in Apple identity binding, OAuth initiation binding, API-key scope grants, and revocation contracts |
| Cryptography and secret storage | TypeScript primitives are generally sound; Python OAuth vault key derivation is critical and TypeScript OTP hashing is weak after database disclosure |
| Concurrency and determinism | OTP, Python OAuth state, 2FA recovery, API-key revocation, and challenge consumption contain read/modify/write races |
| Multi-tenant and multi-region isolation | Session region is not persisted; lookup-store namespace and record validation are incomplete |
| Input, redirect, and network boundaries | Native returnTo parsing, request authority derivation, body limits, regional resolvers, and Swift URL/origin validation need hardening |
| Error, logging, and cache behavior | Logging redaction is mostly strong; client error details and credential-response cache policy remain gaps |
| Compatibility and release integrity | Adapter compilation, client regression, package alignment, dependency triage, and clean-pack publication are unresolved |

## Severity model

- **Critical:** practical account takeover or bulk decryption of high-value credentials with realistic preconditions.
- **High:** authentication, MFA, session, redirect, or authorization failure that can directly yield unauthorized access or defeat a core security boundary.
- **Medium:** meaningful weakness with additional deployment, concurrency, data-access, or consumer preconditions; also serious defense-in-depth gaps at a public boundary.
- **Low:** hardening or observability issue with limited direct impact.

## Detailed findings

### Critical

#### SF-AUTH-001 — Unsigned Apple profile email can replace the signed identity email

**Evidence**

- authfn/social-oauth/src/index.ts:841-881 verifies the Apple ID token, then passes a separate form user payload into profile resolution.
- authfn/social-oauth/src/index.ts:1285-1303 selects `user.email` before `claims.email` while preserving `claims.emailVerified`, defaulting a missing verification claim to true.
- authfn/social-oauth/src/index.ts:1310-1347 has a related native fallback: when the signed token has no email, the caller-supplied email field is accepted and verification defaults positively.
- authfn/social-oauth/src/index.ts:969-988 automatically links an OAuth identity to an existing user by verified email.
- authfn/core/src/core/account-linking.ts:8-38 confirms verified-email linking is configurable and disabled by default.
- `authfn/core/src/__tests__/social-apple.test.ts:173-261` covers the user payload but not a signed/body email mismatch.

**Attack and impact**

An attacker starts Apple authentication for their own account and submits the valid signed token with the unsigned user email changed to a victim's address. The body address replaces the signed address while inheriting the token's verified status. In deployments where oauthByVerifiedEmail or the provider override enables email linking, AuthFn can attach the attacker's Apple subject to the victim and issue a victim session. The default policy reduces default exposure but does not make the enabled feature safe.

**Remediation and verification**

- Use only signed claims for identity email and verification.
- Treat Apple's user payload solely as first-login display-name metadata.
- If a body email is retained for compatibility, require an exact normalized match with a signed email and reject absence/mismatch.
- Never infer email_verified=true from a missing claim.
- Add form_post and native tests using a valid attacker token plus victim body email; no account link, account creation, or session may occur.

#### SF-AUTH-002 — Python OAuth vault encryption key is publicly derivable

**Evidence**

- authfn/python/authfn/plugins/social_oauth.py:89-96 defaults the key reference to oauth-default.
- authfn/python/authfn/plugins/social_oauth.py:160-183 encrypts token payloads with a Fernet instance.
- authfn/python/authfn/plugins/social_oauth.py:256-257 obtains that instance from namespace and key reference.
- authfn/python/authfn/plugins/social_oauth.py:1456-1458 derives the complete Fernet key as SHA-256(namespace:key_ref:oauth).

**Attack and impact**

Namespace and key-reference values are identifiers, not secrets. Anyone who obtains the token table or a database backup can reconstruct the Fernet key offline and decrypt stored OAuth access and refresh tokens. The vault therefore provides no effective confidentiality against the database-disclosure threat that encryption at rest is expected to mitigate.

**Remediation and verification**

- Require secret key material supplied by KMS, Vault, or an injected secret resolver; key_ref must identify a key, never derive one.
- Fail closed at startup or first use when no secret resolver exists.
- Version ciphertext and support rotation/re-encryption.
- Add a test proving namespace plus key_ref cannot decrypt a record, while the separately managed key can, and test missing-key failure and rotation.

### High

#### SF-AUTH-003 — OAuth state is not bound to the initiating browser

authfn/social-oauth/src/index.ts:175-258 creates a high-entropy server-side transaction, but no browser-bound transaction cookie or equivalent proof. The callback at lines 261-302 accepts any user agent presenting the state. packages/oauth-storage/src/index.ts:8-36 contains no browser-binding secret; database consumption at packages/oauth-storage/src/adapters/db.ts:113-163 is atomic but only prevents replay.

An attacker can begin OAuth, authenticate the attacker's provider account, retain the unused callback URL, and send it to a victim. The victim's browser consumes the callback and receives the attacker's AuthFn cookie, creating login CSRF/session swapping. Bind state to a user-agent proof and add a two-cookie-jar test in which jar B cannot consume state created in jar A. For Apple form_post, a conventional SameSite=Lax cookie will not accompany the cross-site POST: use a narrowly scoped SameSite=None; Secure; HttpOnly transaction cookie or another sender-bound design and test modern third-party-cookie restrictions.

#### SF-AUTH-004 — Long-lived session bearer tokens are transported through redirect URL fragments

authfn/social-oauth/src/index.ts:1820-1835 appends the raw session token to the return URI fragment. The handoff-mode inference at lines 2106-2124 selects session-token for non-HTTP(S) targets; tests at `authfn/core/src/__tests__/social-github.test.ts:229-277` and social-google.test.ts:271-301 explicitly expect raw st_ tokens.

Custom schemes are claimable by another installed app. HTTPS fragments are available to destination JavaScript and therefore to XSS, compromised third-party scripts, browser history/screenshots, and telemetry that captures full URLs. Replace fragment delivery with a short-lived, one-use, recipient- and PKCE-bound exchange code; require verified universal/app links and exact callback paths. Returning the session token only from the final proof-bound HTTPS exchange in JSON is acceptable when the response is no-store. Assert no st_ token ever appears in a Location header or URL.

#### SF-AUTH-005 — Web/native handoff is not browser-bound, and returnTo permits a backslash open redirect

authfn/native-handoff/src/index.ts:172-249 creates and consumes a cookie-setting web link without browser transaction binding or account confirmation. Device data at lines 136-153 is recorded after exchange, not validated as possession proof. sanitizeReturnTo at lines 506-516 accepts any string beginning with one slash unless the next character is also slash. The JSON-style value `"/\\evil.example"` passes that check, and URL resolution against `https://auth.example` produces `https://evil.example/`.

An attacker must first create an unconsumed handoff code and induce the victim to visit it within its short lifetime. The trusted AuthFn consume link then logs the victim into the attacker's account and redirects off-site. Bind web handoff to the intended browser or require explicit account confirmation; bind native exchange with PKCE or a device key. Resolve returnTo against a canonical origin and require exact same-origin output; reject backslashes, controls, userinfo, and ambiguous separators. Test cross-browser consumption and adversarial slash/backslash cases.

#### SF-AUTH-006 — Session issuance context is not persisted and cross-region replay is relabeled

AuthFnSessionRecord at authfn/core/src/types.ts:90-102 has no persisted home-region field. issueSession at authfn/core/src/core/sessions.ts:63-117 accepts a region but omits it from persistence. Cookie reconstruction at lines 174-257 and bearer reconstruction at lines 431-468 use the receiving request's runtime region.

When regions share or replicate session storage and region identity is an isolation or data-residency boundary, a token issued in region A can be replayed in region B and returned to downstream code as a region-B session. Persist immutable homeRegionId and validate it against the receiving runtime; reject mismatches rather than relabeling. Add cookie and bearer tests issuing in EU and replaying in US. Actual production storage topology was unavailable, so exploitability is deployment-conditional.

#### SF-AUTH-007 — 2FA has no attempt budget and one-time material is raceable

- TypeScript: authfn/core/src/types.ts:136-144 has no attempt/lock field; authfn/core/src/core/two-factor.ts:238-280 allows guesses until expiry. Recovery-code and challenge consumption at lines 281-289 and 426-453 lacks a consumedAt/usedAt precondition.
- The public completion route is authfn/two-factor/src/index.ts:157-168 and falls into the generic IP-only account rate bucket.
- Python: authfn/python/authfn/plugins/two_factor.py:232-287 and 352-368 has the same missing attempt budget and read-then-write consumption; the public handler is authfn/python/authfn/http.py:1001-1021.

An attacker who has the primary factor can parallelize six-digit guesses throughout the default challenge lifetime. Recovery-code and challenge consumption can race; TypeScript TOTP counter comparison itself uses a conditional compare-and-swap and was not shown to permit same-counter replay. Add an atomically incremented persisted attempt counter and terminal lock, a strict challenge/user/IP limiter, and conditional challenge/recovery consumption requiring exactly one affected row. Concurrent recovery-code tests must prove only one success, and the configured failure count must permanently lock the challenge.

#### SF-AUTH-008 — OTP attempt caps race in both runtimes; Python success consumption also races

- TypeScript authfn/core/src/core/verifications.ts:241-293 reads attemptCount and computes the next value; lines 502-516 writes it unconditionally by ID. Parallel wrong guesses can all read zero and write one.
- Python authfn/python/authfn/plugins/email_otp.py:201-241 and 441-459 separates attempt/verification/consumption with unconditional writes, allowing both limit bypass and correct-code replay.

This defeats the intended five-attempt boundary on sign-in and password-reset OTPs. Combine attempt increment, cap enforcement, comparison, and consumption in a transactional conditional operation. Run at least 20 simultaneous wrong attempts against a five-attempt challenge and 100 simultaneous correct submissions; no more than five comparisons and exactly one success should occur.

#### SF-AUTH-009 — Brute-force throttling is absent or bypassable across supported runtimes

TypeScript installs no limiter unless rateLimit.enabled is true at authfn/core/src/core/rate-limit.ts:32-36. It trusts cf-connecting-ip and the entire x-forwarded-for string at lines 42-50, has incomplete route classification at lines 86-95, uses non-atomic best-effort storage at lines 152-164, and its process-local map at lines 150-175 never globally evicts expired one-off keys. Password sign-up, reset completion, and 2FA fall into a generic IP-only bucket. Python exposes password, OTP, and OAuth routes at authfn/python/authfn/http.py:454-632 and 2FA completion at lines 1001-1021 but implements no route limiter despite defining RateLimitedError.

Deployments relying on AuthFn's limiter, or whose origin accepts untrusted forwarding headers, expose password, OTP, MFA, email-send, and password-hashing abuse; a correctly configured edge that overwrites forwarding headers mitigates the spoofing path. Provide production-safe strict defaults, require an atomic distributed store for credential routes, obtain client IP only from a configured trusted-proxy resolver, add explicit route/challenge categories, bound local storage, and add multi-node concurrency plus proxy-spoof tests.

#### SF-AUTH-010 — Shared provider authorization/revocation and bearer logout are nonfunctional

authfn/core/src/index.ts:151-155 always returns false from `AuthProvider.authorize` and implements `AuthProvider.revoke` as a silent no-op. Because `authorize` is present, the shared middleware at packages/auth/src/middleware.ts:119-131 never reaches its `resourceIds` fallback, so provider-mediated resource authorization always denies. The shared contract at packages/auth/src/types.ts:73-89 describes both methods as functional optional capabilities.

The server also issues bearer/hybrid sessions at authfn/core/src/core/session-responses.ts:5-28, but `/sign-out` is declared cookie-only and returns `revoked:false` when no cookie session exists at authfn/core/src/http/router.ts:210-260. Swift AuthFnClient.signOut at authfn/swift/Sources/AuthFnClient/AuthFnClient.swift:192-194 only clears the configured local credential store. Consumers therefore cannot use the advertised provider to authorize resources or revoke sessions, and a copied bearer remains remotely valid after user-visible logout.

Omit unsupported provider methods or implement their contracts; wire provider revocation and bearer sign-out to authoritative session revocation. Define conflict-safe cookie/bearer logout semantics, clear local credentials only after attempting server revocation, and verify authorization and revocation from a second client.

#### SF-AUTH-011 — API-key scope input is user-controlled and incompatible with the shared session contract

authfn/api-keys/src/index.ts:76-93 accepts body.scopes from any cookie-authenticated user. authfn/core/src/core/api-keys.ts:33-54 persists those strings unchanged and lines 159-175 returns them only as `metadata.scopes`. ApiKeyPluginConfig at authfn/core/src/plugin-types.ts:41-47 defines no grant policy. The shared session contract expects first-class `scopes` at packages/auth/src/types.ts:49-53, while AuthFn's core and client session types omit that field at authfn/core/src/types.ts:60-79 and authfn/client/src/types.ts:16-36.

If downstream services trust AuthFn-issued metadata scopes, an ordinary user can request reserved values such as admin or billing scopes and escalate privileges. Standard consumers looking at first-class scopes instead see no grants, producing the opposite failure. No audited first-party consumer was found that currently grants privileges from these strings, so exploitability is consumer-conditional. Derive scopes server-side from actor permissions, enforce an allowlist/subset policy, reject malformed and duplicate scopes, and place validated grants in the first-class session field. Test that ordinary users cannot mint reserved scopes and that approved scopes reach shared middleware.

#### SF-AUTH-012 — Production code contains an environment-controlled unsigned Apple-token bypass

authfn/social-oauth/src/index.ts:1361-1420 accepts an alg:none Apple token when AUTHFN_ALLOW_UNSIGNED_APPLE_TOKENS=true or NODE_ENV=test. In that branch it checks audience but not signature, issuer, or expiration.

If either setting reaches a deployed environment, an attacker can obtain state/nonce and forge an arbitrary Apple subject/email. Remove environment-controlled verification bypasses from production logic. Inject a mock verifier only through isolated test construction and fail startup if a bypass setting is detected outside the test harness.

#### SF-AUTH-013 — Request Host/proxy data can define issuer, OAuth callbacks, and handoff authority

authfn/core/src/core/environment.ts:27-39 defaults issuer/baseUrl to request.url.origin. packages/http-express/src/adapter.ts:37-43 constructs that URL from req.protocol and Host; req.protocol also reflects forwarded protocol only when Express trust proxy is enabled. Hono passes its runtime Request.url through, whose attacker control depends on the hosting runtime. authfn/social-oauth/src/index.ts:191-196 builds callback URIs from this origin, and lines 1104-1139 defaults the redirect allowlist to the same derived callback. authfn/native-handoff/src/index.ts:194-200 and authfn/core/src/core/regions.ts:61-82 also derive authority from it. Python has the same pattern at authfn/python/authfn/config.py:59-78 and authfn/python/authfn/http.py:1539-1546.

On an origin or proxy that accepts forged authority data, attackers can poison callback, issuer, consume-link, or region-routing values. OAuth code leakage additionally requires the provider to accept/register the poisoned redirect authority, which is a significant external mitigation. Require a configured canonical external origin in production or an exact host allowlist; honor forwarded values only through explicit trusted-proxy configuration. Test forged Host and X-Forwarded-* inputs in each supported adapter. Exploitability is deployment-conditional because proxy/runtime behavior and provider registrations were unavailable.

#### SF-AUTH-014 — Password reset does not revoke existing sessions

TypeScript reset at authfn/core/src/core/verifications.ts:436-470 and password replacement at authfn/core/src/core/passwords.ts:303-332 do not revoke sessions. Python authfn/python/authfn/plugins/email_otp.py:281-332 behaves the same.

A stolen session survives the victim's recovery action, so changing the password does not recover control. Revoke all existing sessions as part of the reset transaction, optionally issuing one fresh recovery session after policy confirmation. Verify all pre-reset cookie and bearer tokens fail immediately afterward.

#### SF-AUTH-015 — Swift WebView bridge accepts privileged messages from every main-frame origin

authfn/swift/Sources/AuthFnWebViewBridgeHost/AuthFnWebViewBridgeHost.swift:25-31 installs native handoff, web handoff, and sign-out handlers globally. Lines 40-75 checks only that the sender is the main frame; it does not validate scheme, host, port, security origin, current navigation, or a capability. exchangeNativeHandoff at authfn/swift/Sources/AuthFnClient/AuthFnClient.swift:108-118 replaces the stored credential.

A malicious page loaded in the WebView can submit an attacker-account handoff code and replace the native credential, or trigger sign-out/web handoff. Require an exact trusted-origin allowlist using frameInfo.securityOrigin plus current navigation validation, bind messages to a native nonce, and unregister/disable handlers outside trusted auth pages. Test malicious origins, subdomains, ports, schemes, and post-navigation messages.

#### SF-AUTH-037 — Opaque custom-scheme allowlisting admits another scheme and exfiltrates a live session token

authfn/social-oauth/src/index.ts:1873-1896 accepts an exact return target or, for entries whose path is `/` with no query/fragment, compares `allowed.origin === target.origin`. WHATWG opaque custom-scheme URLs such as `memotron://auth/callback`, `nucleum://oauth/callback`, and `evil://steal` all expose origin `"null"`. Allowlisting one origin-style app scheme therefore admits any other syntactically valid opaque scheme. Non-HTTP(S) return targets automatically select session-token handoff at lines 2106-2119, lines 1820-1835 append the raw long-lived token to the fragment, and callback handling redirects after the same allowlist check.

An attacker who can supply `returnTo` can substitute an attacker-controlled scheme, pass the allowlist, and receive the victim's new session token. Never apply origin-only matching to opaque origins: require exact scheme/host/path registration for custom schemes, preferably use verified universal/app links, and exchange a one-time recipient- and PKCE-bound code instead of a bearer. Add a regression proving that allowlisting `memotron://auth/callback` rejects `evil://steal` and that no redirect contains an `st_` token.

#### SF-AUTH-038 — TypeScript and Python password records are mutually incompatible

TypeScript writes the scrypt salt and digest as base64url at authfn/core/src/core/passwords.ts:334-371. Python writes hexadecimal salt/digest strings and verifies the digest with `bytes.fromhex` at authfn/python/authfn/http.py:1449-1510; password reset duplicates that hexadecimal writer at authfn/python/authfn/plugins/email_otp.py:72-83 and 304-329. Both runtimes use the same algorithm label and field, so neither can reliably distinguish the other encoding.

Shared-database deployments or a runtime migration can lock out users, and Python can throw while parsing a TypeScript digest. This directly conflicts with the parity claim in authfn/python/README.md:1-14. Introduce a versioned canonical encoding, dual-read both legacy formats, opportunistically rehash, remove the duplicate Python writer, and add cross-runtime fixtures proving that each implementation can verify and upgrade the other's existing record.

### Medium

#### SF-AUTH-016 — Standard Google/Apple code-flow ID tokens are decoded without OIDC validation

TypeScript profile construction at authfn/social-oauth/src/index.ts:1223-1265 uses the base64-only parser at lines 1957-1998. Python does the same at authfn/python/authfn/plugins/social_oauth.py:1277-1328. Signature, algorithm, issuer, audience, expiry, and nonce are not validated at the local identity boundary.

Python also treats a missing Apple email_verified claim as verified at authfn/python/authfn/plugins/social_oauth.py:1292-1301. Fixed provider endpoints, TLS, state, and PKCE constrain direct attacks, but custom fetchers/providers, an upstream compromise, or incorrect token trust can forge identity and verified-email claims. Validate the ID token with provider JWKS and expected claims, or use authenticated userinfo; never default missing verification positively. Add forged, expired, wrong-audience, wrong-issuer, wrong-nonce, and missing-verification cases.

#### SF-AUTH-017 — Public region lookup enumerates accounts and internal routing identity

authfn/multi-region/src/index.ts:138-172 is unauthenticated and returns the lookup result. authfn/core/src/core/regions.ts:189-227 produces distinguishable hit/miss results including userId; `authfn/core/src/__tests__/multi-region.test.ts:162-181` explicitly expects that disclosure. Python exposes the same unauthenticated data at authfn/python/authfn/http.py:1033-1052 and authfn/python/authfn/plugins/multi_region.py:129-144.

This exposes account existence, home region, authority, and internal user IDs and logs raw lookup identifiers. Return only an opaque routing token or public region alias with constant-shaped responses; keep user IDs and diagnostic records behind administrative authorization and hash identifiers in events in both runtimes.

#### SF-AUTH-018 — Region lookup keys lack namespace isolation and stored authority is trusted

Authoritative keys at authfn/core/src/core/regions.ts:646-647 use a raw normalized identifier without namespace, unlike namespaced hashed cache keys. Lines 654-675 type-check records but do not confirm identifier equality, configured-region membership, or authority equality; registration at lines 341-400 writes the global key.

When AuthFn namespaces are intended as isolated tenants but share one lookup store, the first namespace claiming an email can affect another namespace's routing. If the store is deliberately one global identity directory, namespace omission may be intentional; that contract is undocumented. A corrupted record can independently inject an unknown authority. Include namespace in an HMAC key for isolated deployments, validate the identifier, require a configured region ID, and derive authority from configured region metadata. Add two-namespace and poisoned-record tests.

The Cloudflare design at authfn/adapters/lookup-cloudflare-do/src/index.ts:15-18, 65-73, and 175-239 and DynamoDB design at authfn/adapters/lookup-dynamodb/src/index.ts:19-24, 47-60, and 162-173 also omit a required tenant dimension. DynamoDB queries only a partition key with Limit: 1 rather than requiring the lookup sort key. Current source is not releasable because both adapters fail compilation; previously published artifacts were not inspected.

Python directory registration and lookup likewise lacks a tenant/namespace dimension at authfn/python/authfn/plugins/multi_region.py:33-38, 114-126, and 174-192.

#### SF-AUTH-019 — Regional JavaScript client can route passwords and OTPs through unvalidated region values

authfn/client/src/regional-client.ts:24-35 turns caller-resolved region strings into base URLs. Lines 38-70 accepts cached/server values without a fixed schema or allowlist, and credential operations at lines 162-235 use the result. Mismatch details at lines 331-363 are also trusted.

A poisoned cache, lookup response, or permissive resolver can send passwords/OTPs to an attacker-controlled origin. Require a fixed RegionId-to-exact-HTTPS-URL map, reject unknown IDs, and validate server authority before retrying. A malicious region value must cause zero credentialed network requests.

#### SF-AUTH-020 — API-key authentication can race revocation

authfn/core/src/core/api-keys.ts:123-157 reads and checks revocation/expiry, then updates by ID without an unrevoked/unexpired condition and returns an authenticated actor without rechecking. An in-flight request can authenticate after concurrent revocation. Use one conditional update/read requiring active state and authenticate only when exactly one row matched; add an interleaved revoke/auth adapter test.

#### SF-AUTH-021 — TypeScript OTP hashes are cheaply reversible after database read

authfn/core/src/core/verifications.ts:98-107 stores plain SHA-256 of a six-digit code; default generation at lines 541-547 has one million values. A database reader can enumerate every live OTP offline before expiry. Store a keyed HMAC using a separately managed, versioned pepper. A salt alone does not protect this small input domain. The Python implementation's newer PBKDF2 format does not share this exact defect.

#### SF-AUTH-022 — Password endpoints expose account and verification state

authfn/core/src/core/passwords.ts:247-266 returns early for a missing user/credential, performs scrypt only for an existing credential, and checks verification state before comparing the password. Lines 257-261 attaches internal user identifiers; sign-up at lines 110-118 and 175-192 returns explicit conflicts. authfn/core/src/http/envelopes.ts:39-54 and 77-87 returns messages/details.

Attackers can enumerate password accounts and verification status using content and timing. Perform a fixed dummy password verification for missing accounts, compare credentials before exposing policy state, and return uniform public responses. Keep specific reasons only in redacted server events.

#### SF-AUTH-023 — Parent-domain cookies allow sibling-domain fixation/login CSRF

authfn/core/src/core/cookies.ts:25-54 and 68-94 permits a parent Domain and uses `__Secure-` rather than host-only `__Host-`. Tests at `authfn/core/src/__tests__/cookies.test.ts:22-43` and multi-region.test.ts:540-588 endorse shared parent-domain cookies.

A compromised HTTPS sibling can set Domain-scoped session and matching CSRF cookies for an attacker session, creating account fixation depending on cookie selection. Default to __Host- names with Path=/ and no Domain; use signed one-time handoff for cross-subdomain SSO. Test duplicate host/domain cookie precedence in every adapter.

#### SF-AUTH-024 — Public request parsing has no AuthFn-wide byte or media-type boundary

The limiter clones and parses every POST at authfn/core/src/core/rate-limit.ts:42-53 and 189-204. Generic parsing reads the entire body at authfn/core/src/http/router.ts:360-374; social form data at authfn/social-oauth/src/index.ts:1773-1801 and other handlers parse directly. Adapter behavior varies, and Python has no common cap.

Oversized or chunked unauthenticated requests can force duplicate buffering, JSON/form parsing, memory pressure, and CPU usage before a limit applies. Add a central streaming byte cap before cloning/parsing, require route media types, and return 413/415. Test fixed-length and chunked JSON/form bodies.

#### SF-AUTH-025 — Credential-bearing responses omit explicit no-store policy

authfn/core/src/http/envelopes.ts:122-138 sets JSON content type and request ID but no cache policy. Bearer responses at authfn/core/src/core/session-responses.ts:17-27, API-key secrets at authfn/api-keys/src/index.ts:107-113, and TOTP seeds/recovery codes at authfn/two-factor/src/index.ts:115-120 use these envelopes.

Add Cache-Control: no-store, private plus appropriate legacy headers to all auth and secret responses, and test each credential-returning route. Apply the same policy in Python.

#### SF-AUTH-026 — Raw exception details can be reflected to clients

authfn/core/src/http/envelopes.ts:45-52 and 80-87 forwards AuthFnError details. Core wrappers such as authfn/core/src/core/sessions.ts:538-545 and fail-critical hooks at authfn/core/src/plugin-runner.ts:218-228 put dependency/plugin messages in cause fields.

The demonstrated wrappers allow plugin/hook exception messages containing secrets or internal topology to reach an unauthenticated client. Other error sources were not traced end to end. Use an error-code-specific public-field allowlist; retain raw causes only in server-side redacted diagnostics.

#### SF-AUTH-027 — Authentication route metadata is descriptive, not enforced or represented in OpenAPI

authfn/core/src/http/router.ts:345-357 declares auth mode and CSRF metadata, but packages/http/src/router.ts:73-116 dispatches without using it. packages/http-openapi/src/generate.ts:32-127 ignores auth metadata and authfn/core/src/openapi.ts:9-20 adds no security schemes.

Reviewed sensitive handlers generally contain manual checks, so no current unguarded handler was proven. The boundary is nevertheless unsafe: a future route can declare protection while remaining public, and generated clients/gateways see anonymous operations. Enforce mode/CSRF centrally or fail registration without a verified guard; emit cookie, bearer, and API-key OpenAPI security requirements.

#### SF-AUTH-028 — Ambient cookies override explicit authorization and failed bearer values can change credential type

authfn/core/src/core/sessions.ts:150-171 accepts a valid cookie before considering Authorization. A failed bearer lookup can then be interpreted by API-key authentication; scheme parsing is split at lines 471-499. authfn/client/src/http-client.ts:10-23 and 57-80 can send Authorization while retaining credentials: include.

A browser request carrying cookie principal A and bearer principal B executes as A, and an API key presented under Bearer can be reinterpreted where a generic authenticator accepts both. Enforce each route's declared mode, reject conflicting principals, and never reinterpret a failed bearer token as another scheme. Add explicit conflict tests.

#### SF-AUTH-029 — Python OAuth-state consumption is non-atomic

authfn/python/authfn/plugins/social_oauth.py:126-150 reads state, checks it, and then marks it consumed without a conditional consumed_at predicate. Parallel callbacks can both pass. Authorization-code one-time semantics limit many providers, but must not replace local replay defense. Perform a conditional update requiring unconsumed and unexpired state and return success only for one affected row; concurrency tests must yield one exchange.

#### SF-AUTH-030 — Swift client accepts arbitrary or plaintext credential endpoints

authfn/swift/Sources/AuthFnClient/AuthFnClient.swift:121-189 accepts caller-provided accountBaseURL for handoff, widget, and Apple operations. authfn/swift/Sources/AuthFnClient/AuthFnHandoffCoordinator.swift:10-21 accepts both HTTP and HTTPS consume URLs and only requires a host.

If a deep link, remote response, or application input influences those URLs, session tokens, handoff codes, and Apple identity material can be sent to an attacker or in plaintext. Require HTTPS except explicit debug loopback, bind to configured authorities, and reject unexpected hosts, ports, userinfo, and fragments before network I/O.

#### SF-AUTH-031 — Swift Keychain credentials are not isolated by issuer or tenant

authfn/swift/Sources/AuthFnClient/AuthFnCredentialStore.swift:30-39, 82-98, and 155-160 defaults to generic authfn/session service/account keys and does not set an explicit accessibility class. Multiple environments in one app can overwrite or reuse each other's credentials.

Derive the Keychain namespace from bundle, issuer, tenant, account, and credential class and choose a deliberate this-device-only accessibility policy where appropriate. Verify multiple configured clients cannot retrieve or replace each other's secrets.

#### SF-AUTH-032 — Workspace lockfile audit flags vulnerable packages reachable from the AuthFn docs workspace

A scoped npm audit of the AuthFn docs workspace reported 18 vulnerable packages in the resolved workspace graph: 1 critical, 11 high, 5 moderate, and 1 low. Installed direct versions include @sveltejs/kit 2.57.1, Svelte 5.46.1, and Vite 5.4.21. Examples include SvelteKit query cross-talk GHSA-hgv7-v322-mmgr, remote-form prototype pollution GHSA-866w-xmhq-wj7x, remote-form denial of service GHSA-wqjv-9729-c5q2, Accept-header denial of service GHSA-29g2-3rmr-qm68, devalue sparse-array denial of service GHSA-77vg-94rm-hx3p, and multiple Svelte SSR XSS advisories affecting the installed version. The audit ranges require @sveltejs/kit later than 2.70.2, Svelte later than 5.55.6, devalue later than 5.8.0, and Vitest 3.2.6 or later for those named advisories. SvelteKit, Svelte, and Vite are declared as docs devDependencies but participate in build/runtime generation; devalue is transitive. The critical Vitest advisory GHSA-5xrq-8626-4rwp is a workspace development-tool issue and applies only when its UI server is listening. npm still included packages declared as dev dependencies despite --omit=dev, and exact resolved dependency paths plus the deployed artifact were not captured. This is therefore a workspace-lockfile triage result, not proof that all 18 packages are production reachable.

Upgrade the docs toolchain to patched releases, produce a deployment-specific dependency graph/SBOM, and block vulnerable runtime packages in CI. Do not expose Vite/Vitest development servers. Re-run the audit against the exact production artifact.

#### SF-AUTH-033 — Publication can ship stale generated code instead of reviewed source

authfn/core/package.json:17-24 exposes wildcard generated entrypoints and lines 38-47 publishes dist only. dist is ignored and there is no clean-build prepack or prepublishOnly safeguard. The inspected filename inventory contains authfn/core/dist/core/runtime.* and authfn/core/dist/plugins/* outputs while the corresponding authfn/core/src/core/runtime.ts and authfn/core/src/plugins directory do not exist.

A release can therefore publish logic or declarations that differ from this audit. Clean and rebuild in prepack, verify npm pack output in CI from a clean clone, compare generated artifacts to source, and replace broad wildcard exports with explicit supported entries. Removed entrypoints must not resolve from a dry-run tarball.

#### SF-AUTH-034 — Demo endpoints disclose OTPs/events and allow unauthenticated destructive reset if examples are exposed

authfn/examples/shared/src/server/create-example-server.ts:86-95 and demo-routes.ts:68-135 mounts /demo/reset, /demo/events, and /demo/otp/latest without authorization. otp-inbox.ts:22-49 exposes plaintext OTPs; authfn/examples/otp-recovery/server/src/auth.ts:11-25 uses deterministic OTP behavior. Defaults bind to loopback, but hosts are configurable.

Treat this as example-only exposure, not a core production route. Refuse non-loopback binding without an explicit unsafe-test flag, omit demo routes outside development/test, require a test-only secret, and add conspicuous deployment warnings.

### Medium

#### SF-AUTH-035 — Native handoff consumption ignores source-session expiry

authfn/native-handoff/src/index.ts:373-384 rejects source-session revocation but does not check expiresAt before minting a new full session. The default handoff lifetime is 60 seconds, but codeTtlSeconds is configurable without a maximum at authfn/core/src/plugin-types.ts:71-76 and authfn/native-handoff/src/index.ts:271-280. A code minted before source expiry can therefore renew an already expired source session. Use the normal active-session predicate at exchange time, bound the configurable TTL, and test expiry between issuance and consumption.

#### SF-AUTH-039 — Custom cookie prefixes silently break browser CSRF discovery

authfn/client/src/http-client.ts:64-72 obtains the CSRF token by inferring a prefix from browser-visible cookies. The inference helper at lines 234-249 only looks for `*.session`, but the session cookie is HttpOnly while the CSRF cookie is intentionally readable at authfn/core/src/core/cookies.ts:68-93. In a real browser using a custom prefix without an explicit client `cookiePrefix`, `document.cookie` cannot reveal the session name, inference falls back to `authfn`, and cookie-authenticated mutations omit the correct CSRF value.

Infer from the visible `.csrf` cookie or return the resolved CSRF cookie name from `/environment`; reject ambiguous matches. Add a browser-realistic test whose cookie accessor contains only a custom-prefixed CSRF cookie and verify sign-out, API-key, 2FA, and account mutations send the correct header.

#### SF-AUTH-040 — Password and authentication hot paths block the event loop and write on every request

The async password helpers call `scryptSync` at authfn/core/src/core/passwords.ts:334-371, blocking the Node event loop for every hash and verification. Cookie and bearer authentication update `lastAuthenticatedAt` synchronously on every successful request at authfn/core/src/core/sessions.ts:237-246 and 450-460, and API-key authentication similarly updates `lastUsedAt` at authfn/core/src/core/api-keys.ts:149-157.

Unauthenticated password traffic can serialize the event loop, while normal traffic creates hot-row contention and write amplification. Use asynchronous scrypt with bounded worker concurrency, and throttle/batch best-effort activity timestamps behind a configurable interval. Add latency/concurrency tests and prove authentication still succeeds when a non-authoritative activity touch fails.

#### SF-AUTH-041 — Password reset consumes the one-time OTP before the password write succeeds

TypeScript `completeResetPassword` calls the consuming `verifyOtpChallenge` before finding the user and running password policy/storage updates at authfn/core/src/core/verifications.ts:436-470; the successful consume occurs at lines 406-425. Python follows the same order at authfn/python/authfn/plugins/email_otp.py:281-329. A policy-provider error, unavailable database, or failed credential update destroys an otherwise valid recovery code without changing the password.

Make consumption and password update one transaction where the adapter supports it, or reserve the challenge and finalize consumption only after a successful write with safe retry/idempotency semantics. Test policy rejection, transient storage failure, and repeated completion without permitting replay after success.

### Low

#### SF-AUTH-036 — Dedicated rate-limit security events are declared but never emitted

authfn/core/src/types.ts:231 declares authfn.rate_limited, but the limiter emits no such event; failures surface through generic request failure handling. This weakens brute-force detection and incident response. Emit the dedicated event with scope, dimension, policy, and reset time without raw identifiers.

## Compatibility and release blockers

These are not counted as security vulnerabilities unless they activate a finding above, but they prevent a trustworthy release:

1. **Release tag resolution is blocked for every package.**
   - release-packages.json:10-12 still declares `@authfn/core`, while authfn/core/package.json:1-3 is named `authfn`.
   - scripts/resolve-release-tag.mjs:25-47 validates every manifest entry before selecting the requested slug, so even unrelated tags fail on the stale AuthFn entry.
   - The eight extracted `@authfn/*` plugin packages are absent from release-packages.json.
   - `node scripts/resolve-release-tag.mjs authfn-core-v0.1.1` exits with the package-name mismatch.
2. **Passing core tests have stale/ignored build-artifact provenance.**
   - Core tests import extracted plugins by package name, while authfn/core/vitest.config.ts:4-12 aliases only `@authfn/client` to source.
   - Runtime resolution points `authfn` and extracted plugins to ignored `dist/index.js`; `.gitignore:7-12` excludes those artifacts.
   - Core/client tsconfigs exclude tests, so current test imports are not protected by their source type-check gates.
   - The 15-file/64-test result is therefore a hybrid source-plus-ignored-dist run, not reliable proof that current plugin source passed.
3. **All eight extracted plugin packages have empty direct test gates.**
   - `@authfn/api-keys`, `email-otp`, `multi-region`, `native-handoff`, `password`, `schema-plugin`, `social-oauth`, and `two-factor` each declare `vitest run` but contain zero direct test/spec files; each direct command exits 1 with “No test files found.”
4. **Both lookup adapters fail TypeScript compilation.**
   - authfn/adapters/lookup-cloudflare-do/src/index.ts:1-4 and authfn/adapters/lookup-dynamodb/src/index.ts:12-15 import the removed AuthFnRegionLookupStore and implement the old getByIdentifier/putIfAbsent contract.
   - The current contract is authfn/core/src/plugin-types.ts:126-134.
   - Cloudflare reports TS2724 plus four implicit-any errors; DynamoDB reports the same class of five errors.
5. **The JavaScript client suite has one current regression.**
   - `authfn/client/src/__tests__/client-account-settings.test.ts:314` expected eu-west-1 but received us-east-1.
   - The fixture still supplies the removed directory configuration; the new runtime only accepts lookupStore, so JavaScript silently ignores the stale option.
6. **Account-settings example server type checking fails.**
   - authfn/examples/account-settings/server/src/auth.ts:46 has an observability emit mismatch.
   - server/src/index.ts:136 and 144 use values imported with type-only syntax.
7. **Package versions are misaligned.**
   - authfn/svelte/package.json declares 0.1.0 and an exact @authfn/client 0.1.0 peer while the client is 0.1.1.
8. **Examples depend on ignored prebuilt local package output.**
   - Representative example client/server `build:deps` scripts build only the examples-shared/CLI subset, while imported client, Svelte, and plugin packages export from ignored `dist` directories.
   - A clean-clone example build was not run because it would create artifacts, so this is a high-confidence static release gap rather than a reproduced clean-clone failure.
9. **Python and Swift public contracts drift from the current TypeScript server.**
   - Python and Swift request `/runtime`; the current TypeScript server/client exposes `/environment`.
   - Python authenticates cookies then API keys but not bearer sessions, and its password routes ignore the TypeScript `sessionMode` contract.
   - Swift requests `/auth/widget-token`, for which no repository route or plugin was found.
10. **Aggregate workspace tests are not a reliable release signal.**
    - Passing builds/tests do not cover proxy trust, browser transaction binding, concurrency, cross-region replay, malicious WebView origins, cross-runtime password fixtures, or deployment dependency reachability.

## Positive controls and confirmed non-findings

- Session, API-key, and native-handoff secrets use cryptographically random bytes; TypeScript stores session/API-key/handoff values only as hashes.
- Session and API-key authentication checks absolute expiry and recorded revocation during ordinary non-racing requests.
- Passwords use random salts, scrypt, timing-safe comparison, and a 12-character minimum; optional compromised-password screening fails closed.
- Reviewed cookie-authenticated destructive routes require a session-bound double-submit CSRF value; session cookies are HttpOnly and Secure by default.
- TypeScript sequential OTP replay uses conditional consumedAt=null consumption.
- TypeScript TOTP seeds use AES-GCM through a required key resolver; TOTP counter replay uses conditional compare-and-swap.
- TypeScript OAuth state is high entropy, expiry-limited, provider/redirect matched, and atomically consumed.
- PKCE S256 is used for providers that advertise PKCE.
- Provider token/profile endpoints are fixed constants; no concrete user-controlled SSRF path was found.
- HTTP(S) redirect allowlisting generally requires an exact configured URL or allowed origin; SF-AUTH-037 proves that opaque custom schemes cannot safely use the same origin comparison, and SF-AUTH-005 covers the separate native returnTo parser.
- Account deletion removes the reviewed first-party session, password, API-key, OAuth, 2FA, handoff, and plugin records when those plugins are mounted.
- Admin construction requires explicit authorization before sensitive handlers; static-token comparison is timing safe.
- Svelte session state is memory-only and protects against late refresh races.
- No credible production secret was found. Detected keys/OTPs were test fixtures, deterministic demos, or placeholders.
- Sensitive-field event/error logging generally redacts password, token, code, authorization, cookie, private-key, and secret fields. SF-AUTH-026 remains an exception because client-envelope serialization can expose selected exception text.

## Validation results

| Check | Result |
|---|---|
| AuthFn core tests | **Hybrid/stale-artifact result:** 15 files, 64 tests passed, but package imports resolve ignored `dist` output rather than all current plugin source |
| Shared auth/HTTP/Hono tests | **Pass:** 56 tests |
| Shared OAuth core/flow/http/router/storage/provider tests | **Pass:** 102 tests |
| Python tests and smoke tests | **Pass:** 42 tests; Pydantic deprecation warnings remain |
| Swift tests | **Pass:** 6 tests |
| Admin tests | **Pass:** 5 tests |
| Svelte tests | **Pass:** 4 tests |
| Lookup adapter tests | **Pass against the legacy adapter contract:** 4 Cloudflare and 4 DynamoDB tests; both current-package type checks fail |
| Core/client/admin and eight modular plugin source type checks | **Pass;** core/client configs exclude test files |
| Eight extracted plugin direct test commands | **Fail as release gates:** each has a test script but zero test/spec files and exits 1 |
| Shared auth/HTTP/OAuth type checks | **Pass** |
| Cloudflare lookup adapter type check | **Fail:** removed interface plus implicit-any errors |
| DynamoDB lookup adapter type check | **Fail:** removed interface plus implicit-any errors |
| JavaScript client tests | **Fail:** 27/28 pass; stale multi-region configuration assertion |
| Release tag resolver | **Fail:** stale `@authfn/core` manifest name blocks tag resolution; extracted plugin packages are absent |
| Scoped diff whitespace check | **Pass** |
| Secret-pattern review | **Limited:** pattern-based current-tree review found no credible production credential; git-history, entropy, and provider-validation scans were not performed |
| AuthFn docs npm audit, resolved workspace graph | **Needs remediation:** 18 packages; 1 critical, 11 high, 5 moderate, 1 low; deployed reachability not fully established |

Tests confirm expected sequential behavior; they do not disprove the concurrency, transaction-binding, proxy, or deployment findings. Because core plugin imports resolved ignored build output, the core pass is not evidence that every reviewed source path executed. No production exploit was attempted.

## Recommendations (ranked)

### P0 — release blockers

1. Fix SF-AUTH-001 and add signed/body email mismatch regression coverage for both form_post and native Apple paths.
2. Replace Python deterministic OAuth encryption with an external secret resolver and rotate/re-encrypt any existing token vault.
3. Remove deployable unsigned-Apple verification bypasses.
4. Fix SF-AUTH-037 before any custom-scheme OAuth handoff: exact-match the scheme/host/path and replace bearer fragments with one-time PKCE-bound exchange codes.
5. Decide whether verified-email linking remains supported; if so, require cryptographically verified provider email and existing-account policy in every language.

### P1 — authentication boundary

1. Bind OAuth and web/native handoff transactions to the initiating browser/app; replace raw bearer delivery with one-time PKCE-bound exchange codes.
2. Make OTP/2FA attempts and consumption atomic in TypeScript and Python; add strict distributed throttling.
3. Persist and validate immutable session tenant/region/issuer/audience context.
4. Implement functional shared-provider authorization/revocation, bearer logout, and Swift remote revocation; revoke sessions on password reset.
5. Standardize and migrate versioned password records across TypeScript and Python.
6. Enforce server-side API-key grant policy and expose approved scopes through the shared first-class contract.
7. Add a canonical external-origin/trusted-proxy boundary and exact Swift WebView/client authority allowlists.
8. Fix the native returnTo parser before any handoff deployment.

### P2 — defense in depth and release integrity

1. Verify all OIDC ID tokens, reduce lookup disclosure, namespace and validate region stores, and pin regional client URLs.
2. Add global request byte/media-type limits, no-store headers, and public-error allowlists.
3. Enforce route auth metadata and emit OpenAPI security schemes.
4. Define credential precedence and reject ambiguous mixed schemes.
5. Fix release-packages.json/tag resolution, adapter/client/example type failures, and direct plugin test gates.
6. Upgrade the docs dependency graph and add an exact production-artifact audit.
7. Add clean-build npm packing gates and isolate demo servers from non-loopback environments.

## Required security regression suite

Before release, add automated tests for:

- Apple signed-email/body-email mismatch, absent verification, wrong audience, wrong issuer, wrong nonce, expired token, and unsigned token.
- OAuth state created in browser A and consumed in browser B.
- Opaque custom-scheme isolation: allowlisting one app scheme must reject every different scheme/host/path.
- No session bearer in any URL or Location header; one-time code exchange with PKCE, followed by a no-store proof-bound HTTPS token response.
- Handoff cross-browser consumption, device binding, source expiry, and slash/backslash redirect payloads.
- Twenty concurrent wrong OTP/2FA attempts, 100 concurrent correct OTP submissions in Python, and concurrent recovery-code/challenge consumption in both runtimes.
- Recovery-code reuse across simultaneous challenge IDs.
- Rate-limit concurrency across nodes and spoofed forwarding headers behind trusted and untrusted proxies.
- Cross-region/tenant cookie and bearer replay.
- Provider revoke, Swift sign-out, and password reset invalidating a token used from a second client.
- TypeScript and Python reciprocal password-hash verification plus versioned rehash fixtures.
- API-key scope escalation and revoke/auth interleaving.
- WebView messages from malicious origins, subdomains, ports, schemes, and after navigation.
- Oversized fixed-length/chunked JSON and multipart form bodies.
- Two namespaces sharing region lookup infrastructure plus poisoned lookup records.
- Cookie-vs-bearer identity conflicts and incorrect credential schemes.
- npm pack from a clean checkout and an audit of the exact deployed docs artifact.

## Appendix: commands run + environment details

Representative commands used during the audit:

    git status --short
    git rev-parse HEAD
    git rev-list --left-right --count HEAD...origin/dev
    rg --files authfn packages
    rg -n <security-patterns> authfn packages
    git diff --check -- authfn packages/auth packages/http packages/http-express packages/http-hono packages/oauth-*
    npm --prefix authfn/core test
    npm --prefix authfn/client test
    npm --prefix authfn/admin test
    npm --prefix authfn/svelte test
    npm --prefix authfn/adapters/lookup-cloudflare-do test
    npm --prefix authfn/adapters/lookup-dynamodb test
    npm --prefix <reviewed-package> run typecheck
    PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -p no:cacheprovider authfn/python/tests authfn/python/tests_smoke
    swift test --package-path authfn/swift
    npm audit --workspace=authfn/docs --omit=dev --json
    node -e <URL resolution probe>
    node scripts/resolve-release-tag.mjs authfn-core-v0.1.1
    node -e <package resolution provenance probe>

The full report is evidence for this exact working-tree snapshot only. Production configuration and newer upstream commits require a follow-up review.
