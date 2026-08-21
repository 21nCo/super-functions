import type { ComponentProps } from 'svelte';
import FileUploadRootComponent from './Root.svelte';
import FileUploadLabelComponent from './Label.svelte';
import FileUploadDropzoneComponent from './Dropzone.svelte';
import FileUploadTriggerComponent from './Trigger.svelte';
import FileUploadInputComponent from './Input.svelte';
import FileUploadItemGroupComponent from './ItemGroup.svelte';
import FileUploadItemComponent from './Item.svelte';
import FileUploadItemNameComponent from './ItemName.svelte';
import FileUploadItemSizeComponent from './ItemSize.svelte';
import FileUploadItemDeleteComponent from './ItemDelete.svelte';
import FileUploadErrorComponent from './Error.svelte';
import FileUploadStatusComponent from './Status.svelte';

export const FileUploadRoot = FileUploadRootComponent;
export type FileUploadRootProps = ComponentProps<typeof FileUploadRootComponent>;

export const FileUploadLabel = FileUploadLabelComponent;
export type FileUploadLabelProps = ComponentProps<typeof FileUploadLabelComponent>;

export const FileUploadDropzone = FileUploadDropzoneComponent;
export type FileUploadDropzoneProps = ComponentProps<typeof FileUploadDropzoneComponent>;

export const FileUploadTrigger = FileUploadTriggerComponent;
export type FileUploadTriggerProps = ComponentProps<typeof FileUploadTriggerComponent>;

export const FileUploadInput = FileUploadInputComponent;
export type FileUploadInputProps = ComponentProps<typeof FileUploadInputComponent>;

export const FileUploadItemGroup = FileUploadItemGroupComponent;
export type FileUploadItemGroupProps = ComponentProps<typeof FileUploadItemGroupComponent>;

export const FileUploadItem = FileUploadItemComponent;
export type FileUploadItemProps = ComponentProps<typeof FileUploadItemComponent>;

export const FileUploadItemName = FileUploadItemNameComponent;
export type FileUploadItemNameProps = ComponentProps<typeof FileUploadItemNameComponent>;

export const FileUploadItemSize = FileUploadItemSizeComponent;
export type FileUploadItemSizeProps = ComponentProps<typeof FileUploadItemSizeComponent>;

export const FileUploadItemDelete = FileUploadItemDeleteComponent;
export type FileUploadItemDeleteProps = ComponentProps<typeof FileUploadItemDeleteComponent>;

export const FileUploadError = FileUploadErrorComponent;
export type FileUploadErrorProps = ComponentProps<typeof FileUploadErrorComponent>;

export const FileUploadStatus = FileUploadStatusComponent;
export type FileUploadStatusProps = ComponentProps<typeof FileUploadStatusComponent>;

export const FileUploadProvider = FileUploadRoot;
export const FileUpload = Object.assign(FileUploadRoot, { Provider: FileUploadProvider, Root: FileUploadRoot, Label: FileUploadLabel, Dropzone: FileUploadDropzone, Trigger: FileUploadTrigger, Input: FileUploadInput, ItemGroup: FileUploadItemGroup, Item: FileUploadItem, ItemName: FileUploadItemName, ItemSize: FileUploadItemSize, ItemDelete: FileUploadItemDelete, Error: FileUploadError, Status: FileUploadStatus });
