import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnSelectionPrimitiveController, type UIFnSelectionActions, type UIFnSelectionInputs, type UIFnSelectionItem, type UIFnSelectionPart, type UIFnSelectionState } from './selection-control';

export interface ComboboxItem extends UIFnSelectionItem<string> { readonly value: string; readonly label: string }
export interface ComboboxVirtualizationOptions { readonly enabled?: boolean; readonly overscan?: number; readonly estimatedItemSize?: number }
export interface ComboboxProps extends UIFnSelectionInputs<ComboboxItem | string> { readonly filter?: (item: ComboboxItem, query: string) => boolean; readonly virtualization?: ComboboxVirtualizationOptions; readonly idBase?: string }
export type ComboboxState = UIFnSelectionState;
export type ComboboxActions = UIFnSelectionActions<ComboboxItem | string>;
export interface ComboboxIds { readonly baseId: string; readonly inputId: string; readonly contentId: string; readonly labelId: string; readonly optionIds: Readonly<Record<string, string>> }
export interface ComboboxControllerParts { root: UIFnSelectionPart; label: UIFnSelectionPart; control: UIFnSelectionPart; input: UIFnSelectionPart; trigger: UIFnSelectionPart; clear: UIFnSelectionPart; positioner: UIFnSelectionPart; content: UIFnSelectionPart; item: UIFnSelectionPart; itemIndicator: UIFnSelectionPart; empty: UIFnSelectionPart; hiddenInput: UIFnSelectionPart }
export type ComboboxController = UIFnController<ComboboxState, ComboboxActions, ComboboxControllerParts, ComboboxProps>;
export function createComboboxController(props: ComboboxProps = {}, env: UIFnEnvironment = {}): ComboboxController {
  return createUIFnSelectionPrimitiveController({ primitive: 'Combobox', slug: 'combobox', anatomy: ['root', 'label', 'control', 'input', 'trigger', 'clear', 'positioner', 'content', 'item', 'itemIndicator', 'empty', 'hiddenInput'], editable: true, itemPart: 'item', itemRole: 'option', inputRole: 'combobox', contentRole: 'listbox', selectionAria: 'selected', closeOnSelect: true }, props, env) as unknown as ComboboxController;
}
