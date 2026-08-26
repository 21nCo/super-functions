import { createContext, type JSX } from 'solid-js';
import { createImageCropperController, type ImageCropperProps, type ImageCropperController } from '@uifn/core/primitives/image-cropper';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ImageCropperContext = createContext<SolidPrimitiveContextValue<ImageCropperProps>>();
export const ImageCropperDefinition: SolidPrimitiveDefinition<ImageCropperProps> = {
  name: 'ImageCropper',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["src","crop","defaultCrop","aspectRatio","minSize","maxSize","disabled"],
  context: ImageCropperContext,
  createController: createImageCropperController as never,
};

function ImageCropperRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ImageCropperRootProps = SolidPrimitiveRootProps<ImageCropperProps, 'div'>;
export function ImageCropperRoot(props: ImageCropperRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ImageCropperDefinition} element="div" renderElement={ImageCropperRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function ImageCropperViewportElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ImageCropperViewportProps = SolidPrimitivePartProps<ImageCropperController['parts']['viewport'], 'div', false>;
export function ImageCropperViewport(props: ImageCropperViewportProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ImageCropperDefinition as never}
      part="viewport"
      element="div"
      renderElement={ImageCropperViewportElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ImageCropperImageElement(props: JSX.IntrinsicElements['img']): JSX.Element {
  return <img {...props} />;
}

export type ImageCropperImageProps = SolidPrimitivePartProps<ImageCropperController['parts']['image'], 'img', false>;
export function ImageCropperImage(props: ImageCropperImageProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ImageCropperDefinition as never}
      part="image"
      element="img"
      renderElement={ImageCropperImageElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ImageCropperCropAreaElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ImageCropperCropAreaProps = SolidPrimitivePartProps<ImageCropperController['parts']['cropArea'], 'div', false>;
export function ImageCropperCropArea(props: ImageCropperCropAreaProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ImageCropperDefinition as never}
      part="cropArea"
      element="div"
      renderElement={ImageCropperCropAreaElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ImageCropperHandleElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ImageCropperHandleProps = SolidPrimitivePartProps<ImageCropperController['parts']['handle'], 'div', true>;
export function ImageCropperHandle(props: ImageCropperHandleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ImageCropperDefinition as never}
      part="handle"
      element="div"
      renderElement={ImageCropperHandleElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ImageCropperZoomControlElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type ImageCropperZoomControlProps = SolidPrimitivePartProps<ImageCropperController['parts']['zoomControl'], 'input', false>;
export function ImageCropperZoomControl(props: ImageCropperZoomControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ImageCropperDefinition as never}
      part="zoomControl"
      element="input"
      renderElement={ImageCropperZoomControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ImageCropperStatusElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ImageCropperStatusProps = SolidPrimitivePartProps<ImageCropperController['parts']['status'], 'div', false>;
export function ImageCropperStatus(props: ImageCropperStatusProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ImageCropperDefinition as never}
      part="status"
      element="div"
      renderElement={ImageCropperStatusElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const ImageCropperProvider = ImageCropperRoot;
export const ImageCropper = /* @__PURE__ */ Object.assign(ImageCropperRoot, { Provider: ImageCropperProvider, Root: ImageCropperRoot, Viewport: ImageCropperViewport, Image: ImageCropperImage, CropArea: ImageCropperCropArea, Handle: ImageCropperHandle, ZoomControl: ImageCropperZoomControl, Status: ImageCropperStatus });
