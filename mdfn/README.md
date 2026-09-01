# mdfn

mdfn is the Markdown-native authoring platform for Superfunctions. Markdown is
the durable boundary; structured editor state is derived, versioned, and
replaceable.

The package graph separates environment-neutral parsing, transactions, safe
rendering, and extension contracts from browser editing, framework bindings,
UIFn chrome, persistence, collaboration, and ecosystem bridges.

## Guarantees

- No-edit import/export is byte-identical.
- Supported syntax has a semantic round trip.
- Visual edits normalize only the touched top-level source regions whenever
  their source spans remain mappable.
- Unsupported and disabled constructs survive as opaque nodes with
  diagnostics.
- Raw HTML is disabled by default.
- React, Svelte, Solid, and vanilla DOM share the same semantic controller.
- Comments, suggestions, review transitions, history, and audit data live in a
  validated sidecar bound to the canonical source.
- Collaboration updates are authenticated before application and must match
  the document, schema, profile, protocol, and extension contract.
- Durable server operation is transactional; the explicit ephemeral mode is
  reserved for memory-backed tests and examples.

## Authoring surfaces

`@mdfn/components` exposes the framework-neutral toolbar, slash-command,
outline, diagnostics, asset, and editorial models. The React, Svelte, and Solid
component packages render the same model with UIFn. The vanilla DOM adapter and
all framework adapters share command, selection, undo/redo, file-drop, paste,
and source-fallback semantics.

Framework packages publish separate browser and server entry points. Packed
consumer verification builds and executes browser and SSR applications for all
three framework adapters and checks ESM, CJS, and extension subpath exports.

## Verification

From the repository root:

```sh
npm run verify:mdfn
npm run verify:mdfn-browser
npm run verify:mdfn-consumers
npm run verify:mdfn-examples
```

The complete gate includes the official CommonMark examples, deterministic
fuzz and large-document checks, package builds/typechecks/tests/packs, runtime
export checks, SSR execution, and Chromium, Firefox, WebKit, and mobile browser
flows.

Runnable React, Svelte, and Solid authoring apps, together with their browser
workflow and artifact contract, are documented in `mdfn/examples/README.md`.

See `mdfn/.conduct/MDFN-01` for the normative product, content, architecture,
extension, security, verification, and delivery contracts.
