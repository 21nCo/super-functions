'use client';

import * as React from 'react';
import { createImageCropperController, type ImageCropperProps, type ImageCropperController } from '@uifn/core/primitives/image-cropper';
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

const ImageCropperContext = React.createContext<ReactPrimitiveBridge<ImageCropperProps> | null>(null);
const ImageCropperDefinition: ReactPrimitiveDefinition<ImageCropperProps> = {
  name: 'ImageCropper',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["src","crop","defaultCrop","aspectRatio","minSize","maxSize","disabled"],
  context: ImageCropperContext,
  createController: createImageCropperController as never,
};

export type ImageCropperRootProps = ReactPrimitiveRootProps<ImageCropperProps, 'div'>;
export const ImageCropperRoot = React.forwardRef<React.ElementRef<'div'>, ImageCropperRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ImageCropperDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ImageCropperRoot.displayName = 'ImageCropperRoot';

export type ImageCropperViewportProps = ReactPrimitivePartProps<ImageCropperController['parts']['viewport'], 'div', false>;
export const ImageCropperViewport = React.forwardRef<React.ElementRef<'div'>, ImageCropperViewportProps>((props, ref) => (
  <ReactPrimitivePart definition={ImageCropperDefinition as never} part="viewport" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ImageCropperViewport.displayName = 'ImageCropperViewport';

export type ImageCropperImageProps = ReactPrimitivePartProps<ImageCropperController['parts']['image'], 'img', false>;
export const ImageCropperImage = React.forwardRef<React.ElementRef<'img'>, ImageCropperImageProps>((props, ref) => (
  <ReactPrimitivePart definition={ImageCropperDefinition as never} part="image" element="img" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ImageCropperImage.displayName = 'ImageCropperImage';

export type ImageCropperCropAreaProps = ReactPrimitivePartProps<ImageCropperController['parts']['cropArea'], 'div', false>;
export const ImageCropperCropArea = React.forwardRef<React.ElementRef<'div'>, ImageCropperCropAreaProps>((props, ref) => (
  <ReactPrimitivePart definition={ImageCropperDefinition as never} part="cropArea" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ImageCropperCropArea.displayName = 'ImageCropperCropArea';

export type ImageCropperHandleProps = ReactPrimitivePartProps<ImageCropperController['parts']['handle'], 'div', true>;
export const ImageCropperHandle = React.forwardRef<React.ElementRef<'div'>, ImageCropperHandleProps>((props, ref) => (
  <ReactPrimitivePart definition={ImageCropperDefinition as never} part="handle" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ImageCropperHandle.displayName = 'ImageCropperHandle';

export type ImageCropperZoomControlProps = ReactPrimitivePartProps<ImageCropperController['parts']['zoomControl'], 'input', false>;
export const ImageCropperZoomControl = React.forwardRef<React.ElementRef<'input'>, ImageCropperZoomControlProps>((props, ref) => (
  <ReactPrimitivePart definition={ImageCropperDefinition as never} part="zoomControl" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ImageCropperZoomControl.displayName = 'ImageCropperZoomControl';

export type ImageCropperStatusProps = ReactPrimitivePartProps<ImageCropperController['parts']['status'], 'div', false>;
export const ImageCropperStatus = React.forwardRef<React.ElementRef<'div'>, ImageCropperStatusProps>((props, ref) => (
  <ReactPrimitivePart definition={ImageCropperDefinition as never} part="status" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ImageCropperStatus.displayName = 'ImageCropperStatus';

export const ImageCropperProvider = ImageCropperRoot;
export function useImageCropper(inputs: ImageCropperProps): ReactPrimitiveHookResult<ImageCropperController['state'], ImageCropperController['actions']> {
  return useReactPrimitive(ImageCropperDefinition, inputs) as ReactPrimitiveHookResult<ImageCropperController['state'], ImageCropperController['actions']>;
}
export const ImageCropper = Object.assign(ImageCropperRoot, { Provider: ImageCropperProvider, Root: ImageCropperRoot, Viewport: ImageCropperViewport, Image: ImageCropperImage, CropArea: ImageCropperCropArea, Handle: ImageCropperHandle, ZoomControl: ImageCropperZoomControl, Status: ImageCropperStatus });
