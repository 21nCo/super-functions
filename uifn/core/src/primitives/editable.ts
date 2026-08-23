import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnTextInputController, type UIFnInputPart, type UIFnTextInputActions, type UIFnTextInputProps, type UIFnTextInputState } from './input-control';

export interface EditableProps extends UIFnTextInputProps {}
export interface EditableParts { root: UIFnInputPart; label: UIFnInputPart; preview: UIFnInputPart; input: UIFnInputPart; control: UIFnInputPart; submit: UIFnInputPart; cancel: UIFnInputPart; error: UIFnInputPart; hiddenInput: UIFnInputPart }
export type EditableController = UIFnController<UIFnTextInputState, UIFnTextInputActions, EditableParts, EditableProps>;
export function createEditableController(props: EditableProps = {}, env: UIFnEnvironment = {}): EditableController {
  return createUIFnTextInputController<EditableParts>({ primitive: 'Editable', slug: 'editable', kind: 'editable', anatomy: ['root', 'label', 'preview', 'input', 'control', 'submit', 'cancel', 'error', 'hiddenInput'] }, props, env);
}
