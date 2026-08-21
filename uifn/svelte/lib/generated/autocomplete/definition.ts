import { createAutocompleteController, type AutocompleteProps } from '@uifn/core/primitives/autocomplete';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const AutocompleteDefinition: SveltePrimitiveDefinition<AutocompleteProps> = {
  name: 'Autocomplete',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","items","filter","disabled","readOnly"],
  contextKey: Symbol('uifn.Autocomplete'),
  createController: createAutocompleteController as never,
};
