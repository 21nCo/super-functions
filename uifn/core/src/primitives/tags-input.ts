import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnSelectionPrimitiveController, type UIFnSelectionActions, type UIFnSelectionInputs, type UIFnSelectionPart, type UIFnSelectionState } from './selection-control';

export interface TagsInputProps extends Omit<UIFnSelectionInputs<string>, 'multiple' | 'items'> { readonly delimiter?: string | RegExp }
export interface TagsInputParts { root: UIFnSelectionPart; label: UIFnSelectionPart; control: UIFnSelectionPart; item: UIFnSelectionPart; itemText: UIFnSelectionPart; itemDelete: UIFnSelectionPart; input: UIFnSelectionPart; clear: UIFnSelectionPart; hiddenInput: UIFnSelectionPart; error: UIFnSelectionPart }
export type TagsInputController = UIFnController<UIFnSelectionState, UIFnSelectionActions<string>, TagsInputParts, TagsInputProps>;
export function createTagsInputController(props: TagsInputProps = {}, env: UIFnEnvironment = {}): TagsInputController {
  const initial = (props.value ?? props.defaultValue ?? []) as readonly string[];
  const delimiterKey = typeof props.delimiter === 'string' && props.delimiter.length === 1
    ? props.delimiter
    : ',';
  return createUIFnSelectionPrimitiveController({
    primitive: 'TagsInput',
    slug: 'tags-input',
    anatomy: ['root', 'label', 'control', 'item', 'itemText', 'itemDelete', 'input', 'clear', 'hiddenInput', 'error'],
    mode: 'multiple',
    editable: true,
    itemPart: 'item',
    activation: 'toggle',
    inputRole: 'textbox',
    inputCommitKeys: ['Enter', delimiterKey],
  }, { ...props, items: initial, multiple: true, nullable: true }, env) as unknown as TagsInputController;
}
