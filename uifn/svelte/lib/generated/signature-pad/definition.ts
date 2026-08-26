import { createSignaturePadController, type SignaturePadProps } from '@uifn/core/primitives/signature-pad';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const SignaturePadDefinition: SveltePrimitiveDefinition<SignaturePadProps> = {
  name: 'SignaturePad',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","disabled","readOnly","required"],
  contextKey: Symbol('uifn.SignaturePad'),
  createController: createSignaturePadController as never,
};
