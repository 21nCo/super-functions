import { createUIFnController, type UIFnController } from '../controller';
import { createUIFnError, isUIFnError } from '../errors';
import { createUIFnEnvironment, createUIFnIdAllocator, type UIFnEnvironment } from '../environment';
import { createStateChannel } from '../internal/runtime/state-channel';
import { mergePartProps, type UIFnPartProps } from '../parts';

export interface UIFnClipboardCapability {
  writeText(value: string): Promise<void>;
  readText?(): Promise<string>;
}
export interface ClipboardProps {
  readonly capability?: UIFnClipboardCapability;
  readonly getValue?: () => string;
  readonly disabled?: boolean;
  readonly successMessage?: string;
  readonly onStatusChange?: (status: ClipboardState['status']) => void;
}
export interface ClipboardState {
  readonly status: 'idle' | 'copying' | 'copied' | 'reading' | 'error';
  readonly disabled: boolean;
  readonly operationCount: number;
  readonly lastErrorCode: string | null;
  readonly ids: Readonly<Record<'root' | 'trigger' | 'status', string>>;
}
export interface ClipboardActions {
  copy(value?: string): Promise<void>;
  read(): Promise<string>;
  reset(): void;
}
export interface ClipboardParts { root: ClipboardPart; trigger: ClipboardPart; status: ClipboardPart }
export interface ClipboardPart { readonly name: string; getProps(userProps?: UIFnPartProps): UIFnPartProps }
export type ClipboardController = UIFnController<ClipboardState, ClipboardActions, ClipboardParts, ClipboardProps>;

export function createClipboardController(props: ClipboardProps = {}, env: UIFnEnvironment = {}): ClipboardController {
  const resolved = createUIFnEnvironment(env);
  const allocator = createUIFnIdAllocator(resolved, 'Clipboard');
  const token = resolved.generateId('clipboard');
  const ids = Object.freeze(Object.fromEntries(['root', 'trigger', 'status'].map((part) => [part, allocator.fromToken(`clipboard-${part}`, token, part)])) as Record<'root' | 'trigger' | 'status', string>);
  const store = createStateChannel<ClipboardState>({ status: 'idle', disabled: props.disabled ?? false, operationCount: 0, lastErrorCode: null, ids });
  let active = true;
  const patch = (partial: Partial<ClipboardState>) => store.patchState(partial);
  const capability = () => {
    if (!props.capability) throw createUIFnError({ code: 'UIFN_INPUT_CAPABILITY_UNAVAILABLE', component: 'Clipboard' });
    return props.capability;
  };
  const fail = (error: unknown): never => {
    const stable = isUIFnError(error) ? error : createUIFnError({ code: 'UIFN_CLIPBOARD_DENIED', component: 'Clipboard', cause: error, recoverable: true });
    if (active) patch({ status: 'error', lastErrorCode: stable.code });
    props.onStatusChange?.('error');
    throw stable;
  };
  const actions: ClipboardActions = {
    async copy(value) {
      if (store.getState().disabled) return;
      patch({ status: 'copying', lastErrorCode: null });
      props.onStatusChange?.('copying');
      try {
        await capability().writeText(value ?? props.getValue?.() ?? '');
        if (!active) return;
        patch({ status: 'copied', operationCount: store.getState().operationCount + 1 });
        props.onStatusChange?.('copied');
      } catch (error) { fail(error); }
    },
    async read() {
      if (store.getState().disabled) return '';
      patch({ status: 'reading', lastErrorCode: null });
      props.onStatusChange?.('reading');
      try {
        const read = capability().readText;
        if (!read) throw createUIFnError({ code: 'UIFN_INPUT_CAPABILITY_UNAVAILABLE', component: 'Clipboard' });
        const value = await read();
        if (active) {
          patch({ status: 'idle', operationCount: store.getState().operationCount + 1 });
          props.onStatusChange?.('idle');
        }
        return value;
      } catch (error) { return fail(error); }
    },
    reset() { patch({ status: 'idle', lastErrorCode: null }); },
  };
  const parts: ClipboardParts = {
    root: { name: 'root', getProps(userProps) { return mergePartProps({ id: ids.root, data: { state: store.getState().status } }, userProps, { component: 'Clipboard', part: 'root', required: { id: true } }); } },
    trigger: { name: 'trigger', getProps(userProps) { const state = store.getState(); return mergePartProps({ id: ids.trigger, role: 'button', disabled: state.disabled, attributes: { type: 'button' }, aria: { controls: ids.status, disabled: state.disabled }, on: { click: () => { void actions.copy().catch(() => undefined); } } }, userProps, { component: 'Clipboard', part: 'trigger', required: { id: true, role: true } }); } },
    status: { name: 'status', getProps(userProps) { const state = store.getState(); return mergePartProps({ id: ids.status, role: 'status', aria: { live: 'polite', atomic: true }, data: { state: state.status, message: state.status === 'copied' ? props.successMessage ?? 'Copied' : undefined } }, userProps, { component: 'Clipboard', part: 'status', required: { id: true, role: true, aria: ['live'] } }); } },
  };
  return createUIFnController({ actions, parts, getState: store.getState, subscribe: store.subscribe, update(next) { if (next.disabled !== undefined) patch({ disabled: next.disabled }); }, destroy() { active = false; store.destroy(); } });
}
