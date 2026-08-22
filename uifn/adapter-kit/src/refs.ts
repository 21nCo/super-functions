import { createUIFnError } from '@uifn/core/errors';

export type AdapterRef<TElement> =
  | ((element: TElement | null) => void)
  | { current: TElement | null }
  | null
  | undefined;

export interface ElementRegistry<TElement> {
  register: (key: string, element: TElement | null) => () => void;
  unregister: (key: string) => void;
  get: (key: string) => TElement | null;
  require: (key: string) => TElement;
  has: (key: string) => boolean;
  clear: () => void;
  entries: () => Array<[string, TElement]>;
  snapshot: () => Record<string, TElement>;
  size: () => number;
}

export function assignRef<TElement>(ref: AdapterRef<TElement>, element: TElement | null): void {
  if (!ref) {
    return;
  }

  if (typeof ref === 'function') {
    ref(element);
    return;
  }

  ref.current = element;
}

export function composeRefs<TElement>(
  ...refs: Array<AdapterRef<TElement>>
): (element: TElement | null) => void {
  return (element) => {
    refs.forEach((ref) => assignRef(ref, element));
  };
}

export function createElementRegistry<TElement>(
  options: { component?: string } = {}
): ElementRegistry<TElement> {
  const elements = new Map<string, TElement>();
  const registrations = new Map<string, symbol>();

  return {
    register(key, element) {
      if (element === null) {
        elements.delete(key);
        registrations.delete(key);
      } else {
        elements.set(key, element);
        const registration = Symbol(key);
        registrations.set(key, registration);
        return () => {
          if (registrations.get(key) === registration) {
            registrations.delete(key);
            elements.delete(key);
          }
        };
      }
      return () => undefined;
    },
    unregister(key) {
      elements.delete(key);
      registrations.delete(key);
    },
    get(key) {
      return elements.get(key) ?? null;
    },
    require(key) {
      const element = elements.get(key);

      if (!elements.has(key)) {
        throw createUIFnError({
          code: 'UIFN_ERR_CONTEXT_MISSING',
          package: '@uifn/adapter-kit',
          component: options.component ?? 'ElementRegistry',
          message: 'Adapter element registry is missing a required element.',
          details: {
            key,
          },
        });
      }

      return element as TElement;
    },
    has(key) {
      return elements.has(key);
    },
    clear() {
      elements.clear();
      registrations.clear();
    },
    entries() {
      return Array.from(elements.entries());
    },
    snapshot() {
      return Object.fromEntries(elements.entries());
    },
    size() {
      return elements.size;
    },
  };
}
