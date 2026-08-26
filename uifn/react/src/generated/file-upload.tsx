'use client';

import * as React from 'react';
import { createFileUploadController, type FileUploadProps, type FileUploadController } from '@uifn/core/primitives/file-upload';
import {
  ReactPrimitivePart,
  ReactPrimitiveRoot,
  useReactPrimitive,
  type ReactPrimitiveBridge,
  type ReactPrimitiveDefinition,
  type ReactPrimitiveHookResult,
  type ReactPrimitivePartProps,
  type ReactPrimitiveRootProps,
} from '../internal/compound';

const FileUploadContext = React.createContext<ReactPrimitiveBridge<FileUploadProps> | null>(null);
const FileUploadDefinition: ReactPrimitiveDefinition<FileUploadProps> = {
  name: 'FileUpload',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["files","defaultFiles","accept","multiple","maxFiles","maxSize","name","disabled","required"],
  context: FileUploadContext,
  createController: createFileUploadController as never,
};

export type FileUploadRootProps = ReactPrimitiveRootProps<FileUploadProps, 'div'>;
export const FileUploadRoot = React.forwardRef<React.ElementRef<'div'>, FileUploadRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={FileUploadDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FileUploadRoot.displayName = 'FileUploadRoot';

export type FileUploadLabelProps = ReactPrimitivePartProps<FileUploadController['parts']['label'], 'label', false>;
export const FileUploadLabel = React.forwardRef<React.ElementRef<'label'>, FileUploadLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={FileUploadDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FileUploadLabel.displayName = 'FileUploadLabel';

export type FileUploadDropzoneProps = ReactPrimitivePartProps<FileUploadController['parts']['dropzone'], 'div', false>;
export const FileUploadDropzone = React.forwardRef<React.ElementRef<'div'>, FileUploadDropzoneProps>((props, ref) => (
  <ReactPrimitivePart definition={FileUploadDefinition as never} part="dropzone" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FileUploadDropzone.displayName = 'FileUploadDropzone';

export type FileUploadTriggerProps = ReactPrimitivePartProps<FileUploadController['parts']['trigger'], 'button', false>;
export const FileUploadTrigger = React.forwardRef<React.ElementRef<'button'>, FileUploadTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={FileUploadDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FileUploadTrigger.displayName = 'FileUploadTrigger';

export type FileUploadInputProps = ReactPrimitivePartProps<FileUploadController['parts']['input'], 'input', false>;
export const FileUploadInput = React.forwardRef<React.ElementRef<'input'>, FileUploadInputProps>((props, ref) => (
  <ReactPrimitivePart definition={FileUploadDefinition as never} part="input" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FileUploadInput.displayName = 'FileUploadInput';

export type FileUploadItemGroupProps = ReactPrimitivePartProps<FileUploadController['parts']['itemGroup'], 'ul', false>;
export const FileUploadItemGroup = React.forwardRef<React.ElementRef<'ul'>, FileUploadItemGroupProps>((props, ref) => (
  <ReactPrimitivePart definition={FileUploadDefinition as never} part="itemGroup" element="ul" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FileUploadItemGroup.displayName = 'FileUploadItemGroup';

export type FileUploadItemProps = ReactPrimitivePartProps<FileUploadController['parts']['item'], 'li', true>;
export const FileUploadItem = React.forwardRef<React.ElementRef<'li'>, FileUploadItemProps>((props, ref) => (
  <ReactPrimitivePart definition={FileUploadDefinition as never} part="item" element="li" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FileUploadItem.displayName = 'FileUploadItem';

export type FileUploadItemNameProps = ReactPrimitivePartProps<FileUploadController['parts']['itemName'], 'span', true>;
export const FileUploadItemName = React.forwardRef<React.ElementRef<'span'>, FileUploadItemNameProps>((props, ref) => (
  <ReactPrimitivePart definition={FileUploadDefinition as never} part="itemName" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FileUploadItemName.displayName = 'FileUploadItemName';

export type FileUploadItemSizeProps = ReactPrimitivePartProps<FileUploadController['parts']['itemSize'], 'span', true>;
export const FileUploadItemSize = React.forwardRef<React.ElementRef<'span'>, FileUploadItemSizeProps>((props, ref) => (
  <ReactPrimitivePart definition={FileUploadDefinition as never} part="itemSize" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FileUploadItemSize.displayName = 'FileUploadItemSize';

export type FileUploadItemDeleteProps = ReactPrimitivePartProps<FileUploadController['parts']['itemDelete'], 'button', true>;
export const FileUploadItemDelete = React.forwardRef<React.ElementRef<'button'>, FileUploadItemDeleteProps>((props, ref) => (
  <ReactPrimitivePart definition={FileUploadDefinition as never} part="itemDelete" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FileUploadItemDelete.displayName = 'FileUploadItemDelete';

export type FileUploadErrorProps = ReactPrimitivePartProps<FileUploadController['parts']['error'], 'div', false>;
export const FileUploadError = React.forwardRef<React.ElementRef<'div'>, FileUploadErrorProps>((props, ref) => (
  <ReactPrimitivePart definition={FileUploadDefinition as never} part="error" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FileUploadError.displayName = 'FileUploadError';

export type FileUploadStatusProps = ReactPrimitivePartProps<FileUploadController['parts']['status'], 'div', false>;
export const FileUploadStatus = React.forwardRef<React.ElementRef<'div'>, FileUploadStatusProps>((props, ref) => (
  <ReactPrimitivePart definition={FileUploadDefinition as never} part="status" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FileUploadStatus.displayName = 'FileUploadStatus';

export const FileUploadProvider = FileUploadRoot;
export function useFileUpload(inputs: FileUploadProps = {} as FileUploadProps): ReactPrimitiveHookResult<FileUploadController['state'], FileUploadController['actions']> {
  return useReactPrimitive(FileUploadDefinition, inputs) as ReactPrimitiveHookResult<FileUploadController['state'], FileUploadController['actions']>;
}
export const FileUpload = Object.assign(FileUploadRoot, { Provider: FileUploadProvider, Root: FileUploadRoot, Label: FileUploadLabel, Dropzone: FileUploadDropzone, Trigger: FileUploadTrigger, Input: FileUploadInput, ItemGroup: FileUploadItemGroup, Item: FileUploadItem, ItemName: FileUploadItemName, ItemSize: FileUploadItemSize, ItemDelete: FileUploadItemDelete, Error: FileUploadError, Status: FileUploadStatus });
