---
title: Source preservation
description: Keep untouched Markdown bytes and unknown constructs.
---

The canonical Markdown parser records raw slices and source spans. A no-edit parse and serialize returns byte-identical input. Supported syntax has a semantic round trip; unsupported or disabled constructs remain opaque with diagnostics.

When a visual edit changes a mappable top-level region, MDFN patches that region and leaves other source bytes alone. If a span cannot be mapped safely, the serializer may normalize a broader region. Persist the serialized Markdown after edits; keep the original input only as the serializer’s preservation baseline and review diagnostics when importing unfamiliar syntax.

The [Markdown package](/docs/reference/markdown), [source editor](/docs/reference/source), and [testing helpers](/docs/reference/testing) explain these contracts.
