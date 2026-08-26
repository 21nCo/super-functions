import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnTextInputController, type UIFnInputPart, type UIFnTextInputActions, type UIFnTextInputProps, type UIFnTextInputState } from './input-control';

export interface NumberInputProps extends UIFnTextInputProps {}
export interface NumberInputParts { root: UIFnInputPart; label: UIFnInputPart; control: UIFnInputPart; input: UIFnInputPart; increment: UIFnInputPart; decrement: UIFnInputPart; scrubber: UIFnInputPart; hiddenInput: UIFnInputPart; error: UIFnInputPart }
export type NumberInputController = UIFnController<UIFnTextInputState, UIFnTextInputActions, NumberInputParts, NumberInputProps>;
export function createNumberInputController(props: NumberInputProps = {}, env: UIFnEnvironment = {}): NumberInputController {
  return createUIFnTextInputController<NumberInputParts>({ primitive: 'NumberInput', slug: 'number-input', kind: 'number', anatomy: ['root', 'label', 'control', 'input', 'increment', 'decrement', 'scrubber', 'hiddenInput', 'error'] }, props, env);
}
