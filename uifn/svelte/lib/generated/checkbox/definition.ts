import { createCheckboxController, type CheckboxProps } from '@uifn/core/primitives/checkbox';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const CheckboxDefinition: SveltePrimitiveDefinition<CheckboxProps> = {
  name: 'Checkbox',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["checked","defaultChecked","name","value","disabled","readOnly","required"],
  contextKey: Symbol('uifn.Checkbox'),
  createController: createCheckboxController as never,
};
