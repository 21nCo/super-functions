import { createUIFnError } from './errors';

export type UIFnAttributeValue = string | number | boolean | null | undefined;
export type UIFnAriaAttributes = Record<string, UIFnAttributeValue>;
export type UIFnDataAttributes = Record<string, UIFnAttributeValue>;
export type UIFnStyleAttributes = Record<string, string | number | null | undefined>;
export type UIFnSafeAttributes = Record<string, UIFnAttributeValue>;

export interface UIFnSvgPathContent {
  readonly kind: 'svg-path';
  readonly d: string;
}

export type UIFnDefaultPartContent = string | UIFnSvgPathContent;

function contentRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

/**
 * Resolves semantic content supplied by a primitive when the consumer does not
 * provide children. This belongs to the core part contract so framework
 * adapters only translate the descriptor into their native rendering model.
 */
export function resolveUIFnDefaultPartContent(
  primitive: string,
  part: string,
  state: Readonly<Record<string, unknown>>,
): UIFnDefaultPartContent | undefined {
  if (primitive === 'QRCode' && part === 'image' && typeof state.path === 'string') {
    return Object.freeze({ kind: 'svg-path', d: state.path });
  }
  if (primitive !== 'Select' || part !== 'valueText') return undefined;
  const selectedKeys = Array.isArray(state.selectedKeys)
    ? state.selectedKeys.filter((value): value is string => typeof value === 'string')
    : [];
  const items = Array.isArray(state.items) ? state.items : [];
  const labels = selectedKeys.map((key) => {
    const item = items.map(contentRecord).find((candidate) => candidate?.id === key);
    const label = item?.textValue ?? item?.label ?? item?.value;
    return typeof label === 'string' && label.length > 0 ? label : key;
  });
  return labels.length > 0 ? labels.join(', ') : undefined;
}

export interface UIFnPartEvent<TCurrentTarget = unknown> {
  readonly type: string;
  readonly key?: string;
  readonly pointerType?: string;
  readonly button?: number;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly relatedTarget?: unknown;
  readonly currentTarget?: TCurrentTarget | null;
  readonly isComposing?: boolean;
  readonly data?: string | null;
  readonly inputType?: string;
  readonly value?: string;
  readonly selectionStart?: number | null;
  readonly selectionEnd?: number | null;
  readonly propagationStopped?: boolean;
  readonly defaultPrevented?: boolean;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export type UIFnPartEventHandler<TEvent extends UIFnPartEvent = UIFnPartEvent> = (
  event?: TEvent,
) => void;
export type UIFnPartEventHandlers<TEvent extends UIFnPartEvent = UIFnPartEvent> = Record<
  string,
  UIFnPartEventHandler<TEvent> | undefined
>;

export type UIFnPartRef<TElement = unknown> =
  | ((element: TElement | null) => void)
  | { current: TElement | null }
  | null
  | undefined;

export interface UIFnSemanticPartProps<
  TElement = unknown,
  TEvent extends UIFnPartEvent<TElement> = UIFnPartEvent<TElement>,
> {
  role?: string;
  id?: string;
  tabIndex?: number;
  aria?: UIFnAriaAttributes;
  data?: UIFnDataAttributes;
  attributes?: UIFnSafeAttributes;
  class?: string;
  className?: string;
  style?: UIFnStyleAttributes;
  on?: UIFnPartEventHandlers<TEvent>;
  ref?: UIFnPartRef<TElement>;
  hidden?: boolean;
  disabled?: boolean;
  warnings?: string[];
}

export type UIFnPartProps<
  TElement = unknown,
  TEvent extends UIFnPartEvent<TElement> = UIFnPartEvent<TElement>,
  TNativeProps extends object = object,
> = Omit<TNativeProps, keyof UIFnSemanticPartProps<TElement, TEvent>>
  & UIFnSemanticPartProps<TElement, TEvent>;

export interface UIFnPartController<
  TElement = unknown,
  TProps extends UIFnPartProps<any, any> = UIFnPartProps<TElement>,
> {
  readonly name: string;
  getProps(userProps?: TProps): TProps;
}

export interface UIFnRequiredPartProps {
  role?: boolean;
  id?: boolean;
  tabIndex?: boolean;
  aria?: readonly string[];
  data?: readonly string[];
  attributes?: readonly string[];
}

export interface UIFnPartInvariants extends UIFnRequiredPartProps {
  readonly hidden?: boolean;
  readonly disabled?: boolean;
}

export interface UIFnMergePartPropsOptions {
  readonly component?: string;
  readonly part?: string;
  readonly required?: UIFnRequiredPartProps;
  readonly invariants?: UIFnPartInvariants;
  readonly nonCancelableHandlers?: readonly string[];
}

const OVERRIDE_WARNING = 'UIFN_PART_INVARIANT_OVERRIDDEN';

function cleanAttributes<T extends Record<string, UIFnAttributeValue>>(
  attributes: T | undefined,
): Record<string, Exclude<UIFnAttributeValue, null | undefined>> {
  return Object.fromEntries(
    Object.entries(attributes ?? {}).filter(([, value]) => value !== null && value !== undefined),
  ) as Record<string, Exclude<UIFnAttributeValue, null | undefined>>;
}

function cleanStyle(style: UIFnStyleAttributes | undefined): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(style ?? {}).filter(([, value]) => value !== null && value !== undefined),
  ) as Record<string, string | number>;
}

function joinClassNames(...values: (string | undefined)[]): string | undefined {
  const tokens = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []);
  return tokens.length > 0 ? Array.from(new Set(tokens)).join(' ') : undefined;
}

function addWarning(warnings: string[], code: string): void {
  if (!warnings.includes(code)) warnings.push(code);
}

function assignRef<TElement>(ref: UIFnPartRef<TElement>, value: TElement | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref && typeof ref === 'object') ref.current = value;
}

export function composeUIFnRefs<TElement>(
  ...refs: readonly UIFnPartRef<TElement>[]
): (element: TElement | null) => void {
  let previous: TElement | null | symbol = Symbol('unassigned');
  return (element) => {
    if (Object.is(previous, element)) return;
    previous = element;
    refs.forEach((ref) => assignRef(ref, element));
  };
}

function invariantKeys(
  options: UIFnMergePartPropsOptions,
): UIFnPartInvariants {
  const required = options.required ?? {};
  const declared = options.invariants ?? {};
  return {
    role: declared.role ?? required.role,
    id: declared.id ?? required.id,
    tabIndex: declared.tabIndex ?? required.tabIndex,
    hidden: declared.hidden,
    disabled: declared.disabled,
    aria: Array.from(new Set([...(required.aria ?? []), ...(declared.aria ?? [])])),
    data: Array.from(new Set([...(required.data ?? []), ...(declared.data ?? [])])),
    attributes: Array.from(
      new Set([...(required.attributes ?? []), ...(declared.attributes ?? [])]),
    ),
  };
}

function protectScalar<T>(
  generated: T | undefined,
  user: T | undefined,
  invariant: boolean | undefined,
  warnings: string[],
): T | undefined {
  if (!invariant || generated === undefined) return user ?? generated;
  if (user !== undefined && !Object.is(user, generated)) addWarning(warnings, OVERRIDE_WARNING);
  return generated;
}

function mergeAttributeGroup(
  generated: Record<string, UIFnAttributeValue> | undefined,
  user: Record<string, UIFnAttributeValue> | undefined,
  protectedKeys: readonly string[],
  warnings: string[],
): Record<string, Exclude<UIFnAttributeValue, null | undefined>> {
  const generatedClean = cleanAttributes(generated);
  const userClean = cleanAttributes(user);
  const merged = { ...generatedClean, ...userClean };
  for (const key of protectedKeys) {
    if (!(key in generatedClean)) continue;
    if (user && key in user && !Object.is(user[key], generatedClean[key])) {
      addWarning(warnings, OVERRIDE_WARNING);
    }
    merged[key] = generatedClean[key];
  }
  return merged;
}

function mergeHandlers<TEvent extends UIFnPartEvent>(
  generated: UIFnPartEventHandlers<TEvent> | undefined,
  user: UIFnPartEventHandlers<TEvent> | undefined,
  nonCancelableHandlers: readonly string[],
): UIFnPartEventHandlers<TEvent> | undefined {
  const handlerNames = Array.from(new Set([...Object.keys(generated ?? {}), ...Object.keys(user ?? {})]));
  if (handlerNames.length === 0) return undefined;

  return Object.fromEntries(
    handlerNames.map((name) => {
      const generatedHandler = generated?.[name];
      const userHandler = user?.[name];
      if (!generatedHandler || !userHandler) return [name, generatedHandler ?? userHandler];
      return [
        name,
        (event?: TEvent) => {
          userHandler(event);
          if (event?.defaultPrevented && !nonCancelableHandlers.includes(name)) return;
          generatedHandler(event);
        },
      ];
    }),
  );
}

function assertRequired(
  props: UIFnPartProps<any, any>,
  options: UIFnMergePartPropsOptions,
): void {
  const required = options.required;
  if (!required) return;
  const missingRole = required.role && !props.role;
  const missingId = required.id && !props.id;
  const missingTabIndex = required.tabIndex && props.tabIndex === undefined;
  const missingAria = (required.aria ?? []).find((key) => props.aria?.[key] === undefined);
  const missingData = (required.data ?? []).find((key) => props.data?.[key] === undefined);
  const missingAttribute = (required.attributes ?? []).find(
    (key) => props.attributes?.[key] === undefined,
  );
  if (missingRole || missingId || missingTabIndex || missingAria || missingData || missingAttribute) {
    throw createUIFnError({
      code: 'UIFN_REQUIRED_A11Y_PROP_MISSING',
      package: '@uifn/core',
      component: options.component,
      message: 'Generated part props MUST preserve required accessibility metadata.',
      details: {
        part: options.part,
        missingRole,
        missingId,
        missingTabIndex,
        missingAria,
        missingData,
        missingAttribute,
      },
    });
  }
}

export function mergePartProps<
  TElement = unknown,
  TEvent extends UIFnPartEvent<TElement> = UIFnPartEvent<TElement>,
  TProps extends UIFnPartProps<TElement, TEvent> = UIFnPartProps<TElement, TEvent>,
>(
  generated: TProps,
  userProps: TProps = {} as TProps,
  options: UIFnMergePartPropsOptions = {},
): TProps {
  const warnings = [...(generated.warnings ?? []), ...(userProps.warnings ?? [])];
  const invariants = invariantKeys(options);
  const merged = {
    ...generated,
    ...userProps,
    role: protectScalar(generated.role, userProps.role, invariants.role, warnings),
    id: protectScalar(generated.id, userProps.id, invariants.id, warnings),
    tabIndex: protectScalar(generated.tabIndex, userProps.tabIndex, invariants.tabIndex, warnings),
    aria: mergeAttributeGroup(generated.aria, userProps.aria, invariants.aria ?? [], warnings),
    data: mergeAttributeGroup(generated.data, userProps.data, invariants.data ?? [], warnings),
    attributes: mergeAttributeGroup(
      generated.attributes,
      userProps.attributes,
      invariants.attributes ?? [],
      warnings,
    ),
    class: joinClassNames(generated.class, userProps.class),
    className: joinClassNames(generated.className, userProps.className),
    style: { ...cleanStyle(generated.style), ...cleanStyle(userProps.style) },
    on: mergeHandlers(generated.on, userProps.on, options.nonCancelableHandlers ?? []),
    ref:
      generated.ref || userProps.ref
        ? composeUIFnRefs(generated.ref, userProps.ref)
        : undefined,
    hidden: protectScalar(generated.hidden, userProps.hidden, invariants.hidden, warnings),
    disabled: protectScalar(generated.disabled, userProps.disabled, invariants.disabled, warnings),
  } as TProps;

  if (warnings.length > 0) merged.warnings = warnings;
  else delete merged.warnings;
  assertRequired(merged, options);
  return merged;
}

export function createPartController<
  TElement = unknown,
  TProps extends UIFnPartProps<any, any> = UIFnPartProps<TElement>,
>(
  name: string,
  getGeneratedProps: () => TProps,
  options: UIFnMergePartPropsOptions = {},
): UIFnPartController<TElement, TProps> {
  return {
    name,
    getProps(userProps) {
      return mergePartProps<any, any, TProps>(getGeneratedProps(), userProps, {
        ...options,
        part: options.part ?? name,
      });
    },
  };
}
