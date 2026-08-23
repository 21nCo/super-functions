import * as React from 'react';
import {
  normalizeAriaAttributes,
  normalizeDataAttributes,
} from '@uifn/adapter-kit';
import type { UIFnPartEvent, UIFnPartProps } from '@uifn/core';

type AnyReactProps = Record<string, unknown>;
type ReactEventHandler = (event: React.SyntheticEvent<HTMLElement>) => void;

const HANDLER_NAMES: Record<string, string> = {
  click: 'onClick',
  change: 'onChange',
  compositionend: 'onCompositionEnd',
  compositionstart: 'onCompositionStart',
  compositionupdate: 'onCompositionUpdate',
  contextmenu: 'onContextMenu',
  input: 'onChange',
  keydown: 'onKeyDown',
  pointerdown: 'onPointerDown',
  pointermove: 'onPointerMove',
  pointerup: 'onPointerUp',
  pointerenter: 'onPointerEnter',
  pointerleave: 'onPointerLeave',
  mouseenter: 'onMouseEnter',
  mouseleave: 'onMouseLeave',
  paste: 'onPaste',
  scroll: 'onScroll',
  select: 'onSelect',
  focus: 'onFocus',
  blur: 'onBlur',
};

const ATTRIBUTE_NAMES: Record<string, string> = {
  autocomplete: 'autoComplete',
  inputmode: 'inputMode',
  maxlength: 'maxLength',
  minlength: 'minLength',
  readonly: 'readOnly',
  for: 'htmlFor',
  datetime: 'dateTime',
  novalidate: 'noValidate',
  tabindex: 'tabIndex',
  'stroke-dashoffset': 'strokeDashoffset',
};

function cleanStyle(style: UIFnPartProps['style']): React.CSSProperties | undefined {
  const entries = Object.entries(style ?? {}).filter(([, value]) => value !== null && value !== undefined);
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as React.CSSProperties;
}

function toCoreEvent(type: string, event: React.SyntheticEvent<HTMLElement>): UIFnPartEvent {
  const nativeEvent = event.nativeEvent as Event & {
    data?: unknown;
    inputType?: unknown;
    isComposing?: unknown;
    clipboardData?: { getData(type: string): string } | null;
  };
  const currentTarget = event.currentTarget as HTMLElement & {
    value?: unknown;
    selectionStart?: number | null;
    selectionEnd?: number | null;
  };
  const key = 'key' in event ? String((event as React.KeyboardEvent<HTMLElement>).key) : undefined;
  let clipboardData: string | undefined;
  if (type === 'paste' && nativeEvent.clipboardData) {
    try {
      clipboardData = nativeEvent.clipboardData.getData('text/plain');
    } catch {
      clipboardData = undefined;
    }
  }

  return {
    type,
    key,
    pointerType: 'pointerType' in event ? String((event as React.PointerEvent<HTMLElement>).pointerType) : undefined,
    button: 'button' in event ? Number((event as React.MouseEvent<HTMLElement>).button) : undefined,
    clientX: 'clientX' in event ? Number((event as React.MouseEvent<HTMLElement>).clientX) : undefined,
    clientY: 'clientY' in event ? Number((event as React.MouseEvent<HTMLElement>).clientY) : undefined,
    altKey: 'altKey' in event ? Boolean((event as React.KeyboardEvent<HTMLElement>).altKey) : undefined,
    ctrlKey: 'ctrlKey' in event ? Boolean((event as React.KeyboardEvent<HTMLElement>).ctrlKey) : undefined,
    metaKey: 'metaKey' in event ? Boolean((event as React.KeyboardEvent<HTMLElement>).metaKey) : undefined,
    shiftKey: 'shiftKey' in event ? Boolean((event as React.KeyboardEvent<HTMLElement>).shiftKey) : undefined,
    relatedTarget: 'relatedTarget' in event ? (event as React.FocusEvent<HTMLElement>).relatedTarget : undefined,
    currentTarget,
    isComposing: typeof nativeEvent.isComposing === 'boolean' ? nativeEvent.isComposing : undefined,
    data: clipboardData ?? (typeof nativeEvent.data === 'string' || nativeEvent.data === null ? nativeEvent.data : undefined),
    inputType: typeof nativeEvent.inputType === 'string' ? nativeEvent.inputType : undefined,
    value: typeof currentTarget.value === 'string' ? currentTarget.value : undefined,
    selectionStart: typeof currentTarget.selectionStart === 'number' || currentTarget.selectionStart === null
      ? currentTarget.selectionStart
      : undefined,
    selectionEnd: typeof currentTarget.selectionEnd === 'number' || currentTarget.selectionEnd === null
      ? currentTarget.selectionEnd
      : undefined,
    defaultPrevented: event.defaultPrevented,
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation(),
  };
}

function composeUserThenCore(
  userHandler: unknown,
  coreHandler: ReactEventHandler
): ReactEventHandler {
  return (event) => {
    if (typeof userHandler === 'function') {
      (userHandler as ReactEventHandler)(event);
    }

    if (!event.defaultPrevented) {
      coreHandler(event);
    }
  };
}

export function toReactPartProps<TProps extends object>(
  partProps: UIFnPartProps,
  userProps: TProps = {} as TProps
): TProps {
  const user = userProps as AnyReactProps;
  const generated: AnyReactProps = {
    ...Object.fromEntries(Object.entries(partProps.attributes ?? {}).map(([name, value]) => [ATTRIBUTE_NAMES[name] ?? name, value])),
    role: partProps.role,
    id: partProps.id,
    tabIndex: partProps.tabIndex,
    hidden: partProps.hidden,
    disabled: partProps.disabled,
    ...normalizeAriaAttributes(partProps.aria),
    ...normalizeDataAttributes(partProps.data),
  };
  const generatedClassName = partProps.className ?? partProps.class;
  if (generatedClassName) generated.className = generatedClassName;
  const generatedStyle = cleanStyle(partProps.style);

  Object.entries(partProps.on ?? {}).forEach(([eventName, handler]) => {
    if (!handler) {
      return;
    }

    const reactHandlerName = HANDLER_NAMES[eventName] ?? `on${eventName[0]?.toUpperCase() ?? ''}${eventName.slice(1)}`;
    generated[reactHandlerName] = (event: React.SyntheticEvent<HTMLElement>) => {
      // React intentionally bubbles focus and blur through its synthetic event
      // system, while the native events consumed by the other adapters do not.
      // Core part handlers describe ownership of the current part, so a nested
      // composite must not let a child's focus reset its ancestor's state.
      if ((eventName === 'focus' || eventName === 'blur') && event.currentTarget !== event.target) {
        return;
      }
      handler(toCoreEvent(eventName, event));
    };
  });

  // Core owns these form values. React otherwise reports a controlled-field
  // warning for hidden checkbox/radio bridges that intentionally have no
  // userland change handler. A no-op handler satisfies React without leaking a
  // framework-only readonly attribute into the semantic DOM contract.
  if (generated.checked !== undefined && generated.onChange === undefined && user.onChange === undefined) {
    generated.onChange = () => undefined;
  }

  const merged: AnyReactProps = {
    ...user,
    ...generated,
    style: {
      ...(generatedStyle ?? {}),
      ...((user.style as React.CSSProperties | undefined) ?? {}),
    },
  };

  // `htmlFor` is React's DOM alias for the core `for` attribute. It does not
  // enter `mergePartProps` under the same key, so preserve an explicit label
  // target here just as the Svelte and Solid adapters preserve `for`.
  if (user.htmlFor !== undefined) {
    merged.htmlFor = user.htmlFor;
  }

  if (partProps.ref || user.ref) {
    const refs = [user.ref, partProps.ref].filter(Boolean) as React.Ref<HTMLElement>[];
    merged.ref = refs.length === 1 ? refs[0] : (node: HTMLElement | null) => {
      for (const ref of refs) {
        if (typeof ref === 'function') ref(node);
        else if (ref && typeof ref === 'object') (ref as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    };
  }

  if (!generatedStyle && !user.style) {
    delete merged.style;
  }

  if (user.className && generated.className) {
    merged.className = Array.from(new Set(`${user.className} ${generated.className}`.split(/\s+/).filter(Boolean))).join(' ');
  }

  Object.keys(generated).forEach((key) => {
    if (!/^on[A-Z]/.test(key)) {
      return;
    }

    merged[key] = composeUserThenCore(user[key], generated[key] as ReactEventHandler);
  });

  return merged as TProps;
}
