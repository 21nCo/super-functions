import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnSelectionPrimitiveController, type UIFnSelectionActions, type UIFnSelectionInputs, type UIFnSelectionItemInput, type UIFnSelectionPart, type UIFnSelectionState } from './selection-control';

export interface SegmentGroupProps<TItem = UIFnSelectionItemInput> extends Omit<UIFnSelectionInputs<TItem>, 'multiple'> {}
export interface SegmentGroupParts { root: UIFnSelectionPart; label: UIFnSelectionPart; item: UIFnSelectionPart; itemText: UIFnSelectionPart; indicator: UIFnSelectionPart; hiddenInput: UIFnSelectionPart }
export type SegmentGroupController<TItem = UIFnSelectionItemInput> = UIFnController<UIFnSelectionState, UIFnSelectionActions<TItem>, SegmentGroupParts, SegmentGroupProps<TItem>>;
export function createSegmentGroupController<TItem = UIFnSelectionItemInput>(props: SegmentGroupProps<TItem> = {}, env: UIFnEnvironment = {}): SegmentGroupController<TItem> {
  return createUIFnSelectionPrimitiveController({ primitive: 'SegmentGroup', slug: 'segment-group', anatomy: ['root', 'label', 'item', 'itemText', 'indicator', 'hiddenInput'], mode: 'single', rootRole: 'radiogroup', itemPart: 'item', itemRole: 'radio', selectionAria: 'checked' }, { ...props, multiple: false, nullable: props.nullable ?? false }, env) as unknown as SegmentGroupController<TItem>;
}
