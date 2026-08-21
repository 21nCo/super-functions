import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnSelectionPrimitiveController, type UIFnSelectionActions, type UIFnSelectionInputs, type UIFnSelectionItem, type UIFnSelectionPart, type UIFnSelectionState } from './selection-control';

export interface SelectOption extends UIFnSelectionItem<string> { readonly value: string; readonly label: string }
export interface SelectGroup { readonly label: string; readonly options: readonly SelectOption[] }
export type SelectOptionInput = string | SelectOption;
export interface SelectProps<TItem = SelectOptionInput> extends UIFnSelectionInputs<TItem> { readonly groups?: readonly SelectGroup[]; readonly idBase?: string }
export type SelectState = UIFnSelectionState;
export type SelectControllerState = SelectState;
export type SelectActions<TItem = SelectOptionInput> = UIFnSelectionActions<TItem>;
export type SelectControllerActions = SelectActions;
export interface SelectIds { readonly baseId: string; readonly triggerId: string; readonly contentId: string; readonly labelId: string; readonly hiddenInputId: string; readonly optionIds: Readonly<Record<string, string>> }
export interface SelectControllerParts { root: UIFnSelectionPart; label: UIFnSelectionPart; control: UIFnSelectionPart; trigger: UIFnSelectionPart; valueText: UIFnSelectionPart; clear: UIFnSelectionPart; positioner: UIFnSelectionPart; content: UIFnSelectionPart; item: UIFnSelectionPart; itemText: UIFnSelectionPart; itemIndicator: UIFnSelectionPart; group: UIFnSelectionPart; groupLabel: UIFnSelectionPart; hiddenInput: UIFnSelectionPart }
export type SelectController<TItem = SelectOptionInput> = UIFnController<SelectState, SelectActions<TItem>, SelectControllerParts, SelectProps<TItem>>;
export function createSelectController<TItem = SelectOptionInput>(props: SelectProps<TItem> = {}, env: UIFnEnvironment = {}): SelectController<TItem> {
  const groupedItems = props.groups?.flatMap((group) => group.options.map((option) => ({ ...option, group: group.label })));
  return createUIFnSelectionPrimitiveController({ primitive: 'Select', slug: 'select', anatomy: ['root', 'label', 'control', 'trigger', 'valueText', 'clear', 'positioner', 'content', 'item', 'itemText', 'itemIndicator', 'group', 'groupLabel', 'hiddenInput'], mode: props.multiple ? 'multiple' : 'single', itemPart: 'item', itemRole: 'option', contentRole: 'listbox', selectionAria: 'selected', activation: props.multiple ? 'toggle' : 'select', closeOnSelect: true, triggerRole: 'combobox' }, { ...props, items: props.items ?? groupedItems as readonly TItem[] | undefined }, env) as unknown as SelectController<TItem>;
}
