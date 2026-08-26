# uifn Hooks

This document is generated from the hook manifests in `uifn/registry/catalog/hooks` and the reusable hook stories in `uifn/components/stories/hooks`.

## useMediaQuery

Purpose: subscribe to a media query in client environments while returning an SSR-safe fallback on the server.

Framework APIs:

- React: `useMediaQuery(query, options)` from `@uifn/components-react` or `@uifn/react/hooks/use-media-query`.
- Svelte: `createMediaQuery(query, options)` and `useMediaQuery(query, options)` from `@uifn/components-svelte` or `@uifn/svelte`.
- Solid: `createMediaQuery(query, options)` and `useMediaQuery(query, options)` from `@uifn/components-solid` or `@uifn/solid`.

Source install targets:

- `components/hooks/react/use-media-query.ts`
- `components/hooks/svelte/use-media-query.ts`
- `components/hooks/solid/use-media-query.ts`

SSR and cleanup contract:

- Server fallback defaults to `false` and can be overridden with `defaultValue`.
- No DOM globals are required during SSR.
- Client subscriptions attach to `matchMedia(query)` and remove their listener during cleanup.

## useCopyToClipboard

Purpose: write text to the clipboard and expose success or failure as an explicit result.

Framework APIs:

- React: `useCopyToClipboard(options)` from `@uifn/components-react` or `@uifn/react/hooks/use-copy-to-clipboard`.
- Svelte: `createCopyToClipboard(options)`, `useCopyToClipboard(options)`, and `copyToClipboardAction` from `@uifn/components-svelte` or `@uifn/svelte`.
- Solid: `createCopyToClipboard(options)` and `useCopyToClipboard(options)` from `@uifn/components-solid` or `@uifn/solid`.

Source install targets:

- `components/hooks/react/use-copy-to-clipboard.ts`
- `components/hooks/svelte/use-copy-to-clipboard.ts`
- `components/hooks/solid/use-copy-to-clipboard.ts`

Failure contract:

- Missing clipboard APIs return `{ ok: false, error: { code: "clipboard-unavailable" } }`.
- Rejected writes return `{ ok: false, error: { code: "clipboard-write-failed" } }`.
- Successful writes return `{ ok: true, text, error: null }`.
