import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnSelectionPrimitiveController, type UIFnSelectionActions, type UIFnSelectionInputs, type UIFnSelectionItemInput, type UIFnSelectionPart, type UIFnSelectionState } from './selection-control';

export interface RadioGroupProps<TItem = UIFnSelectionItemInput> extends Omit<UIFnSelectionInputs<TItem>, 'multiple'> {}
export type RadioGroupState = UIFnSelectionState;
export type RadioGroupActions = UIFnSelectionActions;
export interface RadioGroupControllerParts { root: UIFnSelectionPart; label: UIFnSelectionPart; item: UIFnSelectionPart; itemControl: UIFnSelectionPart; itemIndicator: UIFnSelectionPart; hiddenInput: UIFnSelectionPart; error: UIFnSelectionPart }
export type RadioGroupController<TItem = UIFnSelectionItemInput> = UIFnController<RadioGroupState, UIFnSelectionActions<TItem>, RadioGroupControllerParts, RadioGroupProps<TItem>>;
export function createRadioGroupController<TItem = UIFnSelectionItemInput>(props: RadioGroupProps<TItem> = {}, env: UIFnEnvironment = {}): RadioGroupController<TItem> {
  return createUIFnSelectionPrimitiveController({ primitive: 'RadioGroup', slug: 'radio-group', anatomy: ['root', 'label', 'item', 'itemControl', 'itemIndicator', 'hiddenInput', 'error'], mode: 'single', rootRole: 'radiogroup', itemPart: 'itemControl', itemRole: 'radio', selectionAria: 'checked' }, { ...props, multiple: false, nullable: props.nullable ?? false }, env) as unknown as RadioGroupController<TItem>;
}
