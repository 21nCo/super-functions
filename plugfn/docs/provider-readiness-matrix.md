# PlugFn Provider Readiness Matrix

This matrix is the public source of truth for provider readiness. A provider is not production-ready unless:

1. this matrix marks it `production`
2. the repo-root PlugFn release gate passes on the same commit

Unlisted providers are unsupported by default.

Important: a `production` row means the provider contract and parity scope are the intended release target. The provider is only production-ready on a given commit when the repo-root PlugFn release gate is also green on that same commit.

## Status vocabulary

- `production`: release-gated and approved for default adoption
- `beta`: useful and intentionally supported, but not yet release-gated
- `experimental`: present but still under hardening or incomplete
- `vertical-only`: useful for a specific product or mail workflow, not part of the default shared-runtime adoption story
- `unsupported`: not currently available for adoption

## Core provider set tracked by the release gate

The minimum provider set that the release gate tracks is:

- `github`
- `linear`
- `clickup`
- `gmail`
- `notion`

## Matrix

| Provider | Scope | Overall status | TypeScript readiness | Python readiness | Notes |
| --- | --- | --- | --- | --- | --- |
| github | core | production | production | production | Core provider contract exists in both languages; final production-ready claim still depends on the repo-root release gate. |
| linear | core | production | production | production | Core provider contract exists in both languages; final production-ready claim still depends on the repo-root release gate. |
| clickup | core | production | production | production | Core provider contract exists in both languages; final production-ready claim still depends on the repo-root release gate. |
| gmail | core | production | production | production | Core provider contract exists in both languages; final production-ready claim still depends on the repo-root release gate. |
| notion | core | beta | production | unsupported | TypeScript provider is release-gated for Nucleum adoption; overall status stays beta until Python parity exists. |
| slack | adjacent | experimental | experimental | experimental | Present in both trees, but not part of the declared core release set. |
| discord | adjacent | experimental | experimental | unsupported | TypeScript-only today. |
| stripe | adjacent | experimental | experimental | unsupported | TypeScript-only today. |
| outlook | vertical | vertical-only | vertical-only | unsupported | Mail-focused vertical surface, not default shared-runtime scope. |
| yahoo | vertical | vertical-only | vertical-only | unsupported | Mail-focused vertical surface, not default shared-runtime scope. |
| icloud | vertical | vertical-only | vertical-only | unsupported | Mail-focused vertical surface, not default shared-runtime scope. |
| imap-smtp | vertical | vertical-only | vertical-only | unsupported | Mail-focused vertical surface, not default shared-runtime scope. |
| forwarding | vertical | vertical-only | vertical-only | unsupported | Mail-focused fallback surface, not default shared-runtime scope. |
| managed-mail | vertical | vertical-only | vertical-only | unsupported | Product-specific mail surface with additional policy concerns. |

## Interpretation rules

- Do not convert `beta`, `experimental`, or `vertical-only` entries into blanket production claims.
- Do not assume source-tree presence equals supported adoption.
- Python parity for the core set is now tracked provider-by-provider in this matrix rather than by blanket language claims.
