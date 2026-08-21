import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnSelectionPrimitiveController, type UIFnSelectionActions, type UIFnSelectionInputs, type UIFnSelectionPart, type UIFnSelectionState } from './selection-control';

export interface ToggleProps extends Omit<UIFnSelectionInputs, 'items' | 'value' | 'defaultValue' | 'multiple' | 'onValueChange'> { readonly pressed?: boolean; readonly defaultPressed?: boolean; readonly onPressedChange?: (pressed: boolean) => void }
export type ToggleState = UIFnSelectionState;
export type ToggleActions = UIFnSelectionActions;
export interface ToggleControllerParts { root: UIFnSelectionPart }
export type ToggleController = UIFnController<ToggleState, ToggleActions, ToggleControllerParts, ToggleProps>;
export function createToggleController(props: ToggleProps = {}, env: UIFnEnvironment = {}): ToggleController {
  return createUIFnSelectionPrimitiveController({ primitive: 'Toggle', slug: 'toggle', anatomy: ['root'], mode: 'single', itemPart: 'root', itemRole: 'button', selectionAria: 'pressed', activation: 'toggle', booleanAlias: 'pressed' }, { ...props, items: ['on'], nullable: true }, env) as unknown as ToggleController;
}
