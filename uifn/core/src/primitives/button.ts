import { createUIFnPartId } from '../algorithms/id';
import type { UIFnPartProps } from '../parts';
import { defineUIFnStaticContract, freezeUIFnParts } from './static-contract';

export interface ButtonProps {
  readonly type?: 'button' | 'submit' | 'reset';
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly pressed?: boolean;
  readonly name?: string;
  readonly value?: string;
}

export interface ButtonState {
  readonly status: 'idle' | 'pressed' | 'loading' | 'disabled';
  readonly disabled: boolean;
}

export interface ButtonContractParts {
  readonly root: UIFnPartProps;
  readonly icon: UIFnPartProps;
  readonly label: UIFnPartProps;
  readonly spinner: UIFnPartProps;
}

export const ButtonContract = defineUIFnStaticContract<ButtonProps, ButtonState, ButtonContractParts>({
  kind: 'typed-static-contract', name: 'Button',
  anatomy: [
    { name: 'root', element: 'button', cardinality: 'one' },
    { name: 'icon', element: 'span', cardinality: 'one' },
    { name: 'label', element: 'span', cardinality: 'one' },
    { name: 'spinner', element: 'span', cardinality: 'one' },
  ],
  getState(inputs) {
    const disabled = Boolean(inputs.disabled || inputs.loading);
    const status = inputs.loading ? 'loading' : inputs.disabled ? 'disabled' : inputs.pressed ? 'pressed' : 'idle';
    return Object.freeze({ status, disabled });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    return freezeUIFnParts({
      root: {
        id: createUIFnPartId(context.scopeId, 'button', 'root'),
        attributes: { type: inputs.type ?? 'button', name: inputs.name, value: inputs.value },
        aria: { busy: Boolean(inputs.loading), pressed: inputs.pressed, disabled: state.disabled },
        data: { state: state.status }, disabled: state.disabled,
      },
      icon: { aria: { hidden: true } },
      label: { data: { state: state.status } },
      spinner: { aria: { hidden: true }, data: { state: inputs.loading ? 'visible' : 'hidden' }, hidden: !inputs.loading },
    });
  },
});

export type ButtonContract = typeof ButtonContract;
