import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import {
  createUIFnSelectionPrimitiveController,
  type UIFnSelectionActions,
  type UIFnSelectionInputs,
  type UIFnSelectionPart,
  type UIFnSelectionState,
} from './selection-control';

export type CheckedState = boolean | 'indeterminate';
export interface CheckboxProps extends Omit<UIFnSelectionInputs, 'items' | 'value' | 'defaultValue' | 'multiple' | 'onValueChange'> {
  readonly checked?: CheckedState;
  readonly defaultChecked?: CheckedState;
  readonly value?: string;
  readonly onCheckedChange?: (checked: CheckedState) => void;
}
export type CheckboxState = UIFnSelectionState;
export type CheckboxControllerState = CheckboxState;
export type CheckboxActions = UIFnSelectionActions;
export type CheckboxControllerActions = CheckboxActions;
export interface CheckboxControllerParts {
  root: UIFnSelectionPart;
  control: UIFnSelectionPart;
  indicator: UIFnSelectionPart;
  label: UIFnSelectionPart;
  hiddenInput: UIFnSelectionPart;
}
export interface CheckboxControllerIds { readonly rootId: string; readonly controlId: string; readonly inputId: string }
export type CheckboxController = UIFnController<CheckboxState, CheckboxActions, CheckboxControllerParts, CheckboxProps>;

export function createCheckboxController(props: CheckboxProps = {}, env: UIFnEnvironment = {}): CheckboxController {
  const { value: formValue = 'on', ...inputs } = props;
  return createUIFnSelectionPrimitiveController({
    primitive: 'Checkbox', slug: 'checkbox', anatomy: ['root', 'control', 'indicator', 'label', 'hiddenInput'],
    mode: 'single', itemPart: 'control', itemRole: 'checkbox', selectionAria: 'checked', activation: 'toggle', booleanAlias: 'checked',
  }, {
    ...inputs,
    items: [{ id: 'on', value: formValue, serializedValue: formValue }],
    nullable: true,
  }, env) as unknown as CheckboxController;
}
