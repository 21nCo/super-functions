import {
  normalizeAriaAttributes,
  normalizeDataAttributes,
  toCssStyleEntries,
  toCssStyleString,
} from '@uifn/adapter-kit';
import type { UIFnPartEvent, UIFnPartProps, UIFnPartRef } from '@uifn/core';

type DomEventHandler = (event: Event) => void;
type NativePartEvent = UIFnPartEvent & { readonly nativeEvent: Event };

const RESERVED = new Set([
  'children', 'render', 'value', 'forceMount', 'container', 'environment', 'ref',
]);

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

function assignRef<TElement>(ref: UIFnPartRef<TElement>, value: TElement | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref && typeof ref === 'object') ref.current = value;
}

function setAttribute(node: HTMLElement, name: string, value: unknown): void {
  if (value === null || value === undefined || (value === false && !name.startsWith('aria-'))) {
    node.removeAttribute(name);
    if (['checked', 'disabled', 'required', 'readonly', 'multiple', 'selected'].includes(name)) {
      (node as unknown as Record<string, unknown>)[name === 'readonly' ? 'readOnly' : name] = false;
    }
    return;
  }
  if (['checked', 'disabled', 'required', 'readonly', 'multiple', 'selected'].includes(name)) {
    (node as unknown as Record<string, unknown>)[name === 'readonly' ? 'readOnly' : name] = Boolean(value);
  } else if (name === 'value' && 'value' in node) {
    (node as HTMLInputElement).value = String(value);
  }
  node.setAttribute(name, value === true && !name.startsWith('aria-') ? '' : String(value));
}

function applyStyle(node: HTMLElement, style: UIFnPartProps['style']): string[] {
  const applied: string[] = [];
  toCssStyleEntries(style).forEach(([name, value]) => {
    node.style.setProperty(name, value);
    applied.push(name);
  });
  return applied;
}

function eventNameFromProp(key: string): string | null {
  if (!/^on(?::)?[a-zA-Z]/.test(key)) return null;
  return key.replace(/^on:?/, '').toLowerCase();
}

export function toSvelteUserPartProps(input: Record<string, unknown>): UIFnPartProps {
  const attributes: Record<string, string | number | boolean | null | undefined> = {};
  const aria: Record<string, string | number | boolean | null | undefined> = {};
  const data: Record<string, string | number | boolean | null | undefined> = {};
  const on: NonNullable<UIFnPartProps['on']> = {};
  const result: UIFnPartProps = {};

  for (const [key, value] of Object.entries(input)) {
    if (RESERVED.has(key) || value === undefined) continue;
    const eventName = eventNameFromProp(key);
    if (eventName && typeof value === 'function') {
      on[eventName] = (event) => {
        const native = (event as NativePartEvent | undefined)?.nativeEvent;
        (value as DomEventHandler)(native ?? event as unknown as Event);
      };
    } else if (key === 'on' && value && typeof value === 'object') {
      Object.assign(on, value);
    } else if (key === 'aria' && value && typeof value === 'object') {
      Object.assign(aria, value);
    } else if (key === 'data' && value && typeof value === 'object') {
      Object.assign(data, value);
    } else if (key.startsWith('aria-')) aria[key.slice(5)] = value as never;
    else if (key.startsWith('data-')) data[key.slice(5)] = value as never;
    else if (key === 'class' || key === 'className') result[key] = String(value);
    else if (key === 'style' && value && typeof value === 'object') result.style = value as UIFnPartProps['style'];
    else if (key === 'style') attributes.style = String(value);
    else if (key === 'role') result.role = String(value);
    else if (key === 'id') result.id = String(value);
    else if (key === 'tabindex' || key === 'tabIndex') result.tabIndex = Number(value);
    else if (key === 'hidden') result.hidden = Boolean(value);
    else if (key === 'disabled') result.disabled = Boolean(value);
    else attributes[key === 'readOnly' ? 'readonly' : key] = value as never;
  }
  if (Object.keys(attributes).length) result.attributes = attributes;
  if (Object.keys(aria).length) result.aria = aria;
  if (Object.keys(data).length) result.data = data;
  if (Object.keys(on).length) result.on = on;
  return result;
}

export function toSvelteSpreadProps(partProps: UIFnPartProps): Record<string, unknown> {
  const result: Record<string, unknown> = {
    ...(partProps.attributes ?? {}),
    role: partProps.role,
    id: partProps.id,
    tabindex: partProps.tabIndex,
    hidden: partProps.hidden,
    disabled: partProps.disabled,
    class: partProps.class ?? partProps.className,
    style: toCssStyleString(partProps.style) ?? partProps.attributes?.style,
    ...normalizeAriaAttributes(partProps.aria),
    ...normalizeDataAttributes(partProps.data),
  };
  for (const key of Object.keys(result)) if (result[key] === undefined) delete result[key];
  return result;
}

export function applySveltePartProps(
  node: HTMLElement,
  partProps: UIFnPartProps,
  options: { afterEvent?: () => void } = {},
): () => void {
  const attributes = toSvelteSpreadProps(partProps);
  const appliedAttributes = Object.keys(attributes).filter((name) => name !== 'style');
  const appliedStyles = applyStyle(node, partProps.style);
  const cleanups: Array<() => void> = [];
  Object.entries(attributes).forEach(([name, value]) => {
    if (name !== 'style') setAttribute(node, name, value);
  });
  Object.entries(partProps.on ?? {}).forEach(([name, handler]) => {
    if (!handler) return;
    const listener: DomEventHandler = (event) => {
      handler(toCoreEvent(name, event));
      options.afterEvent?.();
    };
    node.addEventListener(name, listener);
    cleanups.push(() => node.removeEventListener(name, listener));
  });
  assignRef(partProps.ref, node);
  return () => {
    cleanups.forEach((cleanup) => cleanup());
    appliedAttributes.forEach((name) => node.removeAttribute(name));
    appliedStyles.forEach((name) => node.style.removeProperty(name));
    assignRef(partProps.ref, null);
  };
}

export function createSveltePartAction(
  register: (node: HTMLElement | null) => void,
  afterCommit: () => void = () => undefined,
) {
  return (node: HTMLElement, initial: UIFnPartProps = {}) => {
    let currentRef: UIFnPartRef<unknown> | undefined;
    let appliedAttributes = new Set<string>();
    let appliedStyles = new Set<string>();
    let eventCleanups: Array<() => void> = [];

    const apply = (next: UIFnPartProps) => {
      const attributes = toSvelteSpreadProps(next);
      const nextAttributes = new Set(
        Object.keys(attributes).filter((name) => name !== 'style'),
      );
      for (const name of appliedAttributes) {
        if (!nextAttributes.has(name)) setAttribute(node, name, undefined);
      }
      for (const [name, value] of Object.entries(attributes)) {
        if (name !== 'style') setAttribute(node, name, value);
      }
      appliedAttributes = nextAttributes;

      const styleEntries = toCssStyleEntries(next.style);
      const nextStyles = new Set(styleEntries.map(([name]) => name));
      for (const name of appliedStyles) {
        if (!nextStyles.has(name)) node.style.removeProperty(name);
      }
      for (const [name, value] of styleEntries) {
        node.style.setProperty(name, value);
      }
      appliedStyles = nextStyles;

      eventCleanups.forEach((cleanup) => cleanup());
      eventCleanups = [];
      for (const [name, handler] of Object.entries(next.on ?? {})) {
        if (!handler) continue;
        const listener: DomEventHandler = (event) => {
          handler(toCoreEvent(name, event));
          afterCommit();
        };
        node.addEventListener(name, listener);
        eventCleanups.push(() => node.removeEventListener(name, listener));
      }

      if (currentRef !== next.ref) {
        assignRef(currentRef, null);
        currentRef = next.ref;
        assignRef(currentRef, node);
      }
    };

    register(node);
    apply(initial);
    afterCommit();
    return {
      update(next: UIFnPartProps = {}) {
        apply(next);
        afterCommit();
      },
      destroy() {
        eventCleanups.forEach((cleanup) => cleanup());
        appliedAttributes.forEach((name) => setAttribute(node, name, undefined));
        appliedStyles.forEach((name) => node.style.removeProperty(name));
        assignRef(currentRef, null);
        register(null);
      },
    };
  };
}
