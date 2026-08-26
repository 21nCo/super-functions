import { createPinInputController, type PinInputProps } from '@uifn/core/primitives/pin-input';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const PinInputDefinition: SveltePrimitiveDefinition<PinInputProps> = {
  name: 'PinInput',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","length","mask","otp","name","disabled","readOnly","required"],
  contextKey: Symbol('uifn.PinInput'),
  createController: createPinInputController as never,
};
