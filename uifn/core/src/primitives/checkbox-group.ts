import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnSelectionPrimitiveController, type UIFnSelectionActions, type UIFnSelectionInputs, type UIFnSelectionItemInput, type UIFnSelectionPart, type UIFnSelectionState } from './selection-control';

export interface CheckboxGroupProps<TItem = UIFnSelectionItemInput> extends Omit<UIFnSelectionInputs<TItem>, 'multiple'> {}
export interface CheckboxGroupParts { root: UIFnSelectionPart; label: UIFnSelectionPart; item: UIFnSelectionPart; itemControl: UIFnSelectionPart; itemIndicator: UIFnSelectionPart; hiddenInput: UIFnSelectionPart; error: UIFnSelectionPart }
export type CheckboxGroupController<TItem = UIFnSelectionItemInput> = UIFnController<UIFnSelectionState, UIFnSelectionActions<TItem>, CheckboxGroupParts, CheckboxGroupProps<TItem>>;
export function createCheckboxGroupController<TItem = UIFnSelectionItemInput>(props: CheckboxGroupProps<TItem> = {}, env: UIFnEnvironment = {}): CheckboxGroupController<TItem> {
  return createUIFnSelectionPrimitiveController({ primitive: 'CheckboxGroup', slug: 'checkbox-group', anatomy: ['root', 'label', 'item', 'itemControl', 'itemIndicator', 'hiddenInput', 'error'], mode: 'multiple', itemPart: 'itemControl', itemRole: 'checkbox', selectionAria: 'checked', activation: 'toggle' }, { ...props, multiple: true }, env) as unknown as CheckboxGroupController<TItem>;
}
