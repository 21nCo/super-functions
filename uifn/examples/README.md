# uifn examples

Private Workbench apps for exercising `@uifn/*` components, patterns, Superfunction-backed panels, and browser QA in realistic routes.

## Workspace Layout

- `@uifn/examples` - command hub for Workbench apps
- `@uifn/examples-shared` - shared inventories, QA contracts, route manifests, fixtures, and report schemas
- `@uifn/example-react-workbench` - React Workbench app
- `@uifn/example-svelte-workbench` - Svelte Workbench app
- `@uifn/example-solid-workbench` - Solid Workbench app

## Commands

Run from the repository root:

```bash
npm run verify:uifn-examples
npm run verify:uifn-browser
npm run verify:uifn-overlays
npm run verify:uifn-workbench
npm --workspace @uifn/examples run dev:react
npm --workspace @uifn/examples run dev:svelte
npm --workspace @uifn/examples run dev:solid
npm --workspace @uifn/examples run build
```

`npm run verify:uifn-examples` performs the canonical workspace, manifest, executable-contract, visual-baseline inventory, build, docs, and offline checks for the example bundle.

`npm run verify:uifn-browser` starts or reuses the Workbench dev servers and runs Playwright Chromium against real routes. It supports filters such as `--framework react`, `--family component`, `--profile overlay`, `--slug popover`, and `--route /components/button/qa/default`.

`npm run verify:uifn-overlays` runs the focused overlay and collision subset for dropdown-menu, context-menu, menubar, select, combobox, popover, hover-card, tooltip, dialog, alert-dialog, and sheet.

Product scenarios live under `/scenarios` and link each covered component, pattern, and Superfunction panel back to its focused QA route.

## Browser QA Semantics

Browser QA assertions execute the actions declared by each fixture contract. Form routes type into a control owned by the component root, dispatch a real submit event, inspect `FormData`, callback-visible state, disabled stability, and invalid ARIA. Data-rich routes perform table sort/filter/keyboard selection, calendar/date-picker keyboard selection with min/max boundaries, command filtering and selection, resizable pointer/keyboard changes, and sidebar responsive/persistence flows.

Overlay routes use distinct viewport-edge, mobile, scroll-container, overflow-clipping, transformed-parent, long-content, nested-overlay, and RTL stages. They verify exact trigger/content association, viewport and fixture boundaries, contract-specific alignment tolerance, Escape and outside-click dismissal, focus return, and dialog focus trapping/scroll locking.

Pattern and Superfunction routes render product data and callback-specific actions instead of marker cards. SF routes create fixture-scoped fake clients and counters; browser interception rejects cross-origin traffic and same-origin `fetch`/XHR-style API traffic.

Visual QA records exact screenshot hashes plus full-resolution threshold hashes, DOM clipping, text-node overlap, semantic token presence, axe results, and keyboard naming. The threshold hashes tolerate only sub-quantization antialiasing noise; meaningful drift still fails. Missing exact or threshold hashes fail visual scope. The canonical matrix is one reviewed route per contract across three frameworks, four themes, and three viewports. Baselines live at `uifn/examples/browser-qa/baselines/visual-hashes.json` and only update when explicitly run with:

```bash
UIFN_UPDATE_VISUAL_BASELINES=1 npm run verify:uifn-browser -- --scope visual
```

Long browser gates emit structured progress to stderr while keeping JSON on stdout. Use deterministic sharding for CI or local diagnosis:

```bash
npm run verify:uifn-browser -- --list-shards --shard-count 5
npm run verify:uifn-browser -- --shard-count 5 --shard-index 0
npm run verify:uifn-workbench -- --shard-count 5
```

Each route has a timeout envelope and fails with `UIFN_BROWSER_ROUTE_TIMEOUT` if it exceeds the configured limit. Override the default when diagnosing slow visual routes:

```bash
npm run verify:uifn-browser -- --route-timeout-ms 180000 --scope visual
```

Visual cells use an independent timeout (`UIFN_VISUAL_CELL_TIMEOUT_MS`, default 30 seconds), so one slow theme/viewport cell cannot consume the whole route matrix timeout.

## Dev Ports

- React Workbench: `6111`
- Svelte Workbench: `6112`
- Solid Workbench: `6114`

## Route Conventions

- `/components`
- `/components/:slug`
- `/components/:slug/states`
- `/components/:slug/qa`
- `/components/:slug/qa/:caseId`
- `/scenarios`
- `/scenarios/:slug`
- `/patterns`
- `/patterns/:slug`
- `/patterns/:slug/qa`
- `/sf`
- `/sf/:slug`
- `/sf/:slug/qa`
- `/qa/all`
- `/qa/overlays`
- `/qa/forms`
- `/qa/data-rich`
- `/qa/keyboard`
- `/qa/responsive`
- `/qa/themes`

## Notes

- These apps are private workspaces and are not published to npm.
- Examples use fake data and injected fake Superfunction clients only.
- Browser QA must not require real network, secrets, machine-local env files, or live Superfunction backends.
- Integrated pattern and Superfunction routes are experimental-demo surfaces and do not participate in the stable package gate.
