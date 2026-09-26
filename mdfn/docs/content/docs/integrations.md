---
title: Integrations
description: Connect assets, search, content, and AI through explicit bridges.
---

MDFN keeps ecosystem bridges separate from the headless controller. `@mdfn/filefn` formats and checks asset URLs; `@mdfn/searchfn` extracts searchable content; `@mdfn/contentfn` maps snapshots and sidecars into content workflows. `@mdfn/ai` treats model output as data, validates ranges, and sends accepted edits through the regular transaction pipeline.

Use only the bridge needed by the host. Keep access control and storage in the respective host service. Package guides: [FileFn](/docs/reference/filefn), [SearchFn](/docs/reference/searchfn), [ContentFn](/docs/reference/contentfn), and [AI](/docs/reference/ai).
