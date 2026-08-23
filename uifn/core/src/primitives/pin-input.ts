import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnTextInputController, type UIFnInputPart, type UIFnTextInputActions, type UIFnTextInputProps, type UIFnTextInputState } from './input-control';

export interface PinInputProps extends UIFnTextInputProps {}
export interface PinInputParts { root: UIFnInputPart; label: UIFnInputPart; control: UIFnInputPart; input: UIFnInputPart; hiddenInput: UIFnInputPart; error: UIFnInputPart }
export type PinInputController = UIFnController<UIFnTextInputState, UIFnTextInputActions, PinInputParts, PinInputProps>;
export function createPinInputController(props: PinInputProps = {}, env: UIFnEnvironment = {}): PinInputController {
  return createUIFnTextInputController<PinInputParts>({ primitive: 'PinInput', slug: 'pin-input', kind: 'pin', secret: true, anatomy: ['root', 'label', 'control', 'input', 'hiddenInput', 'error'] }, props, env);
}
