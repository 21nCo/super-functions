'use client';

import * as React from 'react';
import { QRCodeContract, type QRCodeProps, type QRCodeContractParts } from '@uifn/core/primitives/qr-code';
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

const QRCodeContext = React.createContext<ReactPrimitiveBridge<QRCodeProps> | null>(null);
const QRCodeDefinition: ReactPrimitiveDefinition<QRCodeProps> = {
  name: 'QRCode',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["value","errorCorrection","size","label"],
  context: QRCodeContext,
  contract: QRCodeContract as never,
};

export type QRCodeRootProps = ReactPrimitiveRootProps<QRCodeProps, 'figure'>;
export const QRCodeRoot = React.forwardRef<React.ElementRef<'figure'>, QRCodeRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={QRCodeDefinition} element="figure" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
QRCodeRoot.displayName = 'QRCodeRoot';

export type QRCodeImageProps = ReactPrimitivePartProps<QRCodeContractParts['image'], 'svg', false>;
export const QRCodeImage = React.forwardRef<React.ElementRef<'svg'>, QRCodeImageProps>((props, ref) => (
  <ReactPrimitivePart definition={QRCodeDefinition as never} part="image" element="svg" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
QRCodeImage.displayName = 'QRCodeImage';

export type QRCodeCaptionProps = ReactPrimitivePartProps<QRCodeContractParts['caption'], 'figcaption', false>;
export const QRCodeCaption = React.forwardRef<React.ElementRef<'figcaption'>, QRCodeCaptionProps>((props, ref) => (
  <ReactPrimitivePart definition={QRCodeDefinition as never} part="caption" element="figcaption" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
QRCodeCaption.displayName = 'QRCodeCaption';

export const QRCodeProvider = QRCodeRoot;
export function useQRCode(inputs: QRCodeProps): ReactPrimitiveHookResult<ReturnType<typeof QRCodeContract.getState>, Record<string, never>> {
  return useReactPrimitive(QRCodeDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof QRCodeContract.getState>, Record<string, never>>;
}
export const QRCode = Object.assign(QRCodeRoot, { Provider: QRCodeProvider, Root: QRCodeRoot, Image: QRCodeImage, Caption: QRCodeCaption });
