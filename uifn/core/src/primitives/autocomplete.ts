import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnSelectionPrimitiveController, type UIFnSelectionActions, type UIFnSelectionInputs, type UIFnSelectionItem, type UIFnSelectionPart, type UIFnSelectionState } from './selection-control';

export interface AutocompleteItem extends UIFnSelectionItem<string> { readonly value: string; readonly label: string }
export interface AutocompleteProps extends UIFnSelectionInputs<AutocompleteItem | string> {}
export interface AutocompleteParts { root: UIFnSelectionPart; label: UIFnSelectionPart; control: UIFnSelectionPart; input: UIFnSelectionPart; clear: UIFnSelectionPart; positioner: UIFnSelectionPart; content: UIFnSelectionPart; item: UIFnSelectionPart; empty: UIFnSelectionPart }
export type AutocompleteController = UIFnController<UIFnSelectionState, UIFnSelectionActions<AutocompleteItem | string>, AutocompleteParts, AutocompleteProps>;
export function createAutocompleteController(props: AutocompleteProps = {}, env: UIFnEnvironment = {}): AutocompleteController {
  return createUIFnSelectionPrimitiveController({ primitive: 'Autocomplete', slug: 'autocomplete', anatomy: ['root', 'label', 'control', 'input', 'clear', 'positioner', 'content', 'item', 'empty'], editable: true, itemPart: 'item', itemRole: 'option', inputRole: 'combobox', contentRole: 'listbox', selectionAria: 'selected', closeOnSelect: true }, props, env) as unknown as AutocompleteController;
}
