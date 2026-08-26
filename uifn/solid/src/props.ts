import {
  normalizeAriaAttributes,
  normalizeDataAttributes,
  toCssStyleEntries,
  toCssStyleString,
} from '@uifn/adapter-kit';
import { mergePartProps, type UIFnPartEvent, type UIFnPartProps, type UIFnPartRef } from '@uifn/core/parts';

type SolidProps = Record<string, unknown>;
type SolidEventHandler = (event: Event) => void;
type NativePartEvent = UIFnPartEvent & { readonly nativeEvent: Event };

const RESERVED = new Set(['children', 'as', 'render', 'value', 'forceMount', 'container', 'environment']);
function eventNameFromProp(key: string): string | null {
  if (!/^on(?::)?[a-zA-Z]/.test(key)) return null;
  return key.replace(/^on:?/, '').toLowerCase();
}

function toCoreEvent(type: string, event: Event): NativePartEvent {
  const currentTarget = event.currentTarget as (EventTarget & {
    value?: unknown;
    selectionStart?: number | null;
    selectionEnd?: number | null;
  }) | null;
  const richEvent = event as Event & {
    key?: unknown;
    pointerType?: unknown;
    button?: unknown;
    clientX?: unknown;
    clientY?: unknown;
    altKey?: unknown;
    ctrlKey?: unknown;
    metaKey?: unknown;
    shiftKey?: unknown;
    relatedTarget?: unknown;
    data?: unknown;
    inputType?: unknown;
    isComposing?: unknown;
    clipboardData?: { getData(type: string): string } | null;
  };
  let clipboardData: string | undefined;
  if (type === 'paste' && richEvent.clipboardData) {
    try {
      clipboardData = richEvent.clipboardData.getData('text/plain');
    } catch {
      clipboardData = undefined;
    }
  }
  return {
    type,
    nativeEvent: event,
    key: typeof richEvent.key === 'string' ? richEvent.key : undefined,
    pointerType: typeof richEvent.pointerType === 'string' ? richEvent.pointerType : undefined,
    button: typeof richEvent.button === 'number' ? richEvent.button : undefined,
    clientX: typeof richEvent.clientX === 'number' ? richEvent.clientX : undefined,
    clientY: typeof richEvent.clientY === 'number' ? richEvent.clientY : undefined,
    altKey: typeof richEvent.altKey === 'boolean' ? richEvent.altKey : undefined,
    ctrlKey: typeof richEvent.ctrlKey === 'boolean' ? richEvent.ctrlKey : undefined,
    metaKey: typeof richEvent.metaKey === 'boolean' ? richEvent.metaKey : undefined,
    shiftKey: typeof richEvent.shiftKey === 'boolean' ? richEvent.shiftKey : undefined,
    relatedTarget: richEvent.relatedTarget,
    currentTarget,
    isComposing: typeof richEvent.isComposing === 'boolean' ? richEvent.isComposing : undefined,
    data: clipboardData ?? (typeof richEvent.data === 'string' || richEvent.data === null ? richEvent.data : undefined),
    inputType: typeof richEvent.inputType === 'string' ? richEvent.inputType : undefined,
    value: typeof currentTarget?.value === 'string' ? currentTarget.value : undefined,
    selectionStart: typeof currentTarget?.selectionStart === 'number' || currentTarget?.selectionStart === null
      ? currentTarget.selectionStart
      : undefined,
    selectionEnd: typeof currentTarget?.selectionEnd === 'number' || currentTarget?.selectionEnd === null
      ? currentTarget.selectionEnd
      : undefined,
    get defaultPrevented() {
      return event.defaultPrevented;
    },
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation(),
  };
}

export function toSolidUserPartProps(input: SolidProps): UIFnPartProps {
  const attributes: Record<string, string | number | boolean | null | undefined> = {};
  const aria: Record<string, string | number | boolean | null | undefined> = {};
  const data: Record<string, string | number | boolean | null | undefined> = {};
  const on: NonNullable<UIFnPartProps['on']> = {};
  const result: UIFnPartProps = {};

  for (const key of Object.keys(input)) {
    if (RESERVED.has(key)) continue;
    const value = input[key];
    if (value === undefined) continue;
    const eventName = eventNameFromProp(key);
    if (eventName && typeof value === 'function') {
      on[eventName] = (event) => {
        const native = (event as NativePartEvent | undefined)?.nativeEvent;
        (value as SolidEventHandler)(native ?? event as unknown as Event);
      };
    } else if (key === 'on' && value && typeof value === 'object') Object.assign(on, value);
    else if (key === 'aria' && value && typeof value === 'object') Object.assign(aria, value);
    else if (key === 'data' && value && typeof value === 'object') Object.assign(data, value);
    else if (key.startsWith('aria-')) aria[key.slice(5)] = value as never;
    else if (key.startsWith('data-')) data[key.slice(5)] = value as never;
    else if (key === 'class' || key === 'className') result[key] = String(value);
    else if (key === 'style' && value && typeof value === 'object') result.style = value as UIFnPartProps['style'];
    else if (key === 'style') attributes.style = String(value);
    else if (key === 'role') result.role = String(value);
    else if (key === 'id') result.id = String(value);
    else if (key === 'tabindex' || key === 'tabIndex') result.tabIndex = Number(value);
    else if (key === 'hidden') result.hidden = Boolean(value);
    else if (key === 'disabled') result.disabled = Boolean(value);
    else if (key === 'ref') result.ref = value as UIFnPartRef<unknown>;
    else attributes[key === 'readOnly' ? 'readonly' : key] = value as never;
  }
  if (Object.keys(attributes).length) result.attributes = attributes;
  if (Object.keys(aria).length) result.aria = aria;
  if (Object.keys(data).length) result.data = data;
  if (Object.keys(on).length) result.on = on;
  return result;
}

export function toSolidSpreadProps(partProps: UIFnPartProps): SolidProps {
  const result: SolidProps = {
    ...(partProps.attributes ?? {}),
    role: partProps.role,
    id: partProps.id,
    tabIndex: partProps.tabIndex,
    hidden: partProps.hidden,
    disabled: partProps.disabled,
    class: partProps.class ?? partProps.className,
    style: toCssStyleString(partProps.style),
    ...normalizeAriaAttributes(partProps.aria),
    ...normalizeDataAttributes(partProps.data),
  };
  for (const key of Object.keys(result)) if (result[key] === undefined) delete result[key];
  return result;
}

const BOOLEAN_PROPERTIES = new Set(['checked', 'disabled', 'required', 'readonly', 'multiple', 'selected']);

function propertyName(name: string): string {
  return name === 'readonly' ? 'readOnly' : name;
}

function attributeName(name: string): string {
  if (name === 'tabIndex') return 'tabindex';
  if (name === 'readOnly') return 'readonly';
  return name;
}

function setDomAttribute(node: HTMLElement, rawName: string, value: unknown): void {
  const name = attributeName(rawName);
  if (value === null || value === undefined || (value === false && !name.startsWith('aria-'))) {
    node.removeAttribute(name);
    if (BOOLEAN_PROPERTIES.has(name)) {
      (node as unknown as Record<string, unknown>)[propertyName(name)] = false;
    }
    return;
  }
  if (BOOLEAN_PROPERTIES.has(name)) {
    (node as unknown as Record<string, unknown>)[propertyName(name)] = Boolean(value);
  } else if (name === 'value' && 'value' in node) {
    (node as HTMLInputElement).value = String(value);
  }
  node.setAttribute(name, value === true && !name.startsWith('aria-') ? '' : String(value));
}

export interface SolidPartPropsBinding {
  update(partProps: UIFnPartProps): void;
  destroy(): void;
}

/**
 * Owns the live DOM side of a projected core part. JSX spread remains the SSR
 * representation; this binding synchronizes properties and listeners after
 * hydration without replacing the element or relying on a stale spread object.
 */
export function createSolidPartPropsBinding(
  node: HTMLElement,
  initialPartProps: UIFnPartProps,
): SolidPartPropsBinding {
  const appliedAttributes = new Map<string, unknown>();
  const appliedStyles = new Map<string, string>();
  let eventCleanups: Array<() => void> = [];
  let destroyed = false;

  const update = (partProps: UIFnPartProps): void => {
    if (destroyed) return;
    const attributes = toSolidSpreadProps(partProps);
    const nextAttributes = new Map(
      Object.entries(attributes).filter(([name]) => name !== 'style'),
    );
    for (const name of appliedAttributes.keys()) {
      if (!nextAttributes.has(name)) setDomAttribute(node, name, undefined);
    }
    for (const [name, value] of nextAttributes) {
      if (!Object.is(appliedAttributes.get(name), value)) {
        setDomAttribute(node, name, value);
      }
    }
    appliedAttributes.clear();
    nextAttributes.forEach((value, name) => appliedAttributes.set(name, value));

    const nextStyles = new Map(toCssStyleEntries(partProps.style));
    for (const name of appliedStyles.keys()) {
      if (!nextStyles.has(name)) node.style.removeProperty(name);
    }
    for (const [name, value] of nextStyles) {
      if (appliedStyles.get(name) !== value) node.style.setProperty(name, value);
    }
    appliedStyles.clear();
    nextStyles.forEach((value, name) => appliedStyles.set(name, value));

    eventCleanups.forEach((cleanup) => cleanup());
    eventCleanups = [];
    Object.entries(partProps.on ?? {}).forEach(([name, handler]) => {
      if (!handler) return;
      const listener: SolidEventHandler = (event) => handler(toCoreEvent(name, event));
      node.addEventListener(name, listener);
      eventCleanups.push(() => node.removeEventListener(name, listener));
    });
  };

  update(initialPartProps);
  return {
    update,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      eventCleanups.forEach((cleanup) => cleanup());
      eventCleanups = [];
      appliedAttributes.forEach((_value, name) => setDomAttribute(node, name, undefined));
      appliedStyles.forEach((_value, name) => node.style.removeProperty(name));
      appliedAttributes.clear();
      appliedStyles.clear();
    },
  };
}

export function applySolidPartProps(node: HTMLElement, partProps: UIFnPartProps): () => void {
  const binding = createSolidPartPropsBinding(node, partProps);
  return () => binding.destroy();
}

export function toSolidPartProps(partProps: UIFnPartProps, userProps: SolidProps = {}): SolidProps {
  return toSolidSpreadProps(mergePartProps(partProps, toSolidUserPartProps(userProps)));
}
