import qrcode from 'qrcode-generator';
import { createUIFnPartId } from '../algorithms/id';
import { createUIFnError } from '../errors';
import type { UIFnPartProps } from '../parts';
import { defineUIFnStaticContract, freezeUIFnParts } from './static-contract';

export interface QRCodeProps { readonly value: string; readonly errorCorrection?: 'L' | 'M' | 'Q' | 'H'; readonly size?: number; readonly label: string; }
export interface QRCodeState {
  readonly status: 'ready';
  readonly size: number;
  readonly errorCorrection: NonNullable<QRCodeProps['errorCorrection']>;
  readonly moduleCount: number;
  readonly path: string;
  readonly viewBox: string;
}
export interface QRCodeContractParts { readonly root: UIFnPartProps; readonly image: UIFnPartProps; readonly caption: UIFnPartProps; }

const QUIET_ZONE_MODULES = 4;

function createQRCodeGeometry(value: string, errorCorrection: NonNullable<QRCodeProps['errorCorrection']>) {
  const code = qrcode(0, errorCorrection);
  code.addData(value, 'Byte');
  code.make();
  const moduleCount = code.getModuleCount();
  const path: string[] = [];
  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (!code.isDark(row, column)) continue;
      const x = column + QUIET_ZONE_MODULES;
      const y = row + QUIET_ZONE_MODULES;
      path.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  const extent = moduleCount + QUIET_ZONE_MODULES * 2;
  return Object.freeze({
    moduleCount,
    path: path.join(''),
    viewBox: `0 0 ${extent} ${extent}`,
  });
}

export const QRCodeContract = defineUIFnStaticContract<QRCodeProps, QRCodeState, QRCodeContractParts>({
  kind: 'typed-static-contract', name: 'QRCode',
  anatomy: [{ name: 'root', element: 'figure', cardinality: 'one' }, { name: 'image', element: 'svg', cardinality: 'one' }, { name: 'caption', element: 'figcaption', cardinality: 'one' }],
  getState(inputs) {
    if (!inputs.value || !inputs.label) {
      throw createUIFnError({
        code: 'UIFN_ERR_INVALID_VALUE',
        component: 'QRCode',
        message: 'QRCode value and accessible label are required.',
        details: {
          missingLabel: !inputs.label,
          missingValue: !inputs.value,
        },
      });
    }
    const errorCorrection = inputs.errorCorrection ?? 'M';
    return Object.freeze({
      status: 'ready',
      size: Math.max(1, inputs.size ?? 128),
      errorCorrection,
      ...createQRCodeGeometry(inputs.value, errorCorrection),
    });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs); const captionId = createUIFnPartId(context.scopeId, 'qr-code', 'caption');
    return freezeUIFnParts({
      root: { id: createUIFnPartId(context.scopeId, 'qr-code', 'root'), data: { state: state.status, errorCorrection: state.errorCorrection } },
      image: {
        id: createUIFnPartId(context.scopeId, 'qr-code', 'image'),
        role: 'img',
        aria: { label: inputs.label, describedby: captionId },
        data: { moduleCount: state.moduleCount },
        attributes: {
          width: state.size,
          height: state.size,
          viewBox: state.viewBox,
          preserveAspectRatio: 'xMidYMid meet',
        },
      },
      caption: { id: captionId },
    });
  },
});
export type QRCodeContract = typeof QRCodeContract;
