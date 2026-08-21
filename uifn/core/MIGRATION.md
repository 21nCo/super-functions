# Migrating to the uifn 1.0 controller contract

This is an intentional breaking cutover. There are no deprecated aliases or compatibility shims.

## Replace behavior constructors

Every public behavior constructor is now a controller factory:

| Removed | Replacement |
| --- | --- |
| `createAccordion` | `createAccordionController` |
| `createAlertDialog` | `createAlertDialogController` |
| `createAvatar` | `AvatarContract` |
| `createCheckbox` | `createCheckboxController` |
| `createCollapsible` / `createCollapsibleMachine` | `createCollapsibleController` |
| `createCombobox` | `createComboboxController` |
| `createContextMenu` | `createContextMenuController` |
| `createDialog` | `createDialogController` |
| `createDropdownMenu` / `createDropdownMenuController` | `createMenuController` |
| `createHoverCard` | `createHoverCardController` |
| `createMenuBar` / `createMenuBarController` | `createMenubarController` |
| `createPopover` | `createPopoverController` |
| `createProgress` | `createProgressController` |
| `createRadioGroup` | `createRadioGroupController` |
| `createScrollArea` | `createScrollAreaController` |
| `createSelect` | `createSelectController` |
| `createSeparator` | `SeparatorContract` |
| `createSlider` | `createSliderController` |
| `createSwitch` | `createSwitchController` |
| `createTabs` | `createTabsController` |
| `createToast` | `createToastController` |
| `createToggle` | `createToggleController` |
| `createToggleGroup` | `createToggleGroupController` |
| `createToolbar` | `createToolbarController` |
| `createTooltip` | `createTooltipController` |

Import controllers and their types from `@uifn/core` or `@uifn/core/primitives`. Wildcard source paths such as `@uifn/core/primitives/select` were removed so internal implementation modules cannot become accidental public APIs.

## Use the uniform lifecycle

```ts
import { createSelectController } from '@uifn/core'

const controller = createSelectController({
  value: 'one',
  items: ['one', 'two'],
  onValueChange(value) {
    // This is a request while value is controlled.
  },
})

const unsubscribe = controller.subscribe((state, meta) => {
  console.log(state.value, meta?.reason)
})

controller.actions.setValue('two')
controller.update({ value: 'two' })

unsubscribe()
controller.destroy()
```

Controllers expose `status`, immutable `state` and `snapshot`, readonly `actions` and anatomy-specific `parts`, `getState`, `getSnapshot`, reactive `update`, selector-aware `subscribe`, and idempotent `destroy`. Actions and `update` throw `UIFN_CONTROLLER_DESTROYED` after teardown. Controlled synchronization through `update` never invokes the change callback a second time.

## Replace generic machines and stores

`StateMachine`, `createMachine`, machine configuration types, `createStore`, and `PrimitiveStore` have no public replacement. Primitive behavior is owned by the private uifn runtime. Consumers compose primitives through controllers instead of defining or importing runtime services.

## Inject environment scope

Pass an environment as the second controller argument when a non-default scope is needed. It can provide root/document/window resolvers, active element resolution, direction, writing mode, locale, time zone, preferences, deterministic IDs/hydration seed, scheduler/time, scoped query functions, capability doubles, and warning/error/trace sinks. Core never discovers browser globals.

The machine-readable inventory is in `migrations/removed-apis.json`.

The old process-global ID helpers were removed as part of the same scope cutover. Share one explicit `UIFnResolvedEnvironment` within a render/request root and call its `generateId`, or own a `createDeterministicIdFactory` when building lower-level tooling. This prevents counters and duplicate-ID registries from leaking across SSR requests, documents, or test roots.

## Move overlay DOM work out of core

The overlay controllers no longer expose local `computePosition`, listener counters, presence managers, focus-trap state, or portal cleanup actions. Those APIs combined semantic state with browser effects and could disagree across primitives and frameworks.

Use controller policy/state for semantic rendering and bind real elements through `createUIFnOverlayDomBinding` from `@uifn/dom`. The binding consumes the shared root-scoped layer, focus-scope, modal, positioning, portal, and presence services. This is a clean break; there are no model aliases or compatibility shims.

Drawer, FloatingPanel, and Tour now have first-class factories: `createDrawerController`, `createFloatingPanelController`, and `createTourController`.
