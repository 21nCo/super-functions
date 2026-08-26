import { createUIFnController, type UIFnController } from '../controller';
import { createUIFnEnvironment, createUIFnIdAllocator, normalizeUIFnIdToken, type UIFnEnvironment } from '../environment';
import { createStateChannel, type StateChannel } from '../internal/runtime/state-channel';
import { mergePartProps, type UIFnPartProps, type UIFnRequiredPartProps } from '../parts';

export interface UIFnPhase10Part { readonly name: string; getProps(userProps?: UIFnPartProps): UIFnPartProps }
export interface UIFnPhase10ValuePart<T = string> { readonly name: string; getProps(value: T, userProps?: UIFnPartProps): UIFnPartProps }

export function createUIFnPhase10Ids(component: string, slug: string, env: UIFnEnvironment = {}) {
  const resolved = createUIFnEnvironment(env);
  const allocator = createUIFnIdAllocator(resolved, component);
  const token = resolved.generateId(slug);
  const ids = new Map<string, string>();
  const id = (part: string, value?: string | number) => {
    const key = `${part}${value === undefined ? '' : `:${value}`}`;
    const existing = ids.get(key);
    if (existing) return existing;
    const allocated = allocator.fromToken(
      `${slug}-${part}`,
      `${token}-${normalizeUIFnIdToken(part)}${value === undefined ? '' : `-${normalizeUIFnIdToken(String(value))}`}`,
      key,
    );
    ids.set(key, allocated);
    return allocated;
  };
  return { resolved, id };
}

export function createUIFnPhase10Part(
  component: string,
  name: string,
  generated: () => UIFnPartProps,
  required?: UIFnRequiredPartProps,
): UIFnPhase10Part {
  return { name, getProps(userProps) { return mergePartProps(generated(), userProps, { component, part: name, required }); } };
}

export function createUIFnPhase10ValuePart<T>(
  component: string,
  name: string,
  generated: (value: T) => UIFnPartProps,
  required?: UIFnRequiredPartProps,
): UIFnPhase10ValuePart<T> {
  return { name, getProps(value, userProps) { return mergePartProps(generated(value), userProps, { component, part: name, required }); } };
}

export function createUIFnPhase10Controller<
  TState,
  TActions extends object,
  TParts extends object,
  TInputs extends object,
>(options: {
  readonly store: StateChannel<TState, unknown>;
  readonly actions: TActions;
  readonly parts: TParts;
  readonly env?: UIFnEnvironment;
  readonly update?: (inputs: Partial<TInputs>) => void;
  readonly destroy?: () => void;
}): UIFnController<TState, TActions, TParts, TInputs> {
  const resolved = createUIFnEnvironment(options.env ?? {});
  return createUIFnController({
    actions: options.actions,
    parts: options.parts,
    getState: options.store.getState,
    subscribe: options.store.subscribe,
    update: options.update ?? (() => undefined),
    now: resolved.now,
    destroy() { options.destroy?.(); options.store.destroy(); },
  });
}

export function normalizeUIFnLocale(options: { readonly locale?: string }, env: UIFnEnvironment): string {
  return options.locale ?? createUIFnEnvironment(env).getLocale();
}

export function formatUIFnLocalizedNumber(value: number, locale: string, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale, options).format(value);
}
