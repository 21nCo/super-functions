import { createUIFnError, isUIFnError } from '@uifn/core/errors';
import type {
  ClipboardController,
  FileUploadController,
  UIFnClipboardCapability,
  UIFnFileDescriptor,
  UIFnFilePickerCapability,
  UIFnSelectionController,
  UIFnTextInputController,
} from '@uifn/core/primitives';
import { createUIFnFormBridge, type UIFnFormBridge } from './form';
import type { UIFnDomPlatform } from './platform';

export interface UIFnInputDomBinding {
  readonly formBridge: UIFnFormBridge | null;
  destroy(): void;
}

function disabledByFieldset(owner: HTMLElement): boolean {
  const fieldset = owner.closest('fieldset') as HTMLFieldSetElement | null;
  if (!fieldset || !fieldset.disabled) return false;
  const firstLegend = Array.from(fieldset.children).find((child) => child.tagName === 'LEGEND');
  return !firstLegend?.contains(owner);
}

function observeFieldset(
  platform: UIFnDomPlatform,
  owner: HTMLElement,
  update: (disabled: boolean) => void,
): () => void {
  const fieldset = owner.closest('fieldset');
  update(disabledByFieldset(owner));
  if (!fieldset) return () => undefined;
  return platform.scope.observeMutation(fieldset, () => update(disabledByFieldset(owner)), { attributes: true, attributeFilter: ['disabled'], subtree: false });
}

export function createUIFnSelectionFormBinding(
  platform: UIFnDomPlatform,
  controller: UIFnSelectionController<any>,
  owner: HTMLElement,
): UIFnInputDomBinding {
  const scope = platform.scope;
  scope.assertAlive('bind selection form');
  let destroyed = false;
  let fieldsetDisabled = disabledByFieldset(owner);
  let lastAnnouncement: string | null = null;
  const state = controller.state;
  const bridge = state.name ? createUIFnFormBridge(scope, {
    id: `${state.ids.root ?? owner.id ?? 'selection'}-form`,
    owner,
    name: state.name,
    value: state.formValues,
    form: state.form,
    disabled: state.disabled || fieldsetDisabled,
    required: state.required,
    readOnly: state.readOnly,
    validityMessage: state.validityMessage,
    onReset: () => controller.actions.reset(),
  }) : null;
  const update = () => {
    if (destroyed) return;
    const current = controller.state;
    bridge?.update({
      name: current.name ?? '',
      value: current.formValues,
      form: current.form,
      disabled: current.disabled || fieldsetDisabled,
      required: current.required,
      readOnly: current.readOnly,
      validityMessage: current.validityMessage,
    });
    if (current.announcement && current.announcement !== lastAnnouncement) {
      lastAnnouncement = current.announcement;
      platform.liveRegion.announce({
        id: `${current.ids.root ?? owner.id ?? 'selection'}-announcement-${controller.snapshot.version}`,
        message: current.announcement,
        politeness: current.invalid ? 'assertive' : 'polite',
      });
    }
  };
  const unsubscribe = controller.subscribe(update, { emitInitial: false });
  const releaseFieldset = observeFieldset(platform, owner, (disabled) => {
    fieldsetDisabled = disabled;
    controller.actions.setFieldsetDisabled(disabled);
    update();
  });
  const releaseResource = scope.track('formBridge', () => undefined, `${state.ids.root ?? owner.id}-selection-binding`);
  return {
    formBridge: bridge,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      releaseFieldset();
      bridge?.destroy();
      releaseResource();
    },
  };
}

export function createUIFnTextInputFormBinding(
  platform: UIFnDomPlatform,
  controller: UIFnTextInputController<any>,
  owner: HTMLElement,
  input: HTMLInputElement,
  options: { readonly nativeFormControl?: boolean } = {},
): UIFnInputDomBinding {
  const scope = platform.scope;
  scope.assertAlive('bind text input form');
  let destroyed = false;
  let fieldsetDisabled = disabledByFieldset(owner);
  let releaseCaret: () => void = () => undefined;
  const state = controller.state;
  const bridge = !options.nativeFormControl && state.name ? createUIFnFormBridge(scope, {
    id: `${state.ids.root ?? owner.id ?? 'input'}-form`,
    owner,
    name: state.name,
    value: controller.actions.getInputValue(),
    form: state.form,
    disabled: state.disabled || fieldsetDisabled,
    required: state.required,
    readOnly: state.readOnly,
    validityMessage: state.validityMessage,
    onReset: () => controller.actions.reset(),
  }) : null;
  const update = () => {
    if (destroyed) return;
    const current = controller.state;
    bridge?.update({
      name: current.name ?? '',
      value: controller.actions.getInputValue(),
      form: current.form,
      disabled: current.disabled || fieldsetDisabled,
      required: current.required,
      readOnly: current.readOnly,
      validityMessage: current.validityMessage,
    });
    if (options.nativeFormControl) {
      input.disabled = current.disabled || fieldsetDisabled;
      input.readOnly = current.readOnly;
      input.required = current.required;
      input.setCustomValidity(current.validityMessage);
    }
    releaseCaret();
    if (!current.composing && input === scope.getActiveElement()) {
      releaseCaret = scope.requestAnimationFrame(() => {
        const valueLength = input.value.length;
        const start = Math.min(current.caret.start ?? valueLength, valueLength);
        const end = Math.min(current.caret.end ?? start, valueLength);
        try { input.setSelectionRange(start, end, current.caret.direction ?? 'none'); } catch { /* non-text input */ }
      });
    }
  };
  const unsubscribe = controller.subscribe(update, { emitInitial: false });
  const releaseFieldset = observeFieldset(platform, owner, (disabled) => {
    fieldsetDisabled = disabled;
    controller.actions.setFieldsetDisabled(disabled);
    update();
  });
  const form = input.form ?? owner.closest('form');
  const releaseNativeReset = options.nativeFormControl && form
    ? scope.on('reset', (event) => { if (event.target === form) controller.actions.reset(); })
    : () => undefined;
  const releaseResource = scope.track('formBridge', () => undefined, `${state.ids.root ?? owner.id}-input-binding`);
  return {
    formBridge: bridge,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      releaseCaret();
      releaseNativeReset();
      releaseFieldset();
      bridge?.destroy();
      releaseResource();
    },
  };
}

export function createUIFnClipboardCapability(platform: UIFnDomPlatform): UIFnClipboardCapability {
  const clipboard = platform.scope.window.navigator.clipboard;
  return Object.freeze({
    async writeText(value: string) {
      if (!clipboard?.writeText) throw createUIFnError({ code: 'UIFN_INPUT_CAPABILITY_UNAVAILABLE', package: '@uifn/dom', component: 'Clipboard' });
      try { await clipboard.writeText(value); }
      catch (cause) { throw createUIFnError({ code: 'UIFN_CLIPBOARD_DENIED', package: '@uifn/dom', component: 'Clipboard', cause, recoverable: true }); }
    },
    async readText() {
      if (!clipboard?.readText) throw createUIFnError({ code: 'UIFN_INPUT_CAPABILITY_UNAVAILABLE', package: '@uifn/dom', component: 'Clipboard' });
      try { return await clipboard.readText(); }
      catch (cause) { throw createUIFnError({ code: 'UIFN_CLIPBOARD_DENIED', package: '@uifn/dom', component: 'Clipboard', cause, recoverable: true }); }
    },
  });
}

export function createUIFnNativeFilePickerCapability(
  platform: UIFnDomPlatform,
  input: HTMLInputElement,
): UIFnFilePickerCapability {
  return Object.freeze({
    pick(options: { readonly accept?: string; readonly multiple: boolean }) {
      platform.scope.assertAlive('open native file picker');
      input.accept = options.accept ?? '';
      input.multiple = options.multiple;
      return new Promise<readonly UIFnFileDescriptor[]>((resolve, reject) => {
        let releaseResource: () => void = () => undefined;
        const onChange = () => {
          cleanup();
          resolve(Object.freeze(Array.from(input.files ?? []).map((file) => Object.freeze({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
            native: file,
          }))));
        };
        const onCancel = () => { cleanup(); reject(createUIFnError({ code: 'UIFN_FILE_REJECTED', package: '@uifn/dom', component: 'FileUpload', message: 'The native file picker was cancelled.', recoverable: true })); };
        const cleanup = () => {
          input.removeEventListener('change', onChange);
          input.removeEventListener('cancel', onCancel);
          releaseResource();
        };
        input.addEventListener('change', onChange, { once: true });
        input.addEventListener('cancel', onCancel, { once: true });
        releaseResource = platform.scope.track('listener', cleanup, 'native-file-picker');
        try { input.click(); }
        catch (cause) { cleanup(); reject(isUIFnError(cause) ? cause : createUIFnError({ code: 'UIFN_INPUT_CAPABILITY_UNAVAILABLE', package: '@uifn/dom', component: 'FileUpload', cause })); }
      });
    },
  });
}

export function createUIFnFileInputBinding(
  platform: UIFnDomPlatform,
  controller: FileUploadController,
  owner: HTMLElement,
  input: HTMLInputElement,
): UIFnInputDomBinding {
  const scope = platform.scope;
  let destroyed = false;
  const onChange = () => {
    if (controller.state.status === 'picking') return;
    controller.actions.selectFiles(Array.from(input.files ?? []).map((file) => Object.freeze({ name: file.name, size: file.size, type: file.type, lastModified: file.lastModified, native: file })));
  };
  input.addEventListener('change', onChange);
  const releaseListener = scope.track('listener', () => input.removeEventListener('change', onChange));
  const releaseFieldset = observeFieldset(platform, owner, (disabled) => {
    controller.actions.setFieldsetDisabled(disabled);
    input.disabled = controller.state.disabled || disabled;
  });
  const form = input.form ?? owner.closest('form');
  const releaseReset = form ? scope.on('reset', (event) => { if (event.target === form) controller.actions.reset(); }) : () => undefined;
  const releaseResource = scope.track('formBridge', () => undefined, `${controller.state.ids.root ?? owner.id}-file-binding`);
  return {
    formBridge: null,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      releaseReset();
      releaseFieldset();
      releaseListener();
      releaseResource();
    },
  };
}

export function assertUIFnInputResourcesReleased(platform: UIFnDomPlatform): void {
  const resources = platform.scope.resources();
  if (
    resources.formBridge !== 0
    || resources.listener !== 0
    || resources.observer !== 0
    || resources.timer !== 0
    || resources.animationFrame !== 0
    || resources.liveRegion !== 0
  ) {
    throw createUIFnError({ code: 'UIFN_INPUT_RESOURCE_LEAK', package: '@uifn/dom', component: 'Input', details: { resources } });
  }
}

export type { ClipboardController };
