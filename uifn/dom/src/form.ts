import { createUIFnError } from '@uifn/core/errors';
import type { UIFnDomScope } from './scope';

export interface UIFnFormBridgeOptions {
  readonly id: string;
  readonly owner: HTMLElement | (() => HTMLElement | null);
  readonly name: string;
  readonly value?: string | readonly string[] | null;
  readonly form?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly readOnly?: boolean;
  readonly validityMessage?: string;
  readonly onReset?: () => void;
}

export interface UIFnFormBridge {
  readonly id: string;
  readonly inputs: readonly HTMLInputElement[];
  update(options: Partial<Omit<UIFnFormBridgeOptions, 'id' | 'owner'>>): void;
  reportValidity(): boolean;
  destroy(): void;
}

export interface UIFnNativeFormResetBinding {
  destroy(): void;
}

/** Owns native form reset observation without creating a duplicate form control. */
export function createUIFnNativeFormResetBinding(
  scope: UIFnDomScope,
  owner: HTMLElement,
  onReset: () => void,
): UIFnNativeFormResetBinding {
  scope.assertAlive('bind native form reset');
  const form = owner instanceof HTMLFormElement ? owner : owner.closest('form');
  if (!form) return { destroy() {} };
  const listener = (event: Event) => {
    if (event.target === form) onReset();
  };
  form.addEventListener('reset', listener);
  const release = scope.track('listener', () => form.removeEventListener('reset', listener), 'native-form-reset');
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      release();
    },
  };
}

function resolveOwner(options: UIFnFormBridgeOptions): HTMLElement | null {
  return typeof options.owner === 'function' ? options.owner() : options.owner;
}

function values(value: UIFnFormBridgeOptions['value'], required: boolean): readonly string[] {
  if (Array.isArray(value)) return value.length > 0 ? value : required ? [''] : [];
  return value === undefined || value === null ? [''] : [value as string];
}

function escapeAttribute(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function visuallyHide(input: HTMLInputElement): void {
  Object.assign(input.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });
}

export function createUIFnFormBridge(
  scope: UIFnDomScope,
  initialOptions: UIFnFormBridgeOptions,
): UIFnFormBridge {
  scope.assertAlive('create form bridge');
  let options = initialOptions;
  let destroyed = false;
  let inputs: HTMLInputElement[] = [];
  let releaseReset: () => void = () => undefined;
  const duplicate = scope.query(`[data-uifn-form-bridge="${escapeAttribute(options.id)}"]`);
  if (duplicate) {
    throw createUIFnError({
      code: 'UIFN_FORM_BRIDGE_DUPLICATE',
      package: '@uifn/dom',
      component: 'FormBridge',
      message: `Form bridge ${options.id} already exists in this root.`,
      details: { bridgeId: options.id },
    });
  }
  const releaseResource = scope.track('formBridge', () => undefined, options.id);

  const removeInputs = () => {
    for (const input of inputs) input.remove();
    inputs = [];
  };

  const render = () => {
    const owner = resolveOwner(options);
    if (!owner || !owner.isConnected || !owner.parentNode) {
      throw createUIFnError({
        code: 'UIFN_DOM_SCOPE_INVALID',
        package: '@uifn/dom',
        component: 'FormBridge',
        message: 'A form bridge requires an owner element in the active root.',
      });
    }
    removeInputs();
    releaseReset();
    inputs = values(options.value, options.required ?? false).map((value, index) => {
      const input = scope.document.createElement('input');
      input.type = 'text';
      input.name = options.name;
      input.value = value;
      input.disabled = options.disabled ?? false;
      input.required = options.required ?? false;
      input.readOnly = options.readOnly ?? false;
      if (options.form) input.setAttribute('form', options.form);
      input.setAttribute('data-uifn-form-bridge', options.id);
      input.setAttribute('data-uifn-form-index', String(index));
      input.setAttribute('aria-hidden', 'true');
      input.tabIndex = -1;
      visuallyHide(input);
      input.setCustomValidity(options.validityMessage ?? '');
      return input;
    });
    const parent = owner.parentNode;
    let reference = owner.nextSibling;
    for (const input of inputs) {
      parent.insertBefore(input, reference);
      reference = input.nextSibling;
    }
    const form = options.form
      ? scope.document.getElementById(options.form) as HTMLFormElement | null
      : owner.closest('form');
    if (form && options.onReset) {
      const onReset = () => options.onReset?.();
      form.addEventListener('reset', onReset);
      releaseReset = scope.track('listener', () => form.removeEventListener('reset', onReset));
    } else {
      releaseReset = () => undefined;
    }
  };

  render();

  return {
    id: options.id,
    get inputs() {
      return Object.freeze([...inputs]);
    },
    update(next) {
      scope.assertAlive('update form bridge');
      if (destroyed) throw createUIFnError({
        code: 'UIFN_DOM_SERVICE_DESTROYED',
        package: '@uifn/dom',
        component: 'FormBridge',
        message: 'Cannot update a destroyed form bridge.',
      });
      options = { ...options, ...next };
      render();
    },
    reportValidity() {
      scope.assertAlive('report form bridge validity');
      if (destroyed) throw createUIFnError({
        code: 'UIFN_DOM_SERVICE_DESTROYED',
        package: '@uifn/dom',
        component: 'FormBridge',
        message: 'Cannot validate a destroyed form bridge.',
      });
      return inputs.every((input) => input.reportValidity());
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      releaseReset();
      removeInputs();
      releaseResource();
    },
  };
}
