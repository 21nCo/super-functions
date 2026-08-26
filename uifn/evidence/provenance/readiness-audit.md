# uifn 10/10 Readiness Full Audit

## Metadata

| Field | Value |
| --- | --- |
| Audit ID | `ee1f9d6c` |
| Date | 2026-07-17 |
| Auditor | Codex |
| Repository | `/Users/serro/Documents/dev/n/superfunctions-SFN-15-uifn` |
| Scope | `uifn/core`, shared platform/runtime packages, React/Svelte/Solid adapters, styled components, registry/source installation, Storybook, examples, test/evidence, packaging, accessibility, performance, security, and release |
| Authoritative intent | User request in the current task; ten confirmed scope decisions; `uifn/.conduct/SFN-15`; earlier production-readiness specs and workbench issue spec |
| Audit type | Exhaustive, read-only implementation and evidence audit followed by a separate remediation spec |
| Target | Accessibility confidence 10/10 and production maturity 10/10, comparable in rigor to mature Zag/Ark, Base UI, and Radix primitive approaches |
| Verdict | **FAIL — not ready for a 1.0 or a 10/10 claim** |

## Executive verdict

The repository contains a large amount of useful work: 25 core controller facades, broad React and Svelte component surfaces, a start on Solid, green unit/type checks for the three retained frameworks, real Chromium/Playwright smoke infrastructure, packaging checks, a registry CLI, token contrast utilities, and explicit evidence artifacts. Those are real strengths.

They do not yet add up to the requested architecture or confidence level. The defining weakness is that `state + actions + parts` is often a wrapper around older hand-written stores while framework components continue to own behavior, DOM effects, controlled-state synchronization, and accessibility logic. There is no single rigorous behavior/effect runtime and no single cross-framework DOM platform. The test suite frequently proves generic prop plumbing, fixed demo compositions, manifest metadata, or presence of any event rather than equivalence of the actual public components.

The current accessibility evidence cannot support a 10/10 claim. The checked-in manual evidence explicitly says `blocked-no-human-verifier`, with no VoiceOver or NVDA run. The automated verifier emits `wcag: "AA"`, but it checks only the batch-B manifest plus generated DOM/Chromium smoke and does not establish WCAG 2.2 AA, APG behavior, the chosen browser/AT matrix, mobile screen readers, forced colors, zoom, RTL, or an independent review.

The current stable-looking package graph also targets five frameworks and makes `@uifn/components` depend on every framework adapter. Vue and Angular remain part of release success, while `patterns` and `sf` beta packages remain blocking. That is the opposite of the newly confirmed target: React, Svelte, and Solid are mandatory; Vue and Angular are removed; `patterns` and `sf` are explicitly experimental and cannot block the stable 1.0.

### Readiness scorecard

These scores are diagnostic, not release certifications. A 10 requires every mandatory gate in the accompanying spec to have current evidence; scores are not averaged to waive a failed gate.

| Dimension | Current score | Why |
| --- | ---: | --- |
| Public controller idea | 7/10 | The facade is coherent and useful, and 25 primitives expose it. Lifecycle, update semantics, typing, and actual ownership are incomplete. |
| Internal behavior runtime | 2/10 | A public flat `StateMachine`, primitive-local stores, direct mutable controllers, and adapter behavior coexist. No owned effects/runtime model exists. |
| DOM behavior services | 2/10 | Focus, dismissal, positioning, portals, presence, scroll lock, and inerting are simplified and duplicated across frameworks. |
| React primitive DX | 5/10 | Broad compound API, but behavior often bypasses core; real React 19/RSC/SSR edge coverage is absent. |
| Svelte primitive DX | 5/10 | Broad component surface, but it mixes legacy machines, controller roots, local state, and framework-owned effects. |
| Solid primitive DX | 3/10 | Headless factories cover 25 names, but only seven compound component families are implemented and tested as JSX components. |
| Styled component DX | 3/10 | Forty-five exports exist, but many are closed, hard-coded product/demo scenes rather than reusable compound components. |
| Accessibility confidence | 3/10 | Axe/Chromium smoke exists; normative per-primitive behavior and the selected manual AT matrix do not. |
| Production maturity | 4/10 | Unit/type/pack checks are meaningful, but compatibility, performance, leak, supply-chain, release, and human evidence gates are incomplete or mis-scoped. |
| Overall 1.0 readiness | **3/10** | Several foundations are promising, but P0 architecture and evidence gaps make the current surface unsafe to call 10/10 or peer-rigorous. |

## Confirmed target decisions

The audit and remediation spec use these decisions as authoritative:

1. Keep the public controller facade and replace competing internals with one private, owned runtime; focused proven dependencies are allowed.
2. Remove both Vue and Angular, including packages, fixtures, docs, catalogs, and release gates.
3. Breaking cleanup is authorized; no compatibility shims are required.
4. Expand the primitive/catalog breadth instead of only polishing the current 25 primitives.
5. The stable target includes core, DOM/platform services, adapter-kit, React, Svelte, Solid, hooks/utilities, tokens, theme, Tailwind integration, recipes, styled components, registry/source installation, real Storybook, docs, examples, evidence, and release. `patterns` and `sf` remain separate experimental tracks and are not 1.0 blockers.
6. Accessibility target: WCAG 2.2 AA, applicable APG behavior, axe, keyboard/focus, pointer/touch, RTL, forced colors, reduced motion, zoom/reflow, VoiceOver macOS/iOS, NVDA Windows, and TalkBack Android. JAWS is the only explicitly deferred AT.
7. Compatibility target: React 18.3 and 19, Svelte 5, current Solid 1.x, latest two Chrome/Firefox/Edge, current and previous Safari/iOS Safari, current Android Chrome, and Node 20/22/24.
8. Package installation and source installation are both first-class and generated from the same canonical definitions.
9. Numeric production and performance budgets are mandatory.
10. Automated gates, signed manual evidence, unresolved-defect review, dependency/provenance/license review, and an independent accessibility review are all mandatory before 1.0.

## Scope and inputs reviewed

### Repository intent and specifications

- `AGENTS.md` repository rules supplied in the current task.
- `uifn/.conduct/SFN-15/README.md`, `SPEC.md`, `REQUIREMENTS.md`, `TEST_VECTORS.md`, `PLAN.md`, `INTENT_AUDIT.md`, all seven sub-specifications, and all twenty phases.
- Earlier audit-fix bundles under:
  - `uifn/.conduct/specs/2026-03-20-audit-fix-dhrtycgi-spec`
  - `uifn/.conduct/specs/2026-03-25-audit-fix-zl6gfhpb-spec`
  - `uifn/.conduct/specs/2026-03-26-new-mrxtiesy-spec`
- Workbench issue bundle `uifn/.conduct/issues/2026-06-28-new-wkbqa7m2-spec`.
- Existing full audits through `uifn/.conduct/audits/2026-07-10-0def6855-full-audit.md`.
- Current issue/fix/evidence artifacts, especially:
  - `uifn/.conduct/issues/2026-07-16-component-catalog-findings.md`
  - `uifn/.conduct/SFN-15/fix-logs/2026-07-17-production-readiness-closure.md`
  - `uifn/.conduct/release-evidence/manual-a11y.json`

### Implementation and package surface

- All publishable `@uifn/*` package manifests and their export/dependency graphs.
- `uifn/core/src`, including controller, environment, parts, state machine, primitive-local stores, all primitive implementations, controller migration inventory, and DOM utilities.
- React, Svelte, Solid adapter/component/conformance implementations and representative tests.
- Vue and Angular only as removal/current-gate evidence; they are not retained targets.
- Tokens, themes, recipes, styled component implementations, data-rich controllers, registry/source installer, Storybook package, workbench/browser QA runner, verification scripts, and release scripts.
- Tarball dry-run output for all sixteen current publishable packages.

### External primary-source comparison baseline

The comparison is about approach and rigor, not source compatibility or copying.

- Zag official overview and machine-building guide: <https://zagjs.com/> and <https://zagjs.com/guides/building-machines>
- Ark UI official overview/catalog: <https://ark-ui.com/docs/overview/about>
- Base UI official overview: <https://base-ui.com/react/overview/about>
- Radix Primitives official component and accessibility documentation: <https://www.radix-ui.com/primitives>
- W3C WCAG 2.2 and ARIA Authoring Practices: <https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/>, <https://www.w3.org/WAI/ARIA/apg/patterns/>, and <https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/>

The WAI-ARIA APG is guidance rather than a substitute for normative WCAG, ARIA, and HTML conformance. The target therefore requires both applicable APG interaction behavior and direct WCAG/semantic review.

## Current system map

```text
public @uifn/core exports
  ├─ public generic StateMachine
  ├─ primitive-local createStore implementations
  ├─ older createX machines
  ├─ hand-written createXController implementations
  └─ wrapper createXController implementations in controller-adapters.ts

framework adapters
  ├─ sometimes consume createXController
  ├─ sometimes consume legacy createX
  ├─ sometimes use generic createAdapterPrimitiveController
  └─ frequently own focus, portal, dismissal, position, controlled state, and keyboard logic

styled @uifn/components
  ├─ one package with all five framework adapters as dependencies
  ├─ separate framework renderers and data-rich state
  └─ mostly precomposed product/demo scenes rather than compound primitives

verification
  ├─ useful unit/type/tarball checks
  ├─ generic adapter vector fixtures
  ├─ generated Chromium/axe/visual smoke
  └─ no completed selected manual AT matrix or independent review
```

## Intent coverage matrix

| Intent | Current status | Evidence summary |
| --- | --- | --- |
| Keep `state + actions + parts` public facade | Partial | `UIFnController` exists and 25 primitive names are listed as migrated. Actual behavior ownership remains split. |
| One private owned runtime | Fail | Public flat StateMachine, primitive-local stores, direct controllers, wrappers, and framework-owned state all coexist. |
| Comparable rigor to Zag/Ark/Base/Radix | Fail | Missing reactive inputs/scope/effects/cleanup/actor composition, robust DOM services, full component parity, and peer-level evidence. |
| Accessibility confidence 10/10 | Fail | Automated smoke is green; manual artifact is blocked and selected AT/browser/display-preference matrices are absent. |
| Production maturity 10/10 | Fail | No hard size/latency/leak budgets, incomplete compatibility matrix, outdated target graph, and no final independent release review. |
| React, Svelte, Solid minimum | Partial | React/Svelte are broad; Solid has only seven JSX compound families. |
| Drop Vue and Angular | Not implemented | Packages, catalogs, examples, registry metadata, and release checks still require both. |
| Expanded catalog | Fail | Core exposes 25 primitive families; comparable ecosystems expose materially broader catalogs and utilities. |
| Package and source install from one definition | Partial | Registry/checksum machinery exists, but implementations and fixtures are separately maintained across packages/frameworks. |
| Patterns/SF experimental and non-blocking | Fail | Marked beta in package graph but still executed as blocking release checks. |

## Positive findings

1. The public facade is a good direction. `UIFnController` makes state, actions, parts, subscription, and disposal discoverable (`uifn/core/src/controller.ts:8-19`).
2. The codebase has meaningful baseline tests: current core, adapter-kit, React, Svelte, and Solid test/typecheck commands all passed in this audit.
3. `ChangeMeta` already includes source, reason, previous/next value, and input modality (`uifn/core/src/primitives/shared.ts:1-14`), which is a useful seed for a richer transaction envelope.
4. Deterministic ID allocation and duplicate detection are explicit (`uifn/core/src/environment.ts:72-143`).
5. The current workbench does run real Chromium pages and axe. This is better than DOM-string-only testing and should be retained as one layer, not treated as the whole accessibility program.
6. Tarball dry-runs, forbidden-path checks, registry checksums, clean-room metadata, and docs redaction checks are useful release hygiene.
7. Token utilities include OKLCH conversion and contrast checking, and themes include light/dark/high-contrast variants.
8. Existing failure artifacts are unusually candid. `manual-a11y.json` correctly records that no human AT verification occurred rather than fabricating results.

## Findings

### F-01 — P0 — Accessibility and 1.0 claims have no completed human/independent evidence

**Observed**

- `uifn/.conduct/release-evidence/manual-a11y.json:2-21` has status `blocked`, methodology `blocked-no-human-verifier`, no environments, and no families.
- `scripts/verify-uifn-a11y.mjs:98-204` requires a batch-B manifest count, booleans such as `fixture.a11y.keyboard`, and two generated test commands. It then emits `wcag: 'AA'` without a WCAG 2.2 success-criterion ledger or human evidence.
- The current verifier lists five frameworks and only batch B. It does not cover the retained three-framework expanded catalog.
- Existing evidence is Chromium-centric. No signed VoiceOver macOS/iOS, NVDA, or TalkBack results were found. Forced-colors, 200%/400% zoom and reflow, RTL/bidi, reduced-motion behavior, mobile virtual keyboard, and independent accessibility review are not complete release artifacts.

**Impact**

The most consequential requested outcome—accessibility confidence 10/10—cannot be claimed. Axe success cannot detect correct announcements, focus order, mode transitions, virtual-cursor behavior, touch-screen-reader interaction, or whether a widget follows its expected keyboard model.

**Required approach**

Create a per-primitive normative behavior ledger; generate automated vectors from it; execute the selected browser/AT/display-preference matrix; require named/signed manual evidence; and require an independent accessibility review with all P0/P1 findings closed. JAWS alone is explicitly excluded for now.

### F-02 — P0 — There is no single owned behavior runtime

**Observed**

- `@uifn/core` publicly re-exports `./state` and wildcard state internals (`uifn/core/src/index.ts:1-8`, `uifn/core/package.json`).
- `StateMachine` is a flat, mutable interpreter. Actions mutate context in place, and subscribers are notified only when the state string changes (`uifn/core/src/state/machine.ts:30-98`). A context-only transition can silently change data without notification.
- It has no explicit start/stop status, event queue, reentrancy contract, immutable snapshots, reactive input/context, refs, scope, invoked effects, abort/cleanup, schedulers, delayed transitions, child services, or trace envelope.
- Primitive-local `createStore` always replaces/merges synchronously and iterates listeners directly, with no equality, transaction queue, batching, listener error isolation, destroy state, or snapshot immutability (`uifn/core/src/primitives/shared.ts:16-43`).
- `controller-adapters.ts` wraps older `createX` machines for many primitives, while Dialog, Checkbox, Popover, Select, Tabs, and Tooltip contain separate hand-written controller implementations. The controller migration list says all 25 are migrated, but migration means “has a facade,” not “uses one runtime.”

**Impact**

Behavior semantics differ by primitive and by framework. Reentrancy, controlled updates, same-state changes, cleanup, and error behavior cannot be reasoned about globally. Every new primitive adds another bespoke state/effect implementation.

**Required approach**

Delete the public generic StateMachine and all legacy duplicate paths. Build one private purpose-built UI behavior service with typed immutable snapshots, FIFO run-to-completion events, reactive input updates, computed context, refs and document/root scope, deterministic schedulers, effect cleanup/abort, child service composition, structured errors, and trace metadata. Controllers remain the only public behavior surface.

### F-03 — P0 — Framework packages remain behavior implementations, not thin adapters

**Observed**

- React Accordion implements controlled state, item registration, roving focus, IDs, and click behavior locally rather than consuming `createAccordionController` (`uifn/react/src/accordion.tsx`).
- React ContextMenu owns point state, keyboard opening, positioning, outside dismissal, focus movement, and portal rendering (`uifn/react/src/context-menu.tsx:41-300`).
- React Dialog consumes some controller data but still owns focus trap, scroll lock, outside interaction, portal, presence, and focus restoration.
- Svelte Accordion imports legacy `createAccordion`, and Svelte Combobox imports legacy `createCombobox` (`uifn/svelte/src/Accordion.svelte`, `uifn/svelte/src/Combobox.svelte`).
- Svelte and React each have separate focus, dismissal, portal, and position implementations. Solid JSX implementations cover only seven families.

**Impact**

The same named primitive can have different keyboard, focus, portal, dismissal, timing, and controlled-state behavior. Fixes made in core do not necessarily reach the public components.

**Required approach**

All framework components must be render/lifecycle adapters over the same controller and DOM services. Framework packages may translate props/events/refs and expose native composition syntax, but must not implement behavior decisions or duplicate platform algorithms.

### F-04 — P0 — Platform DOM services are too shallow and fragmented for production overlays

**Observed**

- Core focusability uses a short selector and does not exclude hidden/inert/offscreen/non-rendered cases or coordinate nested traps, portals, shadow roots, radio groups, and ARIA-controlled elements (`uifn/core/src/utils/focus-trap.ts:3-4`, `104-195`).
- Outside click uses `element.contains(event.target)` over `mousedown`/`touchstart`; it has no `composedPath`, branch registration, nested layer stack, focus-outside channel, cancelable detail, or top-layer arbitration (`uifn/core/src/utils/outside-click.ts:16-69`).
- Positioning is a custom viewport flip/align/clamp function (`uifn/core/src/utils/position.ts:15-354`). It does not implement clipping ancestors, transformed containing blocks, auto-update observers, virtual references, arrow/size/hide middleware, or logical RTL placement.
- Portal, presence, body scroll lock, focus return, inerting, and dismissal are separately implemented in core/adapter-kit/framework packages.

**Impact**

Nested dialogs/popovers/menus, shadow DOM, mobile touch, scroll containers, transforms, collision boundaries, focus restoration, and cleanup are high-risk. These are precisely the long-tail cases mature primitive libraries spend years hardening.

**Required approach**

Add an owned `@uifn/dom` platform layer with document/root scope, dismissable-layer stack, focus-scope stack, portal branches, modal inert/aria-hidden management, reference-counted scroll lock, presence, live regions, form bridges, modality tracking, observers, and Floating UI-based positioning. Use focused vetted dependencies such as Floating UI and `tabbable` where they materially reduce risk.

### F-05 — P0 — Cross-framework conformance does not prove the shipped public component APIs

**Observed**

- Adapter-kit defines generic primitive vectors, but React conformance primarily renders a synthetic primitive fixture through `usePrimitiveController` and inferred tags.
- Svelte conformance constructs DOM nodes and applies generic headless actions rather than mounting every public Svelte compound tree.
- Solid conformance invokes generic `createPrimitive`; the public JSX adapter matrix mounts only Dialog, Checkbox, Tabs, Select, Popover, and Tooltip.
- The browser interaction assertion often passes by observing that any click/keydown occurred (`uifn/examples/browser-qa/src/assertions/interaction.mjs:55-132`). For form, overlay, and data-rich profiles, `expectedActionObserved` is unconditionally true at lines 121-124 because specialized assertions are expected elsewhere; many progress lines show irrelevant assertions completing in 0 ms.

**Impact**

Green adapter/browser matrices can coexist with real drift in component anatomy, controlled inputs, portals, focus, cleanup, SSR, and framework-native composition.

**Required approach**

Generate semantic traces from actual public compound components in React, Svelte, and Solid. A vector must assert initial markup, event sequence, state/change metadata, DOM/ARIA/focus result, callback count, cleanup result, and SSR/hydration result. Generic fixtures may supplement but cannot substitute for public API conformance.

### F-06 — P0 — Solid is not a peer-complete framework adapter

**Observed**

- `uifn/solid/src/components` contains JSX compound components only for Checkbox, Dialog, Popover, Select, Switch, Tabs, and Tooltip.
- `uifn/solid/src/index.ts:8-21` exports generic factories for the other primitive names, not full compound component trees.
- Solid’s public component matrix test mounts six behavior families plus Checkbox and does not cover the remainder.

**Impact**

The current package cannot be described as a minimum-supported framework at the same level as React and Svelte.

**Required approach**

Every stable catalog entry must have a typed, documented, SSR-safe Solid compound API with the same semantic contract and release vectors as React and Svelte.

### F-07 — P0 — `@uifn/components` is a demo/composition catalog, not a Base/Radix-quality styled primitive layer

**Observed**

- The package depends directly on all five adapter packages and declares all five UI frameworks as peers (`uifn/components/package.json`). A React consumer receives a package graph coupled to Svelte, Vue, Solid, and Angular adapters.
- Public framework exports are factory-created single components per catalog name, not consistent compound styled primitives.
- Implementations contain hard-coded product content such as “Team workspace,” invoice rows, project settings, user identities, commands, sidebar navigation, and fixed calendar dates (`uifn/components/src/react/production-batch-a.tsx`, `production-batch-b.tsx`, `production-data-rich.tsx`).
- Data-rich state is implemented independently in `uifn/components/src/shared/data-rich.ts`, while each framework renderer reconstructs its own behavior.

**Impact**

The surface is difficult to reuse, behavior diverges, styling and content are coupled, and consumers cannot install one framework cleanly. It does not offer the open composition expected from a primitive/component library.

**Required approach**

Make `@uifn/components` framework-neutral contracts/recipes only and publish isolated `@uifn/components-react`, `@uifn/components-svelte`, and `@uifn/components-solid` packages. Styled components must wrap the headless compound parts without implementing behavior or fixed product scenes. Product scenes move to examples/patterns.

### F-08 — P1 — Controller lifecycle, update, and change contracts are underspecified

**Observed**

- `UIFnControllerSubscriber` accepts `meta?: unknown` (`uifn/core/src/controller.ts:3`).
- The controller has no `update(input)`, lifecycle/status snapshot, event trace, or structured failure channel (`uifn/core/src/controller.ts:8-31`).
- `destroy()` unsubscribes listeners, but the exposed actions and `getState` remain callable; controller factories do not consistently destroy their underlying stores/timers/effects (`uifn/core/src/controller.ts:40-72`).
- Reactive prop synchronization is hand-maintained by each adapter/hook. React creates controllers during render and uses delayed destroy logic to tolerate StrictMode.

**Impact**

Controlled behavior, prop changes, teardown races, StrictMode, and debugging are inconsistent. “Destroyed” is not a terminal, testable state.

**Required approach**

Define a typed lifecycle and transaction contract: immutable snapshots, status, `update`, subscribe options, transaction/change metadata, idempotent destroy, deterministic post-destroy errors, callback-on-request versus controlled sync semantics, and complete effect cleanup.

### F-09 — P1 — Part typing and user event composition are not safe enough

**Observed**

- Part props are generic records rather than element-specific native prop types (`uifn/core/src/parts.ts:3-35`).
- When generated and user handlers both exist, the generated handler runs first, then the user handler (`uifn/core/src/parts.ts:120-132`). A user cannot call `preventDefault()` to cancel the internal behavior before it occurs.
- All generated role/id/tabIndex/ARIA/data values are treated as protected if present, rather than distinguishing normative invariants from customizable attributes (`uifn/core/src/parts.ts:140-217`).

**Impact**

Consumers can be surprised by unpreventable actions, weak event types, and over-constrained customization. Adapter event semantics can differ.

**Required approach**

Generate element-specific prop contracts. User handlers run first; internal behavior runs only if the event is not default-prevented, except for explicitly documented non-cancelable invariants. Required semantic fields are declared per part, not inferred from every generated value.

### F-10 — P1 — Existing primitive breadth is materially below the requested peer baseline

**Observed**

- Core exports 25 primitive files/families.
- Ark’s current official catalog includes more than forty components plus collection and utility APIs; Base and Radix add other mature families such as Autocomplete, Field/Form, Drawer, Navigation Menu, Number/OTP/Password inputs, Meter, and utilities.
- The styled 45-name catalog is broader, but many entries do not have a corresponding core controller and instead implement behavior in the styled layer.

**Impact**

The ecosystem cannot be comparable in breadth or consistency, and consumers encounter different architecture depending on the component.

**Required approach**

Adopt the canonical 61-primitive GA catalog and utility/collection set in the companion spec. Every behavior-bearing styled component must map to a core controller; no styled-only behavior fork is allowed.

### F-11 — P1 — Package and source installation are not yet one implementation pipeline

**Observed**

- Registry manifests, implementation manifests, framework files, fixtures, stories, and checksums exist and current registry verification passes.
- The actual framework implementations are separate hand-written trees; the registry validates references/checksums, not semantic identity with published package entry points.
- Five framework fixtures are mandatory in the current verifier (`scripts/verify-uifn-registry.mjs:19-20`, `69-129`).

**Impact**

Package and copied-source users can receive structurally different code or fixes. Expanding the catalog multiplies manual drift.

**Required approach**

Use one canonical primitive definition/manifest to generate package exports, framework wrappers, source-install templates, stories, docs tables, vectors, and registry checksums. Test package and source installations with the same semantic trace suite.

### F-12 — P1 — Specific accessibility algorithms and component semantics remain underpowered

**Observed**

- React ContextMenu assigns `tabIndex=0` to every enabled menu item (`uifn/react/src/context-menu.tsx:266-300`) instead of maintaining one composite tab stop or `aria-activedescendant`; it has no typeahead or submenu model in that component.
- Focusable discovery does not filter hidden/inert elements or coordinate nested/shadow/portal focus.
- The styled calendar uses a `role="application"` wrapper and reimplements grid behavior independently; its keyboard model is not demonstrated by the current generated matrix.
- Current tests report jsdom limitations and React `act(...)` warnings while still passing.

**Impact**

The library can pass axe while still being difficult or incorrect for keyboard and screen-reader users.

**Required approach**

Specify and test the exact APG/native interaction contract for every composite, prefer native HTML, review ARIA usage manually, and test actual announcements/focus with the selected AT matrix.

### F-13 — P1 — Compatibility claims exceed executed matrices

**Observed**

- Current React tests resolve React 18.3.1. React peer ranges include 19, but no clean React 19 matrix was executed in this audit.
- Current Solid resolves 1.9.13 and Svelte resolves 5.46.x; no previous/current minor compatibility matrix is recorded.
- The shell used Node 20.20.0. There is no clean Node 20/22/24 install/build/test matrix.
- The workbench runner imports Chromium only (`uifn/examples/browser-qa/src/runner.mjs:1`) even though separate catalog evidence exists for WebKit/Firefox. Latest-two desktop browser and current/previous Safari/iOS plus Android Chrome support is not one enforced release matrix.
- React Server Components import safety is not a release gate.

**Impact**

Peer ranges and docs can promise combinations that have not been tested from packed artifacts.

**Required approach**

Run isolated packed-consumer matrices for every selected framework/runtime/browser combination, including SSR and hydration with zero warnings and React RSC-safe imports.

### F-14 — P1 — There are no hard performance, size, or leak gates

**Observed**

- No benchmark suite or size-limit configuration covers controller dispatch, DOM update latency, overlay open, virtualization, tree shaking, or mount/unmount leaks.
- The pack verifier reports tarball presence and forbidden paths, not bundle cost. Current unpacked output includes approximately 2.22 MB for core, 1.12 MB for React, 1.45 MB for Svelte, and 2.55 MB for components.
- Listener/timer counters exist for a few utilities, but there is no repository-wide detached-node, observer, timer, or heap-growth gate.

**Impact**

Production maturity cannot be 10/10 without bounded cost and teardown behavior.

**Required approach**

Adopt the numeric gzip, dispatch, interaction, overlay, virtualization, long-task, and leak budgets in the companion spec; run them on a pinned CI runner and block regressions.

### F-15 — P1 — Provenance and security checks are useful but not a supply-chain review

**Observed**

- The provenance verifier scans for forbidden domain/package/prose regexes and clean-room metadata (`scripts/verify-uifn-provenance.mjs`).
- It does not produce an SBOM, dependency/license inventory, vulnerability review, publish provenance attestation, or exception ledger.
- It currently forbids peer-inspired/proven dependencies by keyword, even though the confirmed architecture allows focused vetted dependencies.
- Registry path traversal, symlink, atomic rollback, malicious manifest, and interrupted update behavior need stronger adversarial coverage.

**Impact**

The project can pass a naming scan without demonstrating dependency, licensing, artifact, or source-installer safety.

**Required approach**

Replace blanket keyword bans with clean-room policy plus dependency allowlist/license review; generate SBOM and signed/npm provenance; audit registry writes and tarballs; require zero unresolved critical/high production advisories or a signed exception with expiry.

### F-16 — P1 — Release target and gating are now wrong for the confirmed product

**Observed**

- `verify-uifn-release.mjs:10-32` requires React, Svelte, Vue, Solid, Angular, `patterns`, and `sf`.
- Vue/Angular workbenches and catalogs are part of the current release evidence.
- `patterns` and `sf` are classified beta by package graph but run as blocking lifecycle/story/test/release checks.
- The production closure log ends with `npm run verify:uifn-release: pending independent completion` (`uifn/.conduct/SFN-15/fix-logs/2026-07-17-production-readiness-closure.md:189-192`).

**Impact**

Engineering capacity is spent on packages the user has removed, while experimental packages can block stable 1.0. Existing green evidence cannot represent the new target.

**Required approach**

Delete Vue/Angular completely, split stable and experimental release trains, and regenerate all inventories/gates for the three retained frameworks.

### F-17 — P2 — Storybook verification is still primarily metadata/generated-runner validation

**Observed**

- Story verification checks JSON story metadata, required files, and package tests (`scripts/verify-uifn-stories.mjs`).
- The earlier browser-gate fix log explicitly notes that live Storybook execution for every generated story was still residual work.

**Impact**

Story metadata can be green while actual CSF rendering, controls, interaction play functions, accessibility addon results, and docs pages fail.

**Required approach**

Ship a real Storybook preset/addon and framework Storybooks. Build them, run every CSF story in a browser, and consume the same canonical vectors used by component conformance.

### F-18 — P2 — Current evidence volume can obscure what was actually exercised

**Observed**

- `verify:uifn-browser --scope smoke` still selects 243 routes per framework because smoke only filters non-default fixture IDs (`uifn/examples/browser-qa/src/filters.mjs:66`); the command name does not communicate its cost or coverage clearly.
- Progress includes many assertions returning success immediately because they are irrelevant for the route.
- Current closure documents present large check counts while the final release command remains pending and manual AT remains blocked.

**Impact**

Large counts can create false confidence and make regressions harder to diagnose.

**Required approach**

Use requirement/vector IDs, executed/skipped/not-applicable states, explicit environment fingerprints, and coverage denominators. Do not count not-applicable assertions as passes. Every release claim must link to current immutable evidence.

## Current verification results

Commands were run from the repository root with `/opt/homebrew/bin` added to `PATH` where necessary.

| Command | Result | Interpretation |
| --- | --- | --- |
| `npm --workspace @uifn/core test` | PASS — 32 files, 107 tests | Useful unit baseline; does not prove one runtime or browser behavior. |
| `npm --workspace @uifn/core run typecheck` | PASS | Current TypeScript surface is internally consistent. |
| `npm --workspace @uifn/adapter-kit test` + typecheck | PASS — 16 tests | Generic adapter utilities/vectors pass. |
| `npm --workspace @uifn/react test` + typecheck | PASS — 28 files, 73 tests | Includes axe smoke; emitted jsdom limitations and React `act` warnings. |
| `npm --workspace @uifn/svelte test` + typecheck | PASS — 25 files, 65 tests | Includes axe smoke; emitted jsdom limitations. |
| `npm --workspace @uifn/solid test` + typecheck | PASS — 14 assertions across configured runs | Narrower public component coverage than React/Svelte. |
| `node scripts/verify-uifn-package-graph.mjs` | PASS | The current five-framework graph is internally allowed; this is not the confirmed target graph. |
| `node scripts/verify-uifn-adapter.mjs --framework react|svelte|solid` | PASS | Generic/current representative conformance passes; see F-05. |
| `node scripts/verify-uifn-a11y.mjs --scope batch-b` | PASS | Automated batch-B generated matrix only; not a 10/10 accessibility gate. |
| `node scripts/verify-uifn-visual.mjs --scope data-rich` | PASS | Generated Chromium visual matrix for six data-rich entries. |
| `node scripts/verify-uifn-stories.mjs` | PASS | Metadata/generated story runners; not full live Storybook execution. |
| `node scripts/verify-uifn-provenance.mjs` | PASS | Clean-room metadata/keyword scan. |
| `node scripts/verify-uifn-registry.mjs` | PASS | Current five-framework manifests/checksums. |
| `node scripts/verify-uifn-pack.mjs` | PASS — 16 tarballs | Pack output exists and forbidden paths are absent; no bundle-size gate. |
| `node scripts/verify-uifn-release.mjs --dry-run` | Expected FAIL | Correctly reports all blocking checks as planned/not executed. |
| `node scripts/verify-uifn-browser.mjs --scope smoke` | FAIL — 1,209/1,215 checks passed; 6 failed | The command ran 243 routes in each of five frameworks, not a narrow smoke set. All failures were Menubar overlay-geometry/dismissal evidence; see addendum. |

### Verification caveats

- The complete current release gate was not used as the target verdict because it is knowingly mis-scoped to five frameworks and blocking experimental packages, and its own closure log says independent completion is pending.
- Passing current scripts is recorded as positive evidence; it is not reinterpreted as evidence for requirements those scripts do not test.
- The worktree was already heavily modified and untracked before this audit. The audit treated that state as the implementation under review and did not modify implementation files.

## Recommended target architecture

```text
@uifn/core
  private typed behavior service + canonical primitive logic
  public controller = immutable state/snapshot + actions + typed parts + update/subscribe/destroy
                         │
                         ▼
@uifn/dom
  document/root scope + focus/layer/modal/portal/presence/position/form/live-region services
                         │
                         ▼
@uifn/adapter-kit
  native prop/event/ref translation + lifecycle binding + semantic trace harness
                 ┌───────┼────────┐
                 ▼       ▼        ▼
            React 18/19  Svelte 5  Solid 1.x
            compound headless components only; no behavior forks
                 └───────┼────────┘
                         ▼
framework-isolated styled packages
  @uifn/components-react | @uifn/components-svelte | @uifn/components-solid
                         ▼
canonical registry/source generation + live Storybook + docs/examples + release evidence
```

This is not a downgrade to “just another state machine.” It keeps uifn’s strongest differentiator—the approachable controller facade—while giving it the private runtime, DOM ownership, adapter parity, compound DX, and evidence discipline that mature primitive systems need.

## Release-blocking acceptance summary

The system may only be called accessibility confidence 10/10 and production maturity 10/10 when all of the following are true:

1. One private runtime owns every stable controller; no public generic machine, legacy `createX`, adapter behavior fork, or styled behavior fork remains.
2. Every canonical stable primitive has actual React, Svelte, and Solid compound components driven by the same controller/DOM services.
3. Every primitive has a normative semantic/keyboard/focus/pointer/RTL/form/SSR ledger and both positive and negative vectors.
4. WCAG 2.2 AA automation and manual review are green; VoiceOver macOS/iOS, NVDA, and TalkBack evidence is signed and current; JAWS alone may remain untested.
5. The selected browser/runtime/framework matrix is green from packed artifacts, with zero hydration warnings and no RSC import violations.
6. Size, latency, virtualization, long-task, and leak budgets are green.
7. Source install and package install produce identical semantic traces from one canonical definition pipeline.
8. Vue/Angular are absent; patterns/SF are explicitly experimental and outside the stable release DAG.
9. Real Storybook, docs, examples, registry, SBOM, license/provenance, security, migration, and rollback gates are green.
10. An independent accessibility review and unresolved-defect review approve the candidate, with no open P0/P1 defects.

## Final audit result

**FAIL.** The codebase is a promising alpha/engineering prototype with meaningful tests and tooling, but its current architecture and evidence are not comparable in rigor to mature primitive ecosystems and cannot support accessibility confidence 10/10 or production maturity 10/10. The companion spec `2026-07-17-audit-fix-fb19ad09-spec` is the required remediation plan.

## Browser smoke completion addendum

The completed run returned exit code 1:

- Mode: `smoke`.
- Selected routes: 243 per framework, 1,215 executed cells total.
- Frameworks: React, Svelte, Vue, Solid, and Angular.
- Result: 1,209 passed, 6 failed, 0 skipped.
- Failure code: `UIFN_OVERLAY_CONTENT_GEOMETRY` for Menubar routes.
- React failures: `/components/menubar/states`, `/components/menubar/qa`, and `/components/menubar/qa/default`; dismissal evidence showed Escape/outside-close failures, including missing focus restoration on `/qa`.
- Vue, Solid, and Angular failures: `/components/menubar/qa`; the reported placement was inside the viewport/boundary and outside dismissal succeeded, but the aggregate overlay-geometry assertion still returned false, exposing a verifier/result-contract ambiguity in addition to the component evidence gap.
- Svelte had no failed cell in this run.

This result reinforces F-03 through F-05: framework outcomes differ, the browser gate still targets the now-rejected five-framework matrix, and its `smoke` label hides a 1,215-cell run. It also proves the audit did not treat the many green unit/generated checks as a substitute for final real-browser behavior.
