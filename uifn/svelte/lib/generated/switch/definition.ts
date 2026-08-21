import { createSwitchController, type SwitchProps } from '@uifn/core/primitives/switch';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const SwitchDefinition: SveltePrimitiveDefinition<SwitchProps> = {
  name: 'Switch',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["checked","defaultChecked","name","value","disabled","readOnly","required"],
  contextKey: Symbol('uifn.Switch'),
  createController: createSwitchController as never,
};
