import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnSelectionPrimitiveController, type UIFnSelectionActions, type UIFnSelectionInputs, type UIFnSelectionItemInput, type UIFnSelectionPart, type UIFnSelectionState } from './selection-control';

export interface ListboxProps<TItem = UIFnSelectionItemInput> extends UIFnSelectionInputs<TItem> {}
export interface ListboxParts { root: UIFnSelectionPart; label: UIFnSelectionPart; content: UIFnSelectionPart; item: UIFnSelectionPart; itemIndicator: UIFnSelectionPart; group: UIFnSelectionPart; groupLabel: UIFnSelectionPart; hiddenInput: UIFnSelectionPart }
export type ListboxController<TItem = UIFnSelectionItemInput> = UIFnController<UIFnSelectionState, UIFnSelectionActions<TItem>, ListboxParts, ListboxProps<TItem>>;
export function createListboxController<TItem = UIFnSelectionItemInput>(props: ListboxProps<TItem> = {}, env: UIFnEnvironment = {}): ListboxController<TItem> {
  return createUIFnSelectionPrimitiveController({ primitive: 'Listbox', slug: 'listbox', anatomy: ['root', 'label', 'content', 'item', 'itemIndicator', 'group', 'groupLabel', 'hiddenInput'], mode: props.multiple ? 'multiple' : 'single', itemPart: 'item', itemRole: 'option', contentRole: 'listbox', selectionAria: 'selected', activation: props.multiple ? 'toggle' : 'select' }, props, env) as unknown as ListboxController<TItem>;
}
