import { createContext, type JSX } from 'solid-js';
import { QRCodeContract, type QRCodeProps, type QRCodeContractParts } from '@uifn/core/primitives/qr-code';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const QRCodeContext = createContext<SolidPrimitiveContextValue<QRCodeProps>>();
export const QRCodeDefinition: SolidPrimitiveDefinition<QRCodeProps> = {
  name: 'QRCode',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["value","errorCorrection","size","label"],
  context: QRCodeContext,
  contract: QRCodeContract as never,
};

function QRCodeRootElement(props: JSX.IntrinsicElements['figure']): JSX.Element {
  return <figure {...props} />;
}

export type QRCodeRootProps = SolidPrimitiveRootProps<QRCodeProps, 'figure'>;
export function QRCodeRoot(props: QRCodeRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={QRCodeDefinition} element="figure" renderElement={QRCodeRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function QRCodeImageElement(props: JSX.IntrinsicElements['svg']): JSX.Element {
  return <svg {...props} />;
}

export type QRCodeImageProps = SolidPrimitivePartProps<QRCodeContractParts['image'], 'svg', false>;
export function QRCodeImage(props: QRCodeImageProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={QRCodeDefinition as never}
      part="image"
      element="svg"
      renderElement={QRCodeImageElement as never}
      many={false}
      props={props as never}
    />
  );
}

function QRCodeCaptionElement(props: JSX.IntrinsicElements['figcaption']): JSX.Element {
  return <figcaption {...props} />;
}

export type QRCodeCaptionProps = SolidPrimitivePartProps<QRCodeContractParts['caption'], 'figcaption', false>;
export function QRCodeCaption(props: QRCodeCaptionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={QRCodeDefinition as never}
      part="caption"
      element="figcaption"
      renderElement={QRCodeCaptionElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const QRCodeProvider = QRCodeRoot;
export const QRCode = /* @__PURE__ */ Object.assign(QRCodeRoot, { Provider: QRCodeProvider, Root: QRCodeRoot, Image: QRCodeImage, Caption: QRCodeCaption });
