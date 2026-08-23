import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnTextInputController, type UIFnInputPart, type UIFnTextInputActions, type UIFnTextInputProps, type UIFnTextInputState } from './input-control';

export interface PasswordInputProps extends UIFnTextInputProps {}
export interface PasswordInputParts { root: UIFnInputPart; label: UIFnInputPart; input: UIFnInputPart; visibilityTrigger: UIFnInputPart; strength: UIFnInputPart; error: UIFnInputPart }
export type PasswordInputController = UIFnController<UIFnTextInputState, UIFnTextInputActions, PasswordInputParts, PasswordInputProps>;
export function createPasswordInputController(props: PasswordInputProps = {}, env: UIFnEnvironment = {}): PasswordInputController {
  return createUIFnTextInputController<PasswordInputParts>({ primitive: 'PasswordInput', slug: 'password-input', kind: 'password', secret: true, anatomy: ['root', 'label', 'input', 'visibilityTrigger', 'strength', 'error'] }, props, env);
}
