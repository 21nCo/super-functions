---
title: Core Concepts
description: The mental model behind authfn — sessions, plugins, regions, and observability.
---

# Core Concepts

authfn is built around a small set of ideas. Everything you'll do — adding a sign-in method, switching databases, going multi-region — composes from these primitives.

- **[Sessions](./sessions)** — how authfn establishes and verifies who a request belongs to, with cookie- and token-based modes.
- **[Plugins](./plugins)** — opt-in modules that add sign-in methods (`password`, `emailOtp`, `socialOAuth`, `apiKeys`, `twoFactor`) and other capabilities.
- **[Regions](./regions)** — multi-region routing for users whose data lives in a specific geography.
- **[Observability](./observability)** — structured lifecycle events for every meaningful action.
