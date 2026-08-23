import { QRCodeContract, type QRCodeProps } from '@uifn/core/primitives/qr-code';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const QRCodeDefinition: SveltePrimitiveDefinition<QRCodeProps> = {
  name: 'QRCode',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["value","errorCorrection","size","label"],
  contextKey: Symbol('uifn.QRCode'),
  contract: QRCodeContract as never,
};
