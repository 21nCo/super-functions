# Metadata

| Field | Value |
| --- | --- |
| Spec ID | `fb19ad09` |
| Title | uifn rigorous controller, accessibility, and production-readiness program |
| Type | Audit-fix specification |
| Status | Ready for phased execution |
| Date | 2026-07-17 |
| Sequencing amendment | 2026-07-22 — Phase 14 semantic parity and compatibility certification are separate gates |
| Source audit | `uifn/.conduct/audits/2026-07-17-ee1f9d6c-full-audit.md` |
| Product target | `@uifn/*` 1.0 stable ecosystem |
| Required frameworks | React 18.3/19, Svelte 5, current Solid 1.x |
| Removed frameworks | Vue, Angular |
| Accessibility target | WCAG 2.2 AA plus applicable APG/native behavior and selected manual AT matrix |
| Maturity target | Accessibility confidence 10/10 and production maturity 10/10 |
| Breaking changes | Authorized; no compatibility shims |

# Overview

This specification replaces the current collection of legacy machines, primitive-local stores, controller wrappers, framework-owned behavior, and styled demo implementations with one coherent uifn architecture:

1. A private, owned behavior/effect runtime inside `@uifn/core`.
2. A stable public controller facade based on immutable state/snapshots, actions, typed parts, reactive updates, subscriptions, and deterministic disposal.
3. An owned `@uifn/dom` platform package for focus, layers, modal behavior, portals, positioning, presence, form bridges, live regions, input modality, and browser observers.
4. `@uifn/adapter-kit` as a thin cross-framework translation and conformance layer.
5. Complete, native compound component APIs for React, Svelte, and Solid only.
6. Framework-isolated styled component packages with no behavior forks or fixed product content.
7. One canonical catalog/definition pipeline that generates package exports, source-install templates, test vectors, Storybook stories, docs inventories, and registry checksums.
8. Release gates that measure actual semantics, browser/AT behavior, compatibility, performance, leaks, package isolation, security, provenance, and independent review.

The public controller model remains uifn’s central product idea. The internal implementation is intentionally not a public general-purpose state-machine library. It is a purpose-built UI behavior service designed to make every primitive deterministic, inspectable, reactive, disposable, and portable across frameworks.

# Authoritative decisions

The following are fixed and MUST NOT be reopened during execution without an explicit user change:

- Keep `state + actions + parts` as the public controller facade.
- Build one private owned runtime; vetted focused dependencies are acceptable.
- Delete Vue and Angular completely.
- Breaking cleanup is allowed; do not add shims for removed APIs.
- Expand the GA catalog to the complete set in this spec.
- React, Svelte, and Solid are equal minimum-supported frameworks.
- Package installation and copied-source installation are equally supported and generated from one definition pipeline.
- `patterns` and `sf` are experimental, separately versioned, and excluded from stable 1.0 blockers.
- JAWS is the only accessibility matrix item explicitly deferred.
- All other work in this spec is required for 1.0; there is no MVP shortcut.

# Goals

1. Make behavior ownership unambiguous: one core logic implementation and one DOM platform implementation per capability.
2. Make every public primitive semantically equivalent across React, Svelte, and Solid while preserving framework-native composition.
3. Reach evidence-backed WCAG 2.2 AA and applicable APG/native behavior across keyboard, pointer, touch, screen reader, RTL, forced colors, reduced motion, zoom/reflow, SSR, and hydration.
4. Provide Base/Radix-quality compound component ergonomics while retaining a framework-agnostic controller API closer to Zag’s portability.
5. Expand the stable headless catalog to 61 primitives plus shared collections and utilities.
6. Make packaged and source-installed implementations semantically identical.
7. Establish hard size, latency, leak, compatibility, security, and release budgets.
8. Make every readiness claim traceable to immutable current evidence.

# Non-goals

- Building or exposing a general-purpose XState-compatible statechart library.
- Copying implementation code, prose, tests, or styling from Zag, Ark, Base UI, Radix, Coss, shadcn, or other reference projects.
- Retaining Vue or Angular packages for compatibility.
- Making `@uifn/patterns` or `@uifn/sf` stable 1.0 packages in this program.
- Testing JAWS before 1.0. Its omission MUST be disclosed in the support matrix.
- Guaranteeing obsolete browsers outside the explicit support matrix.
- Embedding product-specific demos, sample records, identities, invoices, navigation, or application copy in reusable component packages.

# Glossary

| Term | Meaning |
| --- | --- |
| Logic | Pure typed primitive behavior definition: inputs, context, events, reducers/guards, computed state, effects, and parts connector. |
| Service | A running private logic instance with an event queue, immutable snapshot, inputs, refs, scope, effects, child services, and lifecycle. |
| Controller | The public facade returned by `createXController`, exposing state/snapshot, actions, parts, update, subscribe, and destroy. |
| Part | A typed semantic DOM contract such as trigger, content, option, thumb, or hidden input. |
| DOM service | Shared browser behavior such as a focus scope, dismissable layer, portal, positioner, modal manager, or live region. |
| Semantic trace | Framework-independent record of events, snapshots, metadata, DOM/ARIA/focus results, callbacks, and cleanup. |
| Canonical definition | Structured source of truth for primitive names, anatomy, inputs, events, states, accessibility rules, vectors, framework support, docs, and release status. |
| Package install | Consumption from packed/published `@uifn/*` artifacts. |
| Source install | Registry CLI copies generated source into an application with a lockfile and update/diff support. |
| Stable DAG | Packages and checks that block `@uifn/*` 1.0. Experimental packages are outside it. |
| AT | Assistive technology. |

# Target package graph

## Stable publishable packages

| Package | Responsibility | Allowed runtime dependencies |
| --- | --- | --- |
| `@uifn/core` | Private runtime, controllers, pure logic, collections, canonical public types/errors | No framework or ambient DOM dependency |
| `@uifn/dom` | Browser scope, focus, layers, modality, portals, presence, positioning, modal, form, observers | `@uifn/core`; vetted `@floating-ui/dom`, `tabbable`; approved narrowly scoped helpers |
| `@uifn/adapter-kit` | Part/event/ref translation, lifecycle binding, trace/conformance harness | `@uifn/core`, `@uifn/dom` |
| `@uifn/react` | React headless compound components and React hooks | Core/DOM/adapter-kit; React peers only |
| `@uifn/svelte` | Svelte 5 headless compound components, actions, and stores | Core/DOM/adapter-kit; Svelte peer only |
| `@uifn/solid` | Solid headless compound components and primitives | Core/DOM/adapter-kit; Solid peer only |
| `@uifn/tokens` | Typed design-token schema, color/contrast/motion contracts | Framework-free |
| `@uifn/theme` | Theme definitions/providers/mounting | Tokens |
| `@uifn/theme-tailwind` | Tailwind integration generated from tokens/recipes | Tokens/theme/recipes; Tailwind peer |
| `@uifn/recipes` | Framework-neutral variant/part recipes | Tokens/theme |
| `@uifn/components` | Framework-neutral styled component contracts, CSS, recipes, catalog metadata | Tokens/theme/recipes; no UI framework |
| `@uifn/components-react` | Styled React compounds wrapping `@uifn/react` | React adapter, framework-neutral components packages |
| `@uifn/components-svelte` | Styled Svelte compounds wrapping `@uifn/svelte` | Svelte adapter, framework-neutral components packages |
| `@uifn/components-solid` | Styled Solid compounds wrapping `@uifn/solid` | Solid adapter, framework-neutral components packages |
| `@uifn/registry` | Catalog CLI, source generation/install/diff/update/validation | Framework-free CLI dependencies only |
| `@uifn/storybook` | Real Storybook preset/addon, decorators, docs and test integration | Registry/theme; Storybook peers |

## Private workspaces

- Canonical catalog/definition compiler.
- Shared conformance/vector fixtures.
- React 18.3, React 19, Svelte 5, and Solid 1.x packed-consumer apps.
- SSR/hydration/RSC test apps.
- Framework Storybooks and docs applications.
- Browser, visual, performance, leak, AT-evidence, and release tooling.

## Experimental packages

- `@uifn/patterns`
- `@uifn/sf`

Both MUST use an `experimental` dist-tag/status, MUST consume only stable public APIs, MUST have separate CI/release evidence, and MUST NOT be dependencies of any stable package or blockers in the stable release gate.

## Removed packages and surfaces

All Vue and Angular packages, exports, source templates, registry metadata, fixtures, examples, catalogs, docs, tests, evidence dimensions, scripts, lockfile entries, and release checks MUST be deleted. Imports MUST fail normally after the breaking release; no deprecated wrapper or compatibility shim is allowed.

# Architecture

## Private core runtime

`@uifn/core/src/internal/runtime/*` is private and MUST NOT appear in the package export map. The runtime MUST provide:

- Fully typed events and inputs.
- Immutable, referentially stable snapshots.
- FIFO run-to-completion event processing. An event sent by an action/effect is queued and cannot interleave with the current transaction.
- A defined reentrancy policy and maximum event/always-transition cycle cap with a structured error.
- Explicit statuses: `idle`, `running`, `stopped`, `done`, `error`, `destroyed` as applicable.
- Pure reducers/guards and computed fields; input/context mutation is forbidden in development and covered by tests.
- Reactive `update(nextInputs)` with change detection and watched-input actions/effects.
- Typed refs and a scoped environment without reading global `document` or `window` during construction/SSR.
- Entry/exit and watched effects that return cleanup, receive an `AbortSignal`, and are cleaned exactly once on transition, replacement, stop, or destroy.
- Deterministic timer/scheduler abstraction for delay, interval, animation frame, microtask, and test-controlled time.
- Child service composition for nested menus, tours, toast groups, list/tree nodes, and parallel UI regions.
- Structured effect errors that transition the service to a defined error state or invoke an explicit recovery policy.
- Subscription equality/selectors and listener error isolation.
- Transaction traces in development/test builds with bounded retention and no production PII.
- Hydratable deterministic state for primitives that need SSR continuity; effects never serialize.

The runtime does not need to mimic a general SCXML/statechart API. It MUST support all semantics above and the full canonical catalog without primitive-local alternative stores.

## Public controller contract

The canonical shape is:

```ts
export interface UIFnController<
  TState,
  TActions extends object,
  TParts extends object,
  TInputs extends object,
  TEvent extends UIFnEvent,
> {
  readonly status: UIFnControllerStatus;
  readonly state: Readonly<TState>;
  readonly snapshot: Readonly<UIFnSnapshot<TState>>;
  readonly actions: Readonly<TActions>;
  readonly parts: Readonly<TParts>;
  getState(): Readonly<TState>;
  getSnapshot(): Readonly<UIFnSnapshot<TState>>;
  update(inputs: Partial<TInputs>): void;
  subscribe(
    subscriber: UIFnSubscriber<TState, TEvent>,
    options?: UIFnSubscribeOptions<TState>,
  ): () => void;
  destroy(): void;
}
```

Required semantics:

- Factories return a running controller unless explicitly documented as lazy.
- `destroy` is idempotent and completes all cleanup synchronously except documented animation completion work owned by a separate presence service.
- Reads after destroy return the terminal immutable snapshot. Mutating actions and `update` after destroy throw `UIFN_CONTROLLER_DESTROYED` consistently in every build.
- Subscribers are never called reentrantly. Selector subscriptions receive only meaningful changes according to their equality function.
- Controlled actions emit one change request and do not mutate the controlled field until `update` synchronizes it. Controlled synchronization does not invoke the user callback again.
- Uncontrolled actions update state and invoke the callback once in one transaction.
- All state-changing transactions include typed metadata:

```ts
export interface UIFnChangeMeta<TEvent extends UIFnEvent = UIFnEvent> {
  transactionId: number;
  event: Readonly<TEvent>;
  source: 'user' | 'programmatic' | 'controlled-sync' | 'effect' | 'system';
  reason: string;
  inputModality?: 'keyboard' | 'pointer' | 'touch' | 'virtual';
  previousSnapshot: Readonly<UIFnSnapshot<unknown>>;
  nextSnapshot: Readonly<UIFnSnapshot<unknown>>;
  changedKeys: readonly string[];
  requestedValue?: unknown;
  timestamp: number;
}
```

- No stable export exposes `StateMachine`, `createMachine`, primitive-local `createStore`, legacy `createX` behavior constructors, internal effects, or runtime configuration.

## Typed part contract

Each primitive exposes named getters appropriate to its anatomy, for example `parts.trigger.getProps(userProps)` and `parts.option.getProps({ item }, userProps)`. Generated types MUST preserve the native element’s attributes and event types.

Event composition rules:

1. User event handler runs first.
2. If the user calls `preventDefault`, cancelable internal behavior does not run.
3. Non-cancelable semantic invariants are explicitly declared and documented per part.
4. User and generated refs are composed and cleared exactly once.
5. User `class`, `className`, `style`, and safe attributes merge without erasing required generated values.
6. Only fields listed as semantic invariants are protected; arbitrary generated `data-*` values are not automatically immutable.
7. Adapter translations preserve event cancellation, propagation state, related target, pointer type, composition state, and current target.

## Environment and scope

Every controller/DOM service receives a scope capable of resolving:

- root node (`Document`, `ShadowRoot`, or element root);
- owner document and window;
- active element through shadow roots;
- direction and writing mode;
- locale and time zone;
- reduced motion and forced-colors preferences;
- deterministic ID allocation and hydration seed;
- scheduler/time source;
- query/get-by-id within the root;
- warning/error/trace sink.

No module import or controller construction may read browser globals during SSR.

## DOM platform services

`@uifn/dom` owns the following; framework-local equivalents MUST be deleted.

### Dismissable layers

- Stack/top-layer arbitration.
- `pointerdownOutside`, `focusOutside`, `interactOutside`, and Escape channels with cancelable details.
- `event.composedPath()` and branch registration for portals, shadow DOM, nested overlays, and trigger/content relationships.
- Correct pointerdown/click ordering, right-click/contextmenu behavior, touch delay/cancellation, scrollbar interaction, and drag selection.
- Optional outside pointer-event disabling with exact style restoration and reference counting.
- Nested modal/non-modal behavior; only the correct layer dismisses.

### Focus scopes

- Robust tabbable/focusable detection, including visibility, disabled/inert/hidden state, radio groups, contenteditable, details/summary, shadow roots, and controlled portal branches.
- Initial focus, final focus, autofocus cancellation, containment, looping, paused/resumed nested scopes, and focus restoration to the active trigger.
- Virtual cursor and programmatic focus compatibility.
- No focus into inert/hidden/detached content.

### Modal manager and scroll lock

- Reference-counted inert background with safe `aria-hidden` fallback.
- Nested modals and portalled branches.
- Reference-counted body/root scroll locking with exact inline-style restoration, preserved scroll position, scrollbar compensation, iOS touch handling, and configurable pinch zoom.

### Positioning

- Use vetted Floating UI DOM middleware rather than maintaining another partial geometry engine.
- Offset, flip, shift, size, arrow, hide, inline/virtual references, collision boundary, sticky behavior, logical RTL placement, transformed ancestors, clipping ancestors, and strategy selection.
- Auto-update on ancestor scroll/resize, element resize, layout shift, and relevant animation frame cases.
- Cleanup every observer/listener exactly once.

### Presence, portal, and transitions

- Mount/unmount presence phases, `forceMount`, reduced-motion shortcut, multiple CSS transitions/animations, animation cancellation, and fallback timeout.
- Portal target, disabled portal, SSR placeholder, hydration-safe move, custom root/shadow root, and nested branch registration.
- No content flash before positioning/presence is ready.

### Shared browser capabilities

- Input-modality service.
- Direction/locale provider.
- Form association/hidden input/reset/validation service.
- Live-region service for toast/progress/clipboard/status announcements.
- Resize, intersection, mutation, and scroll observer wrappers with test injection.

# Canonical GA catalog

Every name below is a stable 1.0 requirement. All 61 MUST have canonical definitions, controllers where behavior exists, React/Svelte/Solid compound APIs, package/source installation, docs, Storybook, semantic traces, accessibility vectors, SSR/import-safety coverage, and release status.

1. Accordion
2. AlertDialog
3. AngleSlider
4. Autocomplete
5. Avatar
6. Button
7. Carousel
8. Checkbox
9. CheckboxGroup
10. Clipboard
11. Collapsible
12. ColorPicker
13. Combobox
14. ContextMenu
15. DateInput
16. DatePicker
17. Dialog
18. Drawer
19. Editable
20. Field
21. Fieldset
22. FileUpload
23. FloatingPanel
24. Form
25. HoverCard
26. ImageCropper
27. Input
28. Listbox
29. Marquee
30. Menu
31. Menubar
32. Meter
33. NavigationMenu
34. NumberInput
35. Pagination
36. PasswordInput
37. PinInput
38. Popover
39. Progress (linear and circular presentation)
40. QRCode
41. RadioGroup
42. RatingGroup
43. ScrollArea
44. SegmentGroup
45. Select
46. Separator
47. SignaturePad
48. Slider
49. Splitter
50. Steps
51. Switch
52. Tabs
53. TagsInput
54. Timer
55. Toast
56. Toggle
57. ToggleGroup
58. Toolbar
59. Tooltip
60. Tour
61. TreeView

## Shared collections

- `ListCollection`
- `TreeCollection`
- `AsyncList`
- `ListSelection`
- `VirtualizerContract`

Collections MUST support stable keys, disabled items, item-to-string/value adapters, locale-aware filtering/collation, async loading/cancellation, selection modes, range selection where applicable, mutation while focused/selected, and virtualization without losing logical accessibility relationships.

## Shared utilities

- AccessibleIcon
- ClientOnly
- DirectionProvider
- EnvironmentProvider
- FocusTrap/FocusScope
- FormatByte, FormatNumber, FormatTime, FormatRelativeTime
- Frame
- Highlight
- LocaleProvider
- Portal
- Presence
- Slot/merge props
- Swap
- VisuallyHidden

Utilities follow the same package/source/docs/test standards; behavior-bearing utilities use the runtime/DOM platform rather than separate local state.

# Primitive behavior families

The canonical catalog groups primitives into families so common invariants are implemented and tested once, then specialized per primitive:

| Family | Members | Shared requirements |
| --- | --- | --- |
| Disclosure | Accordion, Collapsible | controlled/uncontrolled, heading/region semantics, keyboard traversal, presence |
| Modal/overlay | Dialog, AlertDialog, Drawer, Popover, HoverCard, Tooltip, Tour, FloatingPanel | layers, focus, modal/inert, portal, position, dismissal, nested behavior |
| Menu/navigation | Menu, ContextMenu, Menubar, NavigationMenu, Toolbar | roving/active descendant, typeahead, submenus, pointer grace, orientation, RTL |
| Selection/collection | Listbox, Select, Combobox, Autocomplete, RadioGroup, SegmentGroup, TagsInput, TreeView | collections, selection, typeahead/filter, virtualization, async/mutation |
| Forms/input | Checkbox, CheckboxGroup, Switch, Input, Field, Fieldset, Form, NumberInput, PinInput, PasswordInput, Editable, FileUpload | native form association, validation, labels/descriptions, reset/autofill/IME |
| Range/gesture | Slider, AngleSlider, Splitter, RatingGroup, SignaturePad, ImageCropper, ScrollArea, Carousel | pointer/touch/keyboard alternatives, capture/cancel, constraints, RTL, target size |
| Date/color | DateInput, DatePicker, ColorPicker | locale/time zone/calendar math, parsing, grids, ranges, constraints, precision |
| Status/feedback | Progress, Meter, Toast, Timer, Clipboard | live regions, announcements, pause/resume, status semantics |
| Static/foundation | Avatar, Button, Separator, QRCode, Marquee, Steps, Tabs, Toggle, ToggleGroup | native semantics, labeling, reduced motion, state data |

# Framework adapter contract

## Common rules

- Public component anatomy and behavior names are generated from the canonical definition.
- Every framework exposes a root namespace/compound API and individually tree-shakeable exports.
- Framework-specific composition syntax is allowed; semantic output and traces remain equivalent.
- No adapter owns behavior rules, geometry algorithms, focus algorithms, collection logic, timers, or controlled-state semantics.
- Adapters instantiate one controller, call `update` for reactive inputs, bind typed part props, register elements/refs, and synchronously destroy on lifecycle teardown.
- Every adapter supports controlled and uncontrolled values, `disabled`, `readOnly`, `required`, direction, locale, custom environment/root, `forceMount`, portal target, and part-level composition where applicable.
- Callback payloads include value plus typed change details; callback counts match across frameworks.

## React

- Support React 18.3 and React 19.
- Use `useSyncExternalStore` or an equivalent concurrency-safe subscription boundary.
- StrictMode mount/unmount/remount must not leak, double-call callbacks, or depend on delayed destruction hacks.
- Server rendering and hydration must have deterministic IDs and zero warnings.
- Package root and server-safe exports must be importable from React Server Components without touching client-only globals. Client components are explicitly marked at the smallest entry points.
- `asChild`/render composition must preserve refs, events, names, semantics, and disabled behavior.

## Svelte

- Support Svelte 5 runes and snippets.
- Use standard Svelte library packaging; do not expose a raw TypeScript source entry that requires consumer-specific transpilation outside documented Svelte package conventions.
- Controlled props update through reactive controller `update`, not reconstruction or local shadow behavior.
- Actions and compound components use the same controller and clean attributes/listeners/registrations on destroy.
- SSR and hydration run through a real SvelteKit/SSR consumer with zero warnings.

## Solid

- Support the current Solid 1.x release line selected at implementation time.
- Implement all 61 compound component families, not only generic headless factories.
- Inputs remain reactive through accessors without stale captured options.
- Owner disposal destroys controllers synchronously and removes all DOM services.
- SSR and hydration run through a real Solid SSR consumer with zero mismatches.

# Styled component architecture

- Styled packages wrap headless framework parts one-for-one.
- They expose compound APIs for behavior-bearing components; a single closed demo component is insufficient.
- Default content is empty or minimal semantic labeling required by the API. Product scenes and sample records live only in examples or experimental patterns.
- Tokens and recipes define every visual state: open/closed, checked/unchecked/mixed, selected, highlighted, invalid, disabled, read-only, loading, dragging, swiping, focus-visible, forced colors, reduced motion, and orientation/direction.
- User class/style/part overrides compose without erasing positioning CSS variables or semantic attributes.
- Each framework package has only its own framework peer and adapter dependency.
- Importing one component must not include other components or frameworks.

# Hooks and framework utilities

The retained adapters MUST provide framework-native bindings for at least:

- copy to clipboard with permission/failure/cleanup behavior;
- media query with SSR fallback and modern/legacy listener cleanup;
- controllable state aligned with controller semantics;
- stable/hydration-safe IDs;
- presence;
- direction/locale/environment consumption;
- composed refs;
- escape key and outside interaction only as bindings to DOM services, not duplicate implementations.

# Package and source installation

## Canonical generation

One canonical definition MUST generate or validate:

- core/controller export inventory;
- part anatomy and typed framework API inventory;
- framework package export maps;
- styled package inventory;
- registry manifests and source templates;
- Storybook CSF stories and docs tables;
- example routes;
- positive/negative test vector inventory;
- accessibility requirement ledger;
- support matrix and release coverage denominator;
- checksums and provenance metadata.

Hand-maintained duplicated inventories are forbidden.

## Registry safety and correctness

- Commands: list, info, add, diff, update, validate, doctor, remove.
- Writes are constrained to the resolved project root and reject absolute paths, traversal, symlink escapes, case collisions, and reserved paths.
- Installs/updates use a plan, precondition hashes, temporary staging, atomic rename, rollback, and lockfile transaction.
- Conflicts produce a three-way diff and never overwrite user edits silently.
- Offline mode works from a verified local catalog.
- Every installed file records generator version, canonical definition version, source hash, output hash, dependencies, and provenance in `.uifn/registry.lock`.
- Package-install and source-install consumer apps execute identical semantic trace suites.

# Accessibility program

## Normative basis

- WCAG 2.2 Level A and AA success criteria applicable to the component surface.
- Native HTML semantics first.
- WAI-ARIA APG interaction patterns where applicable.
- ARIA and HTML validity review; APG examples are not treated as normative certification.
- Component-specific accessible name, description, state, relationship, live-region, focus, error, and form contracts.

## Automated gates

- Axe against every stable story state in supported desktop browser engines.
- Accessibility-tree snapshots for critical composites.
- Positive and negative keyboard vectors, including Tab/Shift+Tab, arrows, Home/End, Page keys, Enter/Space, Escape, typeahead, modifier keys, and focus restoration as applicable.
- Pointer, touch, long-press/contextmenu, drag/cancel, pointer capture loss, and keyboard alternatives.
- Focus-visible and focus-not-obscured checks.
- 200% and 400% zoom/reflow, text spacing, mobile viewport, and orientation checks.
- Forced-colors and high-contrast checks using system colors where needed.
- Reduced-motion checks with no essential information lost.
- RTL and bidi content checks; horizontal key behavior follows documented logical/physical conventions.
- IME/composition and mobile virtual-keyboard checks for text-entry composites.
- No serious/critical axe findings; any incomplete/manual rules are recorded and reviewed.

## Manual AT matrix

At minimum, the signed matrix MUST include:

| Platform | Browser | AT | Coverage |
| --- | --- | --- | --- |
| macOS current | Safari current and previous where available | VoiceOver | all critical families; representative simple/static families |
| iOS current | Safari | VoiceOver | all touch/overlay/form/collection/range critical families |
| Windows supported | Firefox current and Chrome or Edge current | NVDA | all critical families; representative simple/static families |
| Android current | Chrome | TalkBack | all touch/overlay/form/collection/range critical families |

Every stable primitive is manually reviewed in at least one appropriate AT/browser pairing; every critical family is reviewed in all relevant pairings above. Evidence records exact OS/browser/AT versions, build commit/tarball hashes, steps, expected/actual announcements and focus, result, defect links, verifier name, timestamp, and signature/attestation.

JAWS is recorded as `not-tested-user-deferred`, never as pass or implied support evidence.

## Independent review

Before 1.0, an accessibility reviewer who did not implement the relevant primitive wave MUST review the canonical ledger, automated evidence, manual matrix, and a risk-based sample of every family. All P0/P1 findings must be closed and P2 exceptions require owner/expiry/mitigation.

## Confidence score

Accessibility confidence is 10/10 only when all ten gates are current and green:

1. Native/ARIA semantic review.
2. APG/keyboard behavior vectors.
3. Focus/layer/modal behavior.
4. Automated axe/tree evidence.
5. Desktop browser matrix.
6. VoiceOver/NVDA/TalkBack matrix.
7. Pointer/touch/mobile/IME evidence.
8. Zoom/reflow/forced-colors/reduced-motion/RTL evidence.
9. Independent review.
10. Zero unresolved P0/P1 accessibility defects and release evidence integrity.

No averaging or partial credit can produce a 10.

# Compatibility matrix

All tests use packed artifacts and clean consumer installs.

| Layer | Required matrix |
| --- | --- |
| Node | 20, 22, 24 |
| React | 18.3 and current 19.x; client, StrictMode, SSR/hydration, RSC import safety |
| Svelte | Svelte 5 supported range selected in peer policy; CSR and SvelteKit SSR/hydration |
| Solid | Current supported Solid 1.x; CSR and SSR/hydration |
| Desktop browsers | Latest two stable Chrome, Firefox, Edge |
| Apple browsers | Current and previous Safari; current and previous iOS Safari where device lab permits release testing |
| Android | Current stable Android Chrome |
| Rendering modes | LTR, RTL, forced colors, reduced motion, 200%/400% zoom, light/dark/high contrast |

The support document records exact versions used for each release and the rolling-version policy. A missing required environment is a release blocker, not a pass.

## Compatibility gate decomposition and sequencing

Phase 14 owns two independent, fail-closed gates. They share one artifact and trace contract, but they do not have the same execution boundary:

1. **Semantic-parity implementation gate** — `ADAPT-001` and `PARITY-001` pass only when actual exported React, Svelte, and Solid public trees, package/source modes, mutations, callbacks, parts, DOM/ARIA/focus, errors, and cleanup match the reviewed golden. This gate MAY unblock implementation Phases 15–18.
2. **Compatibility-certification release gate** — `COMPAT-001` passes only when every required framework/runtime/browser/device cell is current, signed, bound to the exact clean artifact set, and accepted by the trusted verifier. This gate remains mandatory before Phase 19 manual AT certification, Phase 20 release closure, any support-matrix claim, or either 10/10 claim.

Passing the first gate does not complete Phase 14, satisfy `COMPAT-001`, freeze a release candidate, or convert a missing external cell into a pass. Later implementation evidence produced while compatibility certification is open is provisional and MUST be rerun if the certified artifact set or any relevant implementation changes.

# Testing strategy

## Per-primitive test layers

1. Pure logic unit tests.
2. Runtime transaction/reentrancy/effect/property tests with fake schedulers.
3. DOM service tests in real browser engines.
4. Actual public compound component tests for each framework.
5. Cross-framework semantic trace comparison.
6. SSR/hydration/import-safety tests.
7. Package-install and source-install consumer tests.
8. Automated accessibility and visual tests.
9. Manual AT/browser tests where required.
10. Regression test for every fixed production defect.

## Semantic trace envelope

```json
{
  "schemaVersion": 1,
  "primitive": "select",
  "framework": "react",
  "installMode": "package",
  "vectorId": "SELECT-KEYBOARD-OPEN-001",
  "environment": {},
  "steps": [],
  "transactions": [],
  "dom": {},
  "accessibilityTree": {},
  "focus": [],
  "callbacks": [],
  "resourcesBefore": {},
  "resourcesAfter": {},
  "result": "passed"
}
```

Traces normalize framework-specific syntax but MUST NOT discard meaningful timing, cancellation, focus, callback, or cleanup differences.

## Property/model testing

Property and model-based suites MUST cover at least:

- controlled/uncontrolled synchronization sequences;
- arbitrary collection insert/remove/reorder/disable operations;
- nested overlay open/close/destroy sequences;
- timer/effect cancellation and event reentrancy;
- range min/max/step/RTL operations;
- date/time-zone/locale boundary cases;
- registry path/conflict/update operations.

# Hard production budgets

Budgets are measured on a pinned CI hardware image, five warm runs, with tooling/version/environment recorded. A threshold change requires an architecture decision record and before/after evidence.

## Bundle and package budgets

All bundle numbers exclude the host framework but include uifn transitive runtime code used by the fixture.

| Budget | Threshold |
| --- | ---: |
| `@uifn/core` runtime plus one simple primitive | <= 10 KiB gzip |
| Incremental simple primitive logic | <= 4 KiB gzip |
| Incremental complex primitive logic | <= 15 KiB gzip |
| `@uifn/dom` shared platform used by an overlay | <= 18 KiB gzip including approved positioning/focus dependencies |
| Minimal React simple primitive consumer | <= 22 KiB gzip |
| Minimal Svelte simple primitive consumer | <= 20 KiB gzip |
| Minimal Solid simple primitive consumer | <= 20 KiB gzip |
| Minimal complex primitive consumer in any framework | <= 40 KiB gzip |
| Unimported framework code in a consumer bundle | 0 bytes |
| Unimported primitive implementation in a consumer bundle | 0 bytes, excluding explicitly shared runtime/platform code |

Tarballs also have per-package file-count/unpacked-size baselines and fail on >10% unexplained growth. Source maps, declarations, and framework source formats are assessed separately from runtime bundle size.

## Runtime budgets

| Scenario | Threshold |
| --- | ---: |
| Pure simple-controller dispatch, 10,000-event benchmark | p95 <= 1 ms per event |
| Pure complex-controller dispatch | p95 <= 4 ms per event |
| Browser keyboard/pointer event to asserted DOM state | p95 <= 16.7 ms; p99 <= 50 ms |
| Overlay trigger to positioned/focused content | desktop p95 <= 50 ms; mobile p95 <= 100 ms |
| Long tasks during 100 representative interactions | 0 tasks > 50 ms attributable to uifn |
| Virtualized 10,000-item navigation/update | p95 <= 16.7 ms and rendered nodes <= visible window + configured overscan + 4 structural nodes |
| 100 mount/open/close/unmount cycles | listeners, timers, observers, locks, inert refs return exactly to baseline |
| Leak harness after forced GC | 0 retained detached component roots; heap delta <= max(1 MiB, 2% of baseline) |

# Security, privacy, and supply chain

- No `eval`, `new Function`, remote code loading, or unsafe HTML generation in stable runtime packages.
- APIs that render user HTML require an explicit sanitizer contract and are separated from default text rendering.
- IDs, traces, warnings, and live regions must not expose secrets or arbitrary user data in production logs.
- Registry security follows the path/transaction rules above and has adversarial tests.
- Dependency changes require purpose, owner, current maintenance signal, license, bundle impact, vulnerability status, and alternatives in an ADR.
- Allowed production licenses and exception process are documented.
- Release generates CycloneDX or SPDX SBOMs for each tarball/DAG.
- Production dependencies have zero unresolved critical/high advisories. A temporary exception requires signed owner, exploitability analysis, mitigation, and <=30-day expiry.
- `npm publish --provenance` or equivalent trusted-publisher provenance is mandatory, along with signed Git tag/release metadata and tarball SHA-256 inventory.
- Clean-room provenance validates authorship/process and license obligations; it must not ban legitimate documented dependencies merely because peer projects use them.

# Storybook, docs, and examples

## Storybook

- `@uifn/storybook` is a real preset/addon with theme/environment decorators, compatibility panel, a11y configuration, docs generation, and canonical-vector integration.
- React, Svelte, and Solid Storybooks build successfully from packed packages.
- Every stable primitive has default, controlled/uncontrolled, disabled/read-only/invalid, keyboard/focus, RTL, forced-colors, reduced-motion, responsive, and primitive-specific edge stories.
- Every CSF story executes in a real browser; metadata-only JSON validation is insufficient.

## Documentation

- Architecture and mental model.
- Per-package install/import/tree-shaking/SSR guidance.
- Per-primitive anatomy, state/actions/parts, compound APIs, controlled semantics, accessibility contract, form behavior, direction/locale, examples, and known constraints.
- Package install and source install, including update/conflict/rollback.
- Migration guide from all removed current APIs and packages.
- Exact compatibility and accessibility support matrix, including JAWS disclosure.
- Evidence and defect-policy documentation.

## Examples

- Framework-native CSR and SSR/hydration consumers for React, Svelte, and Solid.
- Examples render public package/source-installed components, never test-only renderers or HTML reconstruction.
- Product/scenario examples may include realistic content, but reusable packages may not.
- Offline deterministic fixtures; no secrets or live network required for release tests.

# Release evidence and operations

## Evidence schema

Every check records:

- schema/check/vector/requirement IDs;
- commit and dirty-state marker;
- source definition, package, tarball, and lockfile hashes;
- tool/OS/runtime/framework/browser/AT versions;
- start/end time and duration;
- executed, skipped, not-applicable, pass, fail, blocked counts;
- complete denominator and coverage map;
- sanitized command/log/artifact references;
- verifier identity/signature for manual work;
- linked defect IDs and exception records.

Not-applicable or skipped checks never count as passes. Evidence from another commit/build cannot satisfy the candidate.

## Defect policy

- P0: release blocked immediately.
- P1: release blocked.
- P2: release blocked unless an explicit signed exception includes mitigation, owner, and <=30-day expiry; accessibility P2 exceptions also require reviewer approval.
- P3: may ship with documented owner and target release.
- Every fixed defect gains a regression vector before closure.

## Production maturity score

Production maturity is 10/10 only when all ten gates are current and green:

1. One-runtime/one-DOM-platform architecture.
2. Complete three-framework catalog parity.
3. Package/source install parity.
4. Framework/runtime/browser compatibility matrix.
5. Accessibility 10/10 gate.
6. Performance/size/leak budgets.
7. Security/SBOM/license/provenance gate.
8. Real Storybook/docs/examples/registry gate.
9. Zero unresolved release-blocking defects and tested rollback/migration.
10. Independent release and accessibility review of immutable evidence.

No averaging or green script count can compensate for a failed gate.

# Migration and versioning

- Treat the implementation as pre-1.0 until this spec is complete.
- Publish a breaking migration guide and codemods where deterministic, but do not keep runtime shims.
- Remove public `StateMachine`, `createMachine`, legacy primitive factories, old broad internal wildcard exports, Vue, Angular, monolithic all-framework styled runtime exports, and any duplicate behavior hooks.
- Rename/split styled package imports explicitly.
- Use changesets or an equivalent audited release plan.
- Stable packages use coordinated compatible versions and peer ranges proven by the matrix.
- Experimental packages use independent versions/dist-tags and cannot force stable major releases.
- Every public API has API report/semantic-versioning diff gates.

# Observability and errors

- All errors use stable codes, package, primitive, part, operation, recoverability, safe details, and cause.
- Development warnings cover missing title/description/labels, invalid part composition, controlled/uncontrolled switching, duplicate IDs/values, invalid collection keys, missing provider/scope, post-destroy mutation, and unsupported environment.
- A bounded opt-in dev trace exposes transactions/effects/resources without production PII.
- Test resource counters expose active listeners, observers, timers, frames, portals, layers, locks, inert roots, and child services.

# Limits and caps

- Runtime event/always-transition loop: default maximum 100 steps per outer transaction, then structured failure.
- Development trace: default 200 transactions per controller; configurable lower/off; never unbounded.
- Typeahead buffer: documented bounded duration and length.
- Toast/tour/collection async work uses abortable operations and bounded queues.
- Registry transaction size and file count are validated before writes; limits are documented and configurable with safe upper bounds.
- Virtualized collections never materialize the full DOM solely for accessibility; logical relationships use supported active-descendant/set-size/position semantics.

# Acceptance

This spec is complete only when:

1. Every requirement in `REQUIREMENTS.md` is satisfied with current positive and negative evidence from `TEST_VECTORS.md`.
2. Every phase report is complete and the intent audit reports no uncovered intent.
3. The canonical 61-primitive catalog and utilities are present in all three framework/package/source/story/docs matrices.
4. Both 10/10 scorecards are fully green without averaging, stale evidence, skips, or undocumented exceptions.
5. A clean-room packed release candidate passes the full stable gate on the specified matrix.
6. Vue/Angular are absent and experimental packages are outside the stable DAG.
7. Independent accessibility and release reviewers sign the immutable evidence manifest.

# Explicitly deferred

Only these items are deferred by user decision:

- JAWS manual testing.
- Stable/GA promotion of `@uifn/patterns` and `@uifn/sf`.

Nothing else in this specification may be labeled optional, future, preview, partial, or post-1.0 without a new explicit user decision.
