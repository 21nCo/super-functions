---
title: Plugins
description: How authfn plugins compose into a single auth runtime.
---

# Plugins

Every sign-in method in authfn is a **plugin**: `password`, `emailOtp`, `socialOAuth`, `apiKeys`, `twoFactor`, `multiRegion`. You enable only the ones you need, and each plugin contributes its own routes, schema, and OpenAPI surface.

> Stub page — fill in with: plugin lifecycle, ordering, configuration patterns, writing your own plugin.
