export type UIFnPackageName =
  | '@uifn/core'
  | '@uifn/dom'
  | '@uifn/adapter-kit'
  | '@uifn/react'
  | '@uifn/svelte'
  | '@uifn/solid'
  | '@uifn/tokens'
  | '@uifn/theme'
  | '@uifn/theme-tailwind'
  | '@uifn/recipes'
  | '@uifn/components'
  | '@uifn/patterns'
  | '@uifn/sf'
  | '@uifn/registry'
  | '@uifn/storybook';

const CANONICAL_UIFN_ERROR_CODES = [
  'UIFN_ERR_A11Y_GATE_FAILURE',
  'UIFN_ERR_CONTEXT_MISSING',
  'UIFN_ERR_CONTROLLED_STATE_DIVERGENCE',
  'UIFN_ERR_DETERMINISTIC_ID_MISMATCH',
  'UIFN_ERR_DOCS_DRIFT',
  'UIFN_ERR_DUPLICATE_PUBLIC_ID',
  'UIFN_ERR_EXPORT_SURFACE_MISMATCH',
  'UIFN_ERR_HYDRATION_MISMATCH',
  'UIFN_ERR_INVALID_VALUE',
  'UIFN_ERR_MANUAL_EVIDENCE_INVALID',
  'UIFN_ERR_MENU_NAVIGATION',
  'UIFN_ERR_PACK_ARTIFACT_LEAK',
  'UIFN_ERR_POSITIONING_OVERFLOW',
  'UIFN_ERR_PUBLIC_SURFACE_DRIFT',
  'UIFN_ERR_RANGE_OUT_OF_BOUNDS',
  'UIFN_ERR_SCROLL_SYNC',
  'UIFN_ERR_TEST_MATRIX_GAP',
  'UIFN_ERR_TOOLCHAIN_MISCONFIG',
  'UIFN_ERR_UNSUPPORTED_ENVIRONMENT',
  'UIFN_ERR_UNSUPPORTED_PUBLIC_CLAIM',
  'UIFN_ERR_WARNING_SUPPRESSED',
  'UIFN_ERR_CONSUMER_SMOKE_FAILURE',
  'UIFN_ERR_DIALOG_MODAL_INCOMPLETE',
  'UIFN_ACCESSIBLE_NAME_MISSING',
  'UIFN_ALERT_DIALOG_DISMISSAL',
  'UIFN_OVERLAY_POLICY_FORK',
  'UIFN_OVERLAY_RESOURCE_LEAK',
  'UIFN_TOOLTIP_INTERACTION_INVALID',
  'UIFN_KEYBOARD_MODEL_DIVERGED',
  'UIFN_NAVIGATION_FOCUS_REPAIR_MISSING',
  'UIFN_NAVIGATION_POLICY_FORK',
  'UIFN_SUBMENU_GRACE_INVALID',
  'UIFN_NAVIGATION_RESOURCE_LEAK',
  'UIFN_NAVIGATION_COLLECTION_INVALID',
  'UIFN_CONTROLLED_STATE_DIVERGED',
  'UIFN_FORM_VALUE_SERIALIZATION',
  'UIFN_IME_COMMIT_EARLY',
  'UIFN_CLIPBOARD_DENIED',
  'UIFN_FILE_REJECTED',
  'UIFN_INPUT_CAPABILITY_UNAVAILABLE',
  'UIFN_CONTROLLED_UPDATE_STALE',
  'UIFN_INPUT_RESOURCE_LEAK',
  'UIFN_GESTURE_AFTER_CANCEL',
  'UIFN_RANGE_DIRECTION_INVALID',
  'UIFN_AMBIENT_DATE_PARSE',
  'UIFN_DATE_VALUE_INVALID',
  'UIFN_COLOR_VALUE_INVALID',
  'UIFN_TIMER_DRIFT_BUDGET',
  'UIFN_ANNOUNCEMENT_FLOOD',
  'UIFN_TIMER_AFTER_DESTROY',
  'UIFN_UNLOCALIZED_DEFAULT',
  'UIFN_RTL_KEYBOARD_DIVERGED',
  'UIFN_CHANGE_META_INVALID',
  'UIFN_CONTROLLER_DESTROYED',
  'UIFN_EFFECT_CLEANUP_MISSING',
  'UIFN_ENV_CAPABILITY_MISSING',
  'UIFN_EVENT_ORDER_DIVERGED',
  'UIFN_MULTIPLE_BEHAVIOR_RUNTIME',
  'UIFN_LEGACY_BEHAVIOR_PATH',
  'UIFN_CONTROLLER_CONTRACT_INVALID',
  'UIFN_HANDLER_ORDER_INVALID',
  'UIFN_PART_INVARIANT_OVERRIDDEN',
  'UIFN_TABBABLE_INVALID',
  'UIFN_ROOT_LISTENER_DUPLICATE',
  'UIFN_LAYER_OUTSIDE_CLASSIFICATION',
  'UIFN_FOCUS_SCOPE_ESCAPE',
  'UIFN_FOCUS_RESTORE_FAILED',
  'UIFN_SCROLL_LOCK_NESTING',
  'UIFN_MODAL_ISOLATION_STALE',
  'UIFN_POSITION_OUT_OF_BOUNDARY',
  'UIFN_POSITION_OBSERVER_LEAK',
  'UIFN_PORTAL_HYDRATION_DUPLICATE',
  'UIFN_FORM_BRIDGE_DUPLICATE',
  'UIFN_LIVE_REGION_STALE_MESSAGE',
  'UIFN_DOM_SCOPE_INVALID',
  'UIFN_DOM_SERVICE_DESTROYED',
  'UIFN_PRIVATE_RUNTIME_EXPORTED',
  'UIFN_RUNTIME_CHILD_DUPLICATE',
  'UIFN_RUNTIME_CHILD_FAILED',
  'UIFN_RUNTIME_DEFINITION_INVALID',
  'UIFN_RUNTIME_EVENT_CYCLE',
  'UIFN_RUNTIME_EVENT_INVALID',
  'UIFN_RUNTIME_INPUT_INVALID',
  'UIFN_RUNTIME_NOT_RUNNING',
  'UIFN_SCOPE_ID_COLLISION',
  'UIFN_SNAPSHOT_CHANGE_NOT_PUBLISHED',
  'UIFN_SNAPSHOT_NON_SERIALIZABLE',
  'UIFN_STALE_EFFECT_MUTATION',
  'UIFN_TRACE_DIVERGED',
  'UIFN_TRACE_SECRET',
  'UIFN_UNSTABLE_ERROR',
  'UIFN_CORE_DISABLED_MUTATED',
  'UIFN_CORE_ENVIRONMENT_INVALID',
  'UIFN_REQUIRED_A11Y_PROP_MISSING',
  'UIFN_REQUIRED_A11Y_PROP_OVERRIDDEN',
  'UIFN_SOURCE_PROVENANCE_VIOLATION',
  'UIFN_ADAPTER_BEHAVIOR_DRIFT',
  'UIFN_ADAPTER_CONTEXT_MISSING',
  'UIFN_ADAPTER_COVERAGE_MISSING',
  'UIFN_ADAPTER_DIRECTIVE_CONTEXT_MISSING',
  'UIFN_ADAPTER_PROVIDE_INJECT_MISSING',
  'UIFN_ADAPTER_SIGNAL_STALE',
  'UIFN_FRAMEWORK_BEHAVIOR_FORK',
  'UIFN_PART_REF_LOST',
  'UIFN_RECIPE_UNKNOWN_VARIANT',
  'UIFN_SURFACE_DEPTH_OUT_OF_RANGE',
  'UIFN_TAILWIND_DYNAMIC_CLASS_UNSAFE',
  'UIFN_THEME_SCOPE_INVALID',
  'UIFN_TOKEN_CONTRAST_FAILED',
  'UIFN_TOKEN_PUBLIC_NAME_INVALID',
] as const;

// Legacy codes still used by existing core primitives until later phases migrate those call sites.
const LEGACY_UIFN_ERROR_CODES = [
  'UIFN_ERR_ASCHILD_CONTRACT',
  'UIFN_ERR_COMBOBOX_FILTER_STATE',
  'UIFN_ERR_DISABLED_INTERACTION',
  'UIFN_ERR_SVELTE_REACTIVITY_SNAPSHOT',
] as const;

export const UIFN_ERROR_CODES = [
  ...CANONICAL_UIFN_ERROR_CODES,
  ...LEGACY_UIFN_ERROR_CODES,
] as const;

export type UIFnErrorCode = (typeof UIFN_ERROR_CODES)[number];

export interface UIFnErrorPayload {
  name: 'UIFnError';
  code: UIFnErrorCode;
  package: UIFnPackageName;
  component?: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export interface UIFnErrorOptions {
  code: UIFnErrorCode;
  package?: UIFnPackageName;
  component?: string;
  message?: string;
  details?: Record<string, unknown>;
  recoverable?: boolean;
  cause?: unknown;
}

const DEFAULT_MESSAGES: Partial<Record<UIFnErrorCode, string>> = {
  UIFN_ERR_CONTEXT_MISSING: 'Required UI context is missing.',
  UIFN_ACCESSIBLE_NAME_MISSING: 'An overlay requiring an accessible name has none.',
  UIFN_ALERT_DIALOG_DISMISSAL: 'AlertDialog outside dismissal violates its safety policy.',
  UIFN_OVERLAY_POLICY_FORK: 'Overlay behavior diverged from the canonical primitive policy.',
  UIFN_OVERLAY_RESOURCE_LEAK: 'Overlay DOM resources remained after teardown.',
  UIFN_TOOLTIP_INTERACTION_INVALID: 'Tooltip interaction diverged from hover, focus, Escape, or touch policy.',
  UIFN_KEYBOARD_MODEL_DIVERGED: 'Navigation behavior diverged from its declared keyboard model.',
  UIFN_NAVIGATION_FOCUS_REPAIR_MISSING: 'Dynamic collection changes did not repair focus deterministically.',
  UIFN_NAVIGATION_POLICY_FORK: 'A navigation primitive bypassed the canonical keyboard policy.',
  UIFN_SUBMENU_GRACE_INVALID: 'Nested menu pointer grace diverged from the shared DOM policy.',
  UIFN_NAVIGATION_RESOURCE_LEAK: 'Navigation DOM resources remained after teardown.',
  UIFN_NAVIGATION_COLLECTION_INVALID: 'Navigation collection identity or nesting is invalid.',
  UIFN_CONTROLLED_STATE_DIVERGED: 'A controlled primitive mutated before its owner synchronized the value.',
  UIFN_FORM_VALUE_SERIALIZATION: 'A primitive value cannot be serialized into a native form deterministically.',
  UIFN_IME_COMMIT_EARLY: 'Text was committed before the active IME composition ended.',
  UIFN_CLIPBOARD_DENIED: 'The injected clipboard capability denied the requested operation.',
  UIFN_FILE_REJECTED: 'A selected file violates the declared acceptance policy.',
  UIFN_INPUT_CAPABILITY_UNAVAILABLE: 'A required clipboard or file capability is unavailable.',
  UIFN_CONTROLLED_UPDATE_STALE: 'An older controlled update lost a newer input transaction.',
  UIFN_INPUT_RESOURCE_LEAK: 'Input or form DOM resources remained after teardown.',
  UIFN_GESTURE_AFTER_CANCEL: 'A cancelled pointer continued to mutate gesture state.',
  UIFN_RANGE_DIRECTION_INVALID: 'Range movement diverged from its declared direction model.',
  UIFN_AMBIENT_DATE_PARSE: 'Display text or host date parsing was used as structured date identity.',
  UIFN_DATE_VALUE_INVALID: 'The structured calendar date is invalid.',
  UIFN_COLOR_VALUE_INVALID: 'The structured color value is invalid.',
  UIFN_TIMER_DRIFT_BUDGET: 'Timer elapsed time diverged from the injected clock.',
  UIFN_ANNOUNCEMENT_FLOOD: 'Continuous updates exceeded the live-announcement rate policy.',
  UIFN_TIMER_AFTER_DESTROY: 'A destroyed timed controller invoked a stale callback.',
  UIFN_UNLOCALIZED_DEFAULT: 'Core behavior emitted a non-localizable user-visible default.',
  UIFN_RTL_KEYBOARD_DIVERGED: 'RTL keyboard behavior diverged from its declared logical model.',
  UIFN_ERR_DETERMINISTIC_ID_MISMATCH: 'Public IDs MUST be deterministic across runtimes.',
  UIFN_ERR_DUPLICATE_PUBLIC_ID: 'GA surfaces MUST NOT share fixed instance-scoped IDs.',
  UIFN_ERR_INVALID_VALUE: 'Invalid public value for this surface.',
  UIFN_ERR_RANGE_OUT_OF_BOUNDS: 'Public value is outside the supported range.',
  UIFN_ERR_TOOLCHAIN_MISCONFIG: 'Verification failed due to toolchain misconfiguration.',
  UIFN_ERR_UNSUPPORTED_ENVIRONMENT: 'Unsupported environment matrix for this package.',
  UIFN_CHANGE_META_INVALID: 'Runtime change metadata is incomplete or unstable.',
  UIFN_CONTROLLER_DESTROYED: 'The controller was destroyed and cannot be mutated.',
  UIFN_EFFECT_CLEANUP_MISSING: 'A runtime effect or activity omitted its cleanup contract.',
  UIFN_ENV_CAPABILITY_MISSING: 'A required injected environment capability is missing.',
  UIFN_EVENT_ORDER_DIVERGED: 'Runtime event order diverged from FIFO run-to-completion semantics.',
  UIFN_MULTIPLE_BEHAVIOR_RUNTIME: 'A behavior path bypasses the one private runtime.',
  UIFN_LEGACY_BEHAVIOR_PATH: 'A removed behavior API or import path remains reachable.',
  UIFN_CONTROLLER_CONTRACT_INVALID: 'A public controller does not satisfy the canonical contract.',
  UIFN_HANDLER_ORDER_INVALID: 'Part event handlers did not preserve user-first cancellation semantics.',
  UIFN_PART_INVARIANT_OVERRIDDEN: 'A declared part semantic invariant was overridden.',
  UIFN_TABBABLE_INVALID: 'DOM focusability or tabbability diverged from native behavior.',
  UIFN_ROOT_LISTENER_DUPLICATE: 'A DOM root installed a duplicate delegated listener.',
  UIFN_LAYER_OUTSIDE_CLASSIFICATION: 'A dismissable layer misclassified an interaction path.',
  UIFN_FOCUS_SCOPE_ESCAPE: 'Focus escaped an active focus scope.',
  UIFN_FOCUS_RESTORE_FAILED: 'A focus scope could not restore focus to a valid target.',
  UIFN_SCROLL_LOCK_NESTING: 'Nested scroll locks restored the root before the final release.',
  UIFN_MODAL_ISOLATION_STALE: 'Modal isolation left stale inert or aria-hidden state.',
  UIFN_POSITION_OUT_OF_BOUNDARY: 'Positioning placed content outside its declared boundary.',
  UIFN_POSITION_OBSERVER_LEAK: 'A positioner retained auto-update work after teardown.',
  UIFN_PORTAL_HYDRATION_DUPLICATE: 'Portal hydration found more than one physical node for an id.',
  UIFN_FORM_BRIDGE_DUPLICATE: 'A form bridge duplicated ownership for the same controller field.',
  UIFN_LIVE_REGION_STALE_MESSAGE: 'A destroyed live-region service received a stale announcement.',
  UIFN_DOM_SCOPE_INVALID: 'The injected DOM environment does not resolve a usable root.',
  UIFN_DOM_SERVICE_DESTROYED: 'The DOM service was destroyed and cannot be mutated.',
  UIFN_PRIVATE_RUNTIME_EXPORTED: 'Private runtime implementation leaked through a public package path.',
  UIFN_RUNTIME_CHILD_DUPLICATE: 'A runtime child key is already in use.',
  UIFN_RUNTIME_CHILD_FAILED: 'A child runtime service failed.',
  UIFN_RUNTIME_DEFINITION_INVALID: 'A private runtime definition is invalid.',
  UIFN_RUNTIME_EVENT_CYCLE: 'Runtime event processing exceeded its deterministic step cap.',
  UIFN_RUNTIME_EVENT_INVALID: 'The runtime event is invalid or undeclared.',
  UIFN_RUNTIME_INPUT_INVALID: 'Runtime inputs failed validation.',
  UIFN_RUNTIME_NOT_RUNNING: 'The runtime service is not running.',
  UIFN_SCOPE_ID_COLLISION: 'A deterministic id collided within its runtime scope.',
  UIFN_SNAPSHOT_CHANGE_NOT_PUBLISHED: 'A semantic snapshot change was not published.',
  UIFN_SNAPSHOT_NON_SERIALIZABLE: 'A runtime snapshot contains a non-serializable value.',
  UIFN_STALE_EFFECT_MUTATION: 'Stale effect work attempted to mutate a service.',
  UIFN_TRACE_DIVERGED: 'Semantic trace comparison detected a divergence.',
  UIFN_TRACE_SECRET: 'A semantic trace contains secret or user content.',
  UIFN_UNSTABLE_ERROR: 'Runtime work threw an error without a stable uifn code.',
  UIFN_CORE_DISABLED_MUTATED: 'Disabled controller interaction mutated state.',
  UIFN_CORE_ENVIRONMENT_INVALID: 'Controller environment produced invalid behavior metadata.',
  UIFN_REQUIRED_A11Y_PROP_MISSING: 'Required accessibility metadata is missing.',
  UIFN_REQUIRED_A11Y_PROP_OVERRIDDEN: 'Required accessibility metadata was overridden.',
  UIFN_SOURCE_PROVENANCE_VIOLATION: 'Source provenance policy failed clean-room validation.',
  UIFN_ADAPTER_BEHAVIOR_DRIFT: 'Adapter behavior diverged from the conformance vector.',
  UIFN_ADAPTER_COVERAGE_MISSING: 'Adapter conformance coverage is missing for a required framework.',
  UIFN_RECIPE_UNKNOWN_VARIANT: 'Recipe variant is not part of the static recipe contract.',
  UIFN_SURFACE_DEPTH_OUT_OF_RANGE: 'Surface depth is outside the supported styling range.',
  UIFN_TAILWIND_DYNAMIC_CLASS_UNSAFE: 'Tailwind integration received an unsafe dynamic class fragment.',
  UIFN_THEME_SCOPE_INVALID: 'Theme scope selector is unsafe or unsupported.',
  UIFN_TOKEN_CONTRAST_FAILED: 'Token contrast validation failed.',
  UIFN_TOKEN_PUBLIC_NAME_INVALID: 'Public token name is not semantic.',
};

export class UIFnError extends Error {
  readonly name = 'UIFnError';
  readonly code: UIFnErrorCode;
  readonly package: UIFnPackageName;
  readonly component?: string;
  readonly details?: Record<string, unknown>;
  readonly recoverable: boolean;
  readonly cause?: unknown;

  constructor(options: UIFnErrorOptions) {
    const message = options.message ?? DEFAULT_MESSAGES[options.code] ?? options.code;
    super(message);

    Object.setPrototypeOf(this, new.target.prototype);

    this.code = options.code;
    this.package = options.package ?? '@uifn/core';
    this.component = options.component;
    this.details = options.details;
    this.recoverable = options.recoverable ?? false;
    this.cause = options.cause;
  }

  toJSON(): UIFnErrorPayload {
    return {
      name: this.name,
      code: this.code,
      package: this.package,
      component: this.component,
      message: this.message,
      recoverable: this.recoverable,
      details: this.details,
    };
  }
}

export function createUIFnError(options: UIFnErrorOptions): UIFnError {
  return new UIFnError(options);
}

export function isUIFnError(error: unknown): error is UIFnError {
  return error instanceof UIFnError;
}

export function toUIFnErrorPayload(
  error: unknown,
  fallback: Partial<UIFnErrorOptions> = {}
): UIFnErrorPayload {
  if (isUIFnError(error)) {
    return error.toJSON();
  }

  return createUIFnError({
    code: fallback.code ?? 'UIFN_ERR_TOOLCHAIN_MISCONFIG',
    package: fallback.package ?? '@uifn/core',
    component: fallback.component,
    message:
      fallback.message ??
      (error instanceof Error ? error.message : DEFAULT_MESSAGES.UIFN_ERR_TOOLCHAIN_MISCONFIG),
    details:
      fallback.details ??
      (error instanceof Error
        ? { originalErrorName: error.name }
        : error !== undefined
          ? { originalError: error }
          : undefined),
    recoverable: fallback.recoverable ?? false,
    cause: fallback.cause ?? error,
  }).toJSON();
}

type AssertionOptions = Omit<UIFnErrorOptions, 'code'>;

export function assertContext<T>(
  value: T | null | undefined,
  options: AssertionOptions = {}
): T {
  if (value === null || value === undefined) {
    throw createUIFnError({
      code: 'UIFN_ERR_CONTEXT_MISSING',
      ...options,
      recoverable: options.recoverable ?? false,
    });
  }

  return value;
}

export function assertValidValue(
  condition: boolean,
  options: AssertionOptions = {}
): void {
  if (!condition) {
    throw createUIFnError({
      code: 'UIFN_ERR_INVALID_VALUE',
      ...options,
      recoverable: options.recoverable ?? false,
    });
  }
}

export function assertInRange(
  value: number,
  range: { min?: number; max?: number },
  options: AssertionOptions = {}
): number {
  const belowMin = range.min !== undefined && value < range.min;
  const aboveMax = range.max !== undefined && value > range.max;

  if (belowMin || aboveMax) {
    throw createUIFnError({
      code: 'UIFN_ERR_RANGE_OUT_OF_BOUNDS',
      ...options,
      details: {
        value,
        min: range.min,
        max: range.max,
        ...options.details,
      },
      recoverable: options.recoverable ?? false,
    });
  }

  return value;
}

export function runIfEnabled(enabled: boolean, fn: () => void): boolean {
  if (!enabled) {
    return false;
  }

  fn();
  return true;
}
