import { clampRangeValue } from '../algorithms/range';
import { createUIFnController, type UIFnController } from '../controller';
import { createUIFnEnvironment, createUIFnIdAllocator, type UIFnEnvironment } from '../environment';
import { createUIFnError, type UIFnError } from '../errors';
import { createControlledValue } from '../internal/runtime/controlled';
import { createStateChannel } from '../internal/runtime/state-channel';
import { mergePartProps, type UIFnPartProps } from '../parts';

export interface CropRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface CropPoint { readonly x: number; readonly y: number; }
export type CropHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface ImageCropperProps {
  readonly src: string;
  readonly crop?: CropRect;
  readonly defaultCrop?: CropRect;
  readonly aspectRatio?: number;
  readonly minSize?: number;
  readonly maxSize?: number;
  readonly disabled?: boolean;
  readonly zoom?: number;
  readonly defaultZoom?: number;
  readonly minZoom?: number;
  readonly maxZoom?: number;
  readonly onCropChange?: (crop: CropRect) => void;
  readonly onZoomChange?: (zoom: number) => void;
}

export interface ImageCropperState {
  readonly status: 'loading' | 'ready' | 'dragging' | 'resizing' | 'error';
  readonly src: string;
  readonly crop: CropRect;
  readonly zoom: number;
  readonly disabled: boolean;
  readonly imageSize: { readonly width: number; readonly height: number } | null;
  readonly activeHandle: CropHandle | null;
  readonly lastError: UIFnError | null;
}

export interface ImageCropperActions {
  load(width: number, height: number): void;
  fail(): void;
  setCrop(crop: CropRect): void;
  syncCrop(crop: CropRect): void;
  startDrag(point: CropPoint): void;
  startResize(handle: CropHandle, point: CropPoint): void;
  move(point: CropPoint): void;
  endInteraction(): void;
  setZoom(zoom: number): void;
  syncZoom(zoom: number): void;
}

interface StaticPart { readonly name: string; getProps(userProps?: UIFnPartProps): UIFnPartProps; }
interface HandlePart { readonly name: string; getProps(handle: CropHandle, userProps?: UIFnPartProps): UIFnPartProps; }
export interface ImageCropperControllerParts {
  readonly root: StaticPart; readonly viewport: StaticPart; readonly image: StaticPart; readonly cropArea: StaticPart;
  readonly handle: HandlePart; readonly zoomControl: StaticPart; readonly status: StaticPart;
}
export type ImageCropperController = UIFnController<ImageCropperState, ImageCropperActions, ImageCropperControllerParts, ImageCropperProps>;

function rectEqual(left: CropRect, right: CropRect): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function cropRectStyle(state: ImageCropperState): Record<string, string | number> {
  const { crop, imageSize } = state;
  if (!imageSize) {
    return {
      left: crop.x,
      top: crop.y,
      width: crop.width,
      height: crop.height,
    };
  }
  return {
    left: `${crop.x / imageSize.width * 100}%`,
    top: `${crop.y / imageSize.height * 100}%`,
    width: `${crop.width / imageSize.width * 100}%`,
    height: `${crop.height / imageSize.height * 100}%`,
  };
}

function normalizeRect(rect: CropRect, props: ImageCropperProps, size: ImageCropperState['imageSize']): CropRect {
  const bounds = size ?? { width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER };
  const min = Math.max(1, props.minSize ?? 1);
  const max = Math.max(min, Math.min(props.maxSize ?? Number.MAX_SAFE_INTEGER, bounds.width, bounds.height));
  let width = clampRangeValue(Math.abs(rect.width), min, max);
  let height = clampRangeValue(Math.abs(rect.height), min, max);
  if (props.aspectRatio && props.aspectRatio > 0) {
    height = width / props.aspectRatio;
    if (height > max) { height = max; width = height * props.aspectRatio; }
  }
  width = Math.min(width, bounds.width);
  height = Math.min(height, bounds.height);
  return Object.freeze({
    x: clampRangeValue(rect.x, 0, Math.max(0, bounds.width - width)),
    y: clampRangeValue(rect.y, 0, Math.max(0, bounds.height - height)),
    width,
    height,
  });
}

export function createImageCropperController(props: ImageCropperProps, environment: UIFnEnvironment = {}): ImageCropperController {
  if (!props.src) throw createUIFnError({ code: 'UIFN_ERR_INVALID_VALUE', component: 'ImageCropper', message: 'ImageCropper src is required.' });
  const env = createUIFnEnvironment(environment);
  const allocator = createUIFnIdAllocator(env, 'image-cropper');
  const token = env.generateId('image-cropper');
  const ids = new Map<string, string>();
  const id = (part: string) => {
    const existing = ids.get(part);
    if (existing) return existing;
    const created = allocator.fromToken(`image-cropper-${part}`, token, part);
    ids.set(part, created);
    return created;
  };
  const initialCrop = props.crop ?? props.defaultCrop ?? { x: 0, y: 0, width: 100, height: 100 };
  const cropValue = createControlledValue({ value: props.crop, defaultValue: initialCrop, onChange: props.onCropChange, isEqual: rectEqual });
  const minZoom = props.minZoom ?? 1; const maxZoom = Math.max(minZoom, props.maxZoom ?? 4);
  const zoomValue = createControlledValue({ value: props.zoom, defaultValue: props.defaultZoom ?? 1, onChange: props.onZoomChange });
  const store = createStateChannel<ImageCropperState>({
    status: 'loading', src: props.src, crop: normalizeRect(cropValue.getValue(), props, null),
    zoom: clampRangeValue(zoomValue.getValue(), minZoom, maxZoom), disabled: Boolean(props.disabled),
    imageSize: null, activeHandle: null, lastError: null,
  });
  let origin: { point: CropPoint; crop: CropRect } | null = null;
  const disabled = () => {
    if (!store.getState().disabled) return false;
    store.patchState({ lastError: createUIFnError({ code: 'UIFN_CORE_DISABLED_MUTATED', component: 'ImageCropper', recoverable: true }) });
    return true;
  };
  const publishCrop = (raw: CropRect, sync = false) => {
    const state = store.getState(); const crop = normalizeRect(raw, props, state.imageSize);
    const result = sync ? cropValue.syncValue(crop) : cropValue.requestValue(crop);
    store.patchState({ crop: result.value, lastError: null });
  };
  const actions: ImageCropperActions = {
    load(width, height) {
      if (!(width > 0 && height > 0)) { actions.fail(); return; }
      const imageSize = Object.freeze({ width, height });
      store.patchState({ imageSize, crop: normalizeRect(store.getState().crop, props, imageSize), status: 'ready', lastError: null });
    },
    fail() { store.patchState({ status: 'error', imageSize: null, activeHandle: null }); },
    setCrop(crop) { if (!disabled()) publishCrop(crop); },
    syncCrop(crop) { publishCrop(crop, true); },
    startDrag(point) {
      if (disabled() || store.getState().status === 'loading' || store.getState().status === 'error') return;
      origin = { point, crop: store.getState().crop }; store.patchState({ status: 'dragging', activeHandle: null });
    },
    startResize(handle, point) {
      if (disabled() || store.getState().status === 'loading' || store.getState().status === 'error') return;
      origin = { point, crop: store.getState().crop }; store.patchState({ status: 'resizing', activeHandle: handle });
    },
    move(point) {
      const state = store.getState(); if (!origin || (state.status !== 'dragging' && state.status !== 'resizing') || disabled()) return;
      const dx = point.x - origin.point.x; const dy = point.y - origin.point.y;
      if (state.status === 'dragging') { publishCrop({ ...origin.crop, x: origin.crop.x + dx, y: origin.crop.y + dy }); return; }
      const handle = state.activeHandle ?? 'se'; let { x, y, width, height } = origin.crop;
      if (handle.includes('e')) width += dx;
      if (handle.includes('s')) height += dy;
      if (handle.includes('w')) { x += dx; width -= dx; }
      if (handle.includes('n')) { y += dy; height -= dy; }
      publishCrop({ x, y, width, height });
    },
    endInteraction() { if (store.getState().status === 'dragging' || store.getState().status === 'resizing') store.patchState({ status: 'ready', activeHandle: null }); origin = null; },
    setZoom(zoom) { if (disabled()) return; const next = clampRangeValue(zoom, minZoom, maxZoom); store.patchState({ zoom: zoomValue.requestValue(next).value }); },
    syncZoom(zoom) { store.patchState({ zoom: zoomValue.syncValue(clampRangeValue(zoom, minZoom, maxZoom)).value }); },
  };
  const part = (name: string, generated: () => UIFnPartProps): StaticPart => ({
    name, getProps: (userProps) => mergePartProps(generated(), userProps, { component: 'ImageCropper', part: name, required: { id: true } }),
  });
  const parts: ImageCropperControllerParts = {
    root: part('root', () => ({ id: id('root'), data: { state: store.getState().status, disabled: store.getState().disabled } })),
    viewport: part('viewport', () => ({ id: id('viewport'), role: 'region', aria: { label: 'Image crop area' }, data: { state: store.getState().status } })),
    image: part('image', () => ({
      id: id('image'),
      attributes: { src: store.getState().src, alt: '' },
      aria: { hidden: true },
      data: { state: store.getState().status },
      ref(element) {
        const image = element as {
          complete?: boolean;
          naturalWidth?: number;
          naturalHeight?: number;
        } | null;
        if (!image?.complete) return;
        actions.load(Number(image.naturalWidth ?? 0), Number(image.naturalHeight ?? 0));
      },
      on: {
        load(event) {
          const image = event?.currentTarget as {
            naturalWidth?: number;
            naturalHeight?: number;
          } | null | undefined;
          actions.load(Number(image?.naturalWidth ?? 0), Number(image?.naturalHeight ?? 0));
        },
        error: () => actions.fail(),
      },
    })),
    cropArea: part('cropArea', () => {
      const state = store.getState();
      return {
        id: id('crop-area'),
        role: 'group',
        aria: { label: 'Crop selection' },
        data: { state: state.status },
        style: cropRectStyle(state),
      };
    }),
    handle: {
      name: 'handle',
      getProps(handle, userProps) {
        const state = store.getState();
        const horizontal = handle.includes('e') || handle.includes('w');
        const value = horizontal ? state.crop.width : state.crop.height;
        const minimum = Math.max(1, props.minSize ?? 1);
        const imageMaximum = horizontal ? state.imageSize?.width : state.imageSize?.height;
        const maximum = Math.max(minimum, Math.min(props.maxSize ?? Number.MAX_SAFE_INTEGER, imageMaximum ?? Number.MAX_SAFE_INTEGER));
        return mergePartProps({
          id: id(`handle-${handle}`),
          role: 'slider',
          tabIndex: state.disabled ? -1 : 0,
          aria: {
            label: `Resize crop ${handle}`,
            disabled: state.disabled,
            valuemin: minimum,
            valuemax: maximum,
            valuenow: value,
            valuetext: `${Math.round(state.crop.width)} by ${Math.round(state.crop.height)} pixels`,
          },
          data: { handle },
          disabled: state.disabled,
        }, userProps, {
          component: 'ImageCropper',
          part: 'handle',
          required: { role: true, id: true, tabIndex: true, aria: ['label', 'valuemin', 'valuemax', 'valuenow', 'valuetext'] },
        });
      },
    },
    zoomControl: part('zoomControl', () => ({ id: id('zoom'), attributes: { type: 'range', min: minZoom, max: maxZoom, step: 0.1, value: store.getState().zoom }, aria: { label: 'Zoom image' }, disabled: store.getState().disabled, on: { input: (event) => actions.setZoom(Number(event?.value ?? minZoom)) } })),
    status: part('status', () => ({ id: id('status'), role: 'status', aria: { live: 'polite' }, data: { state: store.getState().status } })),
  };
  return createUIFnController({
    actions, parts, getState: store.getState,
    update(inputs) { if (inputs.crop) actions.syncCrop(inputs.crop); if (inputs.zoom !== undefined) actions.syncZoom(inputs.zoom); },
    subscribe: store.subscribe,
    destroy() { cropValue.destroy(); zoomValue.destroy(); store.destroy(); },
  });
}
