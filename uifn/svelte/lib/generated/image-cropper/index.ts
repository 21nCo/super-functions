import type { ComponentProps } from 'svelte';
import ImageCropperRootComponent from './Root.svelte';
import ImageCropperViewportComponent from './Viewport.svelte';
import ImageCropperImageComponent from './Image.svelte';
import ImageCropperCropAreaComponent from './CropArea.svelte';
import ImageCropperHandleComponent from './Handle.svelte';
import ImageCropperZoomControlComponent from './ZoomControl.svelte';
import ImageCropperStatusComponent from './Status.svelte';

export const ImageCropperRoot = ImageCropperRootComponent;
export type ImageCropperRootProps = ComponentProps<typeof ImageCropperRootComponent>;

export const ImageCropperViewport = ImageCropperViewportComponent;
export type ImageCropperViewportProps = ComponentProps<typeof ImageCropperViewportComponent>;

export const ImageCropperImage = ImageCropperImageComponent;
export type ImageCropperImageProps = ComponentProps<typeof ImageCropperImageComponent>;

export const ImageCropperCropArea = ImageCropperCropAreaComponent;
export type ImageCropperCropAreaProps = ComponentProps<typeof ImageCropperCropAreaComponent>;

export const ImageCropperHandle = ImageCropperHandleComponent;
export type ImageCropperHandleProps = ComponentProps<typeof ImageCropperHandleComponent>;

export const ImageCropperZoomControl = ImageCropperZoomControlComponent;
export type ImageCropperZoomControlProps = ComponentProps<typeof ImageCropperZoomControlComponent>;

export const ImageCropperStatus = ImageCropperStatusComponent;
export type ImageCropperStatusProps = ComponentProps<typeof ImageCropperStatusComponent>;

export const ImageCropperProvider = ImageCropperRoot;
export const ImageCropper = Object.assign(ImageCropperRoot, { Provider: ImageCropperProvider, Root: ImageCropperRoot, Viewport: ImageCropperViewport, Image: ImageCropperImage, CropArea: ImageCropperCropArea, Handle: ImageCropperHandle, ZoomControl: ImageCropperZoomControl, Status: ImageCropperStatus });
