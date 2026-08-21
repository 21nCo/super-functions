import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnSelectionPrimitiveController, type UIFnSelectionActions, type UIFnSelectionInputs, type UIFnSelectionItemInput, type UIFnSelectionPart, type UIFnSelectionState } from './selection-control';

export type ToggleGroupType = 'single' | 'multiple';
export interface ToggleGroupProps<TItem = UIFnSelectionItemInput> extends Omit<UIFnSelectionInputs<TItem>, 'multiple'> { readonly type?: ToggleGroupType }
export type ToggleGroupState = UIFnSelectionState;
export type ToggleGroupActions = UIFnSelectionActions;
export interface ToggleGroupControllerParts { root: UIFnSelectionPart; item: UIFnSelectionPart }
export type ToggleGroupController<TItem = UIFnSelectionItemInput> = UIFnController<ToggleGroupState, UIFnSelectionActions<TItem>, ToggleGroupControllerParts, ToggleGroupProps<TItem>>;
export function createToggleGroupController<TItem = UIFnSelectionItemInput>(props: ToggleGroupProps<TItem> = {}, env: UIFnEnvironment = {}): ToggleGroupController<TItem> {
  const multiple = props.type === 'multiple';
  return createUIFnSelectionPrimitiveController({ primitive: 'ToggleGroup', slug: 'toggle-group', anatomy: ['root', 'item'], mode: multiple ? 'multiple' : 'single', rootRole: 'group', itemPart: 'item', itemRole: 'button', selectionAria: 'pressed', activation: 'toggle' }, { ...props, multiple }, env) as unknown as ToggleGroupController<TItem>;
}
