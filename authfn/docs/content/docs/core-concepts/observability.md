---
title: Observability
description: Structured lifecycle events for every authfn action.
---

# Observability

Every meaningful action in authfn — sign-up, sign-in, OTP send, session rotation, OAuth callback — emits a structured event through the `observability.emit` callback you provide at construction. Wire it up to your logging, metrics, or audit pipeline.

> Stub page — fill in with: event taxonomy, request correlation, sampling, redaction.
