import React from 'react';
import { createUIFnError } from '@uifn/core/errors';

type AnyProps = Record<string, unknown>;

export interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

export function composeReactRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<T | null>).current = node;
      }
    });
  };
}

function mergeProps(slotProps: AnyProps, childProps: AnyProps): AnyProps {
  const merged: AnyProps = { ...childProps };

  Object.keys(slotProps).forEach((propName) => {
    const slotValue = slotProps[propName];
    const childValue = childProps[propName];
    const isHandler = /^on[A-Z]/.test(propName);

    if (isHandler && typeof slotValue === 'function' && typeof childValue === 'function') {
      merged[propName] = (...args: unknown[]) => {
        (childValue as (...params: unknown[]) => void)(...args);
        const event = args[0] as { defaultPrevented?: boolean } | undefined;
        if (!event?.defaultPrevented) {
          (slotValue as (...params: unknown[]) => void)(...args);
        }
      };
      return;
    }

    if (propName === 'style' && typeof slotValue === 'object' && slotValue) {
      merged[propName] = {
        ...(childValue as object),
        ...(slotValue as object),
      };
      return;
    }

    if (propName === 'className') {
      merged[propName] = [childValue, slotValue].filter(Boolean).join(' ');
      return;
    }

    merged[propName] = slotValue;
  });

  return merged;
}

function intrinsicRole(type: string, props: AnyProps): string | null {
  if (type === 'a' && typeof props.href === 'string') return 'link';
  if (type === 'button') return 'button';
  if (type === 'select') return props.multiple ? 'listbox' : 'combobox';
  if (type === 'textarea') return 'textbox';
  if (type === 'input') {
    const inputType = String(props.type ?? 'text');
    if (inputType === 'checkbox') return 'checkbox';
    if (inputType === 'radio') return 'radio';
    if (inputType === 'range') return 'slider';
    if (inputType === 'number') return 'spinbutton';
    if (!['hidden', 'button', 'submit', 'reset', 'image', 'file', 'color', 'date', 'time'].includes(inputType)) return 'textbox';
  }
  return null;
}

function supportsNativeDisabled(type: string): boolean {
  return ['button', 'fieldset', 'input', 'optgroup', 'option', 'select', 'textarea'].includes(type);
}

function preserveIntrinsicSemantics(child: React.ReactElement<AnyProps>, props: AnyProps): AnyProps {
  if (typeof child.type !== 'string') return props;
  const merged = { ...props };
  if (child.props.role === undefined && intrinsicRole(child.type, child.props)) delete merged.role;
  if (merged.disabled === true && !supportsNativeDisabled(child.type)) {
    delete merged.disabled;
    merged['aria-disabled'] = true;
    merged.tabIndex = -1;
    const block = (event: { preventDefault(): void; stopPropagation(): void }) => {
      event.preventDefault();
      event.stopPropagation();
    };
    merged.onClick = block;
    merged.onKeyDown = (event: { key?: string; preventDefault(): void; stopPropagation(): void }) => {
      if (event.key === 'Enter' || event.key === ' ') block(event);
    };
  }
  return merged;
}

export const Slot = React.forwardRef<HTMLElement, SlotProps>((props, forwardedRef) => {
  const { children, ...slotProps } = props;

  if (!React.isValidElement(children)) {
    return React.Children.count(children) > 1 ? React.Children.only(children) : null;
  }

  const child = children as React.ReactElement<AnyProps>;
  const childType = child.type as unknown as {
    readonly $$typeof?: symbol;
    readonly prototype?: { readonly isReactComponent?: unknown };
  };
  const canReceiveRef = typeof child.type !== 'function'
    || childType.$$typeof === Symbol.for('react.forward_ref')
    || Boolean(childType.prototype?.isReactComponent);
  if (forwardedRef && !canReceiveRef) {
    throw createUIFnError({
      code: 'UIFN_PART_REF_LOST',
      package: '@uifn/react',
      component: 'Slot',
      message: 'asChild and render targets MUST forward the primitive part ref.',
      details: { childType: typeof child.type === 'function' ? child.type.name || 'anonymous' : String(child.type) },
    });
  }
  const childRef = (child.props as AnyProps & { ref?: React.Ref<HTMLElement> }).ref
    ?? (child as unknown as { ref?: React.Ref<HTMLElement> }).ref;

  const merged = preserveIntrinsicSemantics(
    child,
    mergeProps(slotProps as AnyProps, child.props as AnyProps),
  );
  return React.cloneElement(child, {
    ...merged,
    ref: composeReactRefs(forwardedRef, childRef),
  });
});

Slot.displayName = 'Slot';

export const Slottable = ({ children }: { children: React.ReactNode }) => <>{children}</>;
