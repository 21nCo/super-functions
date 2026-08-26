import { createContext, type JSX } from 'solid-js';
import { createFileUploadController, type FileUploadProps, type FileUploadController } from '@uifn/core/primitives/file-upload';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const FileUploadContext = createContext<SolidPrimitiveContextValue<FileUploadProps>>();
export const FileUploadDefinition: SolidPrimitiveDefinition<FileUploadProps> = {
  name: 'FileUpload',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["files","defaultFiles","accept","multiple","maxFiles","maxSize","name","disabled","required"],
  context: FileUploadContext,
  createController: createFileUploadController as never,
};

function FileUploadRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FileUploadRootProps = SolidPrimitiveRootProps<FileUploadProps, 'div'>;
export function FileUploadRoot(props: FileUploadRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={FileUploadDefinition} element="div" renderElement={FileUploadRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function FileUploadLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type FileUploadLabelProps = SolidPrimitivePartProps<FileUploadController['parts']['label'], 'label', false>;
export function FileUploadLabel(props: FileUploadLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FileUploadDefinition as never}
      part="label"
      element="label"
      renderElement={FileUploadLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FileUploadDropzoneElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FileUploadDropzoneProps = SolidPrimitivePartProps<FileUploadController['parts']['dropzone'], 'div', false>;
export function FileUploadDropzone(props: FileUploadDropzoneProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FileUploadDefinition as never}
      part="dropzone"
      element="div"
      renderElement={FileUploadDropzoneElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FileUploadTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type FileUploadTriggerProps = SolidPrimitivePartProps<FileUploadController['parts']['trigger'], 'button', false>;
export function FileUploadTrigger(props: FileUploadTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FileUploadDefinition as never}
      part="trigger"
      element="button"
      renderElement={FileUploadTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FileUploadInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type FileUploadInputProps = SolidPrimitivePartProps<FileUploadController['parts']['input'], 'input', false>;
export function FileUploadInput(props: FileUploadInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FileUploadDefinition as never}
      part="input"
      element="input"
      renderElement={FileUploadInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FileUploadItemGroupElement(props: JSX.IntrinsicElements['ul']): JSX.Element {
  return <ul {...props} />;
}

export type FileUploadItemGroupProps = SolidPrimitivePartProps<FileUploadController['parts']['itemGroup'], 'ul', false>;
export function FileUploadItemGroup(props: FileUploadItemGroupProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FileUploadDefinition as never}
      part="itemGroup"
      element="ul"
      renderElement={FileUploadItemGroupElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FileUploadItemElement(props: JSX.IntrinsicElements['li']): JSX.Element {
  return <li {...props} />;
}

export type FileUploadItemProps = SolidPrimitivePartProps<FileUploadController['parts']['item'], 'li', true>;
export function FileUploadItem(props: FileUploadItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FileUploadDefinition as never}
      part="item"
      element="li"
      renderElement={FileUploadItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function FileUploadItemNameElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type FileUploadItemNameProps = SolidPrimitivePartProps<FileUploadController['parts']['itemName'], 'span', true>;
export function FileUploadItemName(props: FileUploadItemNameProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FileUploadDefinition as never}
      part="itemName"
      element="span"
      renderElement={FileUploadItemNameElement as never}
      many={true}
      props={props as never}
    />
  );
}

function FileUploadItemSizeElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type FileUploadItemSizeProps = SolidPrimitivePartProps<FileUploadController['parts']['itemSize'], 'span', true>;
export function FileUploadItemSize(props: FileUploadItemSizeProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FileUploadDefinition as never}
      part="itemSize"
      element="span"
      renderElement={FileUploadItemSizeElement as never}
      many={true}
      props={props as never}
    />
  );
}

function FileUploadItemDeleteElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type FileUploadItemDeleteProps = SolidPrimitivePartProps<FileUploadController['parts']['itemDelete'], 'button', true>;
export function FileUploadItemDelete(props: FileUploadItemDeleteProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FileUploadDefinition as never}
      part="itemDelete"
      element="button"
      renderElement={FileUploadItemDeleteElement as never}
      many={true}
      props={props as never}
    />
  );
}

function FileUploadErrorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FileUploadErrorProps = SolidPrimitivePartProps<FileUploadController['parts']['error'], 'div', false>;
export function FileUploadError(props: FileUploadErrorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FileUploadDefinition as never}
      part="error"
      element="div"
      renderElement={FileUploadErrorElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FileUploadStatusElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FileUploadStatusProps = SolidPrimitivePartProps<FileUploadController['parts']['status'], 'div', false>;
export function FileUploadStatus(props: FileUploadStatusProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FileUploadDefinition as never}
      part="status"
      element="div"
      renderElement={FileUploadStatusElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const FileUploadProvider = FileUploadRoot;
export const FileUpload = /* @__PURE__ */ Object.assign(FileUploadRoot, { Provider: FileUploadProvider, Root: FileUploadRoot, Label: FileUploadLabel, Dropzone: FileUploadDropzone, Trigger: FileUploadTrigger, Input: FileUploadInput, ItemGroup: FileUploadItemGroup, Item: FileUploadItem, ItemName: FileUploadItemName, ItemSize: FileUploadItemSize, ItemDelete: FileUploadItemDelete, Error: FileUploadError, Status: FileUploadStatus });
