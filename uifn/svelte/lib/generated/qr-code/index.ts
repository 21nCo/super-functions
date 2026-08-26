import type { ComponentProps } from 'svelte';
import QRCodeRootComponent from './Root.svelte';
import QRCodeImageComponent from './Image.svelte';
import QRCodeCaptionComponent from './Caption.svelte';

export const QRCodeRoot = QRCodeRootComponent;
export type QRCodeRootProps = ComponentProps<typeof QRCodeRootComponent>;

export const QRCodeImage = QRCodeImageComponent;
export type QRCodeImageProps = ComponentProps<typeof QRCodeImageComponent>;

export const QRCodeCaption = QRCodeCaptionComponent;
export type QRCodeCaptionProps = ComponentProps<typeof QRCodeCaptionComponent>;

export const QRCodeProvider = QRCodeRoot;
export const QRCode = Object.assign(QRCodeRoot, { Provider: QRCodeProvider, Root: QRCodeRoot, Image: QRCodeImage, Caption: QRCodeCaption });
