import { createComboboxController, type ComboboxProps } from '@uifn/core/primitives/combobox';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const ComboboxDefinition: SveltePrimitiveDefinition<ComboboxProps> = {
  name: 'Combobox',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","inputValue","items","multiple","name","disabled","readOnly","required"],
  contextKey: Symbol('uifn.Combobox'),
  createController: createComboboxController as never,
};
