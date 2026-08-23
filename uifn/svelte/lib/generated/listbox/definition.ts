import { createListboxController, type ListboxProps } from '@uifn/core/primitives/listbox';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const ListboxDefinition: SveltePrimitiveDefinition<ListboxProps> = {
  name: 'Listbox',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","items","multiple","orientation","name","disabled","readOnly","required"],
  contextKey: Symbol('uifn.Listbox'),
  createController: createListboxController as never,
};
