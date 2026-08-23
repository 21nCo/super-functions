import {
  createDialogController,
  type UIFnController,
  type UIFnEvent,
  type UIFnPartController,
  type UIFnPartEvent,
  type UIFnPartProps,
} from '../src/index';

// @ts-expect-error Legacy behavior constructors are intentionally absent.
import { createCombobox, StateMachine } from '../src/index';
// @ts-expect-error The former state entrypoint is intentionally absent.
import type { StateMachine as RemovedStateMachine } from '@uifn/core/state';
// @ts-expect-error Primitive implementation subpaths are intentionally absent.
import type { SelectModel as RemovedSelectModel } from '@uifn/core/primitives/select';
// @ts-expect-error Process-global ID state was intentionally removed.
import { generateId as removedGlobalGenerateId } from '../src/index';

void createCombobox;
void (undefined as unknown as StateMachine);
void (undefined as unknown as RemovedStateMachine);
void (undefined as unknown as RemovedSelectModel);
void removedGlobalGenerateId;

interface State {
  open: boolean;
}

interface Actions {
  open(): void;
}

interface Inputs {
  open?: boolean;
}

interface Event extends UIFnEvent {
  readonly type: 'OPEN';
}

type ButtonEvent = UIFnPartEvent<HTMLButtonElement> & {
  readonly currentTarget: HTMLButtonElement;
};

interface ButtonNativeProps {
  type?: 'button' | 'submit' | 'reset';
  form?: string;
  value?: string;
}

type ButtonProps = UIFnPartProps<HTMLButtonElement, ButtonEvent, ButtonNativeProps>;
declare const buttonPart: UIFnPartController<HTMLButtonElement, ButtonProps>;
buttonPart.getProps({
  type: 'button',
  form: 'profile',
  on: {
    click(event) {
      if (event?.currentTarget) event.currentTarget.disabled = true;
    },
  },
});
buttonPart.getProps({
  // @ts-expect-error The specialized native button contract does not accept anchor-only href.
  href: '/invalid',
});

declare function acceptController(
  controller: UIFnController<State, Actions, { trigger: typeof buttonPart }, Inputs, Event>,
): void;

// @ts-expect-error update is mandatory on the canonical controller surface.
acceptController({
  status: 'running',
  state: { open: false },
  snapshot: { version: 0, status: 'running', state: { open: false } },
  actions: { open() {} },
  parts: { trigger: buttonPart },
  getState: () => ({ open: false }),
  getSnapshot: () => ({ version: 0, status: 'running', state: { open: false } }),
  subscribe: () => () => undefined,
  destroy: () => undefined,
});

const dialog = createDialogController();
dialog.update({ open: true });
// @ts-expect-error Dialog inputs do not have an arbitrary value field.
dialog.update({ value: 'invalid' });
