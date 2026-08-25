import { createUIFnController, type UIFnController } from '../controller';
import { createUIFnError, isUIFnError } from '../errors';
import { createUIFnEnvironment, createUIFnIdAllocator, normalizeUIFnIdToken, type UIFnEnvironment } from '../environment';
import { createStateChannel } from '../internal/runtime/state-channel';
import { mergePartProps, type UIFnPartProps } from '../parts';

export interface UIFnFileDescriptor { readonly name: string; readonly size: number; readonly type: string; readonly lastModified?: number; readonly native?: unknown }
export interface UIFnFilePickerCapability { pick(options: { readonly accept?: string; readonly multiple: boolean }): Promise<readonly UIFnFileDescriptor[]> }
export interface FileUploadProps {
  readonly capability?: UIFnFilePickerCapability;
  readonly accept?: string;
  readonly multiple?: boolean;
  readonly maxFiles?: number;
  readonly maxSize?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly name?: string;
  readonly onFilesChange?: (files: readonly UIFnFileDescriptor[]) => void;
  readonly onReject?: (code: 'type' | 'size' | 'count') => void;
}
export interface FileUploadState {
  readonly status: 'idle' | 'picking' | 'accepted' | 'rejected' | 'error';
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly rejectedCount: number;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly multiple: boolean;
  readonly accept?: string;
  readonly valid: boolean;
  readonly invalid: boolean;
  readonly lastErrorCode: string | null;
  readonly ids: Readonly<Record<string, string>>;
}
export interface FileUploadActions {
  openPicker(): Promise<void>;
  selectFiles(files: readonly UIFnFileDescriptor[]): void;
  remove(index: number): void;
  clear(): void;
  reset(): void;
  getFiles(): readonly UIFnFileDescriptor[];
  setFieldsetDisabled(disabled: boolean): void;
}
export interface FileUploadPart { readonly name: string; getProps(indexOrProps?: number | UIFnPartProps, userProps?: UIFnPartProps): UIFnPartProps }
export interface FileUploadParts { root: FileUploadPart; label: FileUploadPart; dropzone: FileUploadPart; trigger: FileUploadPart; input: FileUploadPart; itemGroup: FileUploadPart; item: FileUploadPart; itemName: FileUploadPart; itemSize: FileUploadPart; itemDelete: FileUploadPart; error: FileUploadPart; status: FileUploadPart }
export type FileUploadController = UIFnController<FileUploadState, FileUploadActions, FileUploadParts, FileUploadProps>;

function accepted(file: UIFnFileDescriptor, accept?: string): boolean {
  if (!accept) return true;
  return accept.split(',').map((value) => value.trim().toLowerCase()).some((rule) => {
    if (rule.startsWith('.')) return file.name.toLowerCase().endsWith(rule);
    if (rule.endsWith('/*')) return file.type.toLowerCase().startsWith(rule.slice(0, -1));
    return file.type.toLowerCase() === rule;
  });
}

export function createFileUploadController(props: FileUploadProps = {}, env: UIFnEnvironment = {}): FileUploadController {
  const anatomy = ['root', 'label', 'dropzone', 'trigger', 'input', 'itemGroup', 'item', 'itemName', 'itemSize', 'itemDelete', 'error', 'status'] as const;
  const resolved = createUIFnEnvironment(env);
  const allocator = createUIFnIdAllocator(resolved, 'FileUpload');
  const token = resolved.generateId('file-upload');
  const ids = Object.freeze(Object.fromEntries(anatomy.map((part) => [part, allocator.fromToken(`file-upload-${part}`, token, part)])));
  let files: readonly UIFnFileDescriptor[] = Object.freeze([]);
  let active = true;
  const stateFor = (base: Omit<FileUploadState, 'fileCount' | 'totalBytes' | 'valid' | 'invalid'>): FileUploadState => {
    const valid = !base.required || files.length > 0;
    return Object.freeze({ ...base, fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0), valid, invalid: !valid });
  };
  const store = createStateChannel<FileUploadState>(stateFor({ status: 'idle', rejectedCount: 0, required: props.required ?? false, disabled: props.disabled ?? false, multiple: props.multiple ?? false, accept: props.accept, lastErrorCode: null, ids }));
  const patch = (partial: Partial<FileUploadState>) => store.setState(stateFor({ ...store.getState(), ...partial }));
  const rejection = (code: 'type' | 'size' | 'count') => {
    patch({ status: 'rejected', rejectedCount: store.getState().rejectedCount + 1, lastErrorCode: 'UIFN_FILE_REJECTED' });
    props.onReject?.(code);
  };
  const actions: FileUploadActions = {
    async openPicker() {
      if (store.getState().disabled) return;
      if (!props.capability) throw createUIFnError({ code: 'UIFN_INPUT_CAPABILITY_UNAVAILABLE', component: 'FileUpload' });
      patch({ status: 'picking', lastErrorCode: null });
      try {
        const selected = await props.capability.pick({ accept: props.accept, multiple: props.multiple ?? false });
        if (active) this.selectFiles(selected);
      } catch (error) {
        const stable = isUIFnError(error) ? error : createUIFnError({ code: 'UIFN_FILE_REJECTED', component: 'FileUpload', cause: error, recoverable: true });
        if (active) patch({ status: 'error', lastErrorCode: stable.code });
        throw stable;
      }
    },
    selectFiles(nextFiles) {
      if (store.getState().disabled) return;
      const maxFiles = props.multiple ? props.maxFiles ?? Number.POSITIVE_INFINITY : 1;
      if (nextFiles.length > maxFiles) return rejection('count');
      if (nextFiles.some((file) => !accepted(file, props.accept))) return rejection('type');
      if (nextFiles.some((file) => file.size > (props.maxSize ?? Number.POSITIVE_INFINITY))) return rejection('size');
      files = Object.freeze([...nextFiles]);
      patch({ status: 'accepted', lastErrorCode: null });
      props.onFilesChange?.(files);
    },
    remove(index) {
      if (store.getState().disabled || index < 0 || index >= files.length) return;
      files = Object.freeze(files.filter((_, candidate) => candidate !== index));
      patch({ status: files.length ? 'accepted' : 'idle' });
      props.onFilesChange?.(files);
    },
    clear() {
      if (store.getState().disabled) return;
      files = Object.freeze([]);
      patch({ status: 'idle', lastErrorCode: null });
      props.onFilesChange?.(files);
    },
    reset() { this.clear(); },
    getFiles() { return files; },
    setFieldsetDisabled(disabled) { patch({ disabled }); },
  };
  const generated = (part: string, index: number | null): UIFnPartProps => {
    const state = store.getState();
    const id = index === null ? state.ids[part] : `${state.ids[part]}-${normalizeUIFnIdToken(String(index))}`;
    const common: UIFnPartProps = { id, data: { state: state.status, disabled: state.disabled, index: index ?? undefined } };
    if (part === 'root') return common;
    if (part === 'dropzone') return { ...common, role: 'button', tabIndex: state.disabled ? -1 : 0, aria: { label: 'Drop files', disabled: state.disabled }, on: { click: () => { void actions.openPicker().catch(() => undefined); } } };
    if (part === 'trigger') return { ...common, role: 'button', disabled: state.disabled, attributes: { type: 'button' }, on: { click: () => { void actions.openPicker().catch(() => undefined); } } };
    if (part === 'input') return { ...common, hidden: true, disabled: state.disabled, attributes: { type: 'file', name: props.name, accept: props.accept, multiple: state.multiple, required: state.required }, aria: { labelledby: state.ids.label, invalid: state.invalid } };
    if (part === 'itemGroup') return { ...common, role: 'list', aria: { label: 'Selected files' } };
    if (part === 'item') return { ...common, role: 'listitem' };
    if (part === 'itemDelete') return { ...common, role: 'button', disabled: state.disabled, attributes: { type: 'button' }, aria: { label: 'Remove file' }, on: { click: () => index !== null && actions.remove(index) } };
    if (part === 'error') return { ...common, role: state.invalid || state.status === 'rejected' ? 'alert' : undefined, hidden: state.valid && state.status !== 'rejected' };
    if (part === 'status') return { ...common, role: 'status', aria: { live: 'polite', atomic: true }, data: { state: state.status, count: state.fileCount } };
    return common;
  };
  const parts = Object.fromEntries(anatomy.map((part) => [part, { name: part, getProps(indexOrProps?: number | UIFnPartProps, userProps?: UIFnPartProps) { const index = typeof indexOrProps === 'number' ? indexOrProps : null; return mergePartProps(generated(part, index), typeof indexOrProps === 'number' ? userProps : indexOrProps, { component: 'FileUpload', part, required: { id: true } }); } }])) as unknown as FileUploadParts;
  return createUIFnController({
    actions,
    parts,
    getState: store.getState,
    subscribe: store.subscribe,
    update(next) {
      const patchable: Partial<FileUploadState> = {
        ...(next.disabled !== undefined ? { disabled: next.disabled } : {}),
        ...(next.required !== undefined ? { required: next.required } : {}),
        ...(next.accept !== undefined ? { accept: next.accept } : {}),
      };
      if (Object.keys(patchable).length) patch(patchable);
    },
    destroy() { active = false; files = Object.freeze([]); store.destroy(); },
  });
}
