import { createUIFnPartId } from '../algorithms/id';
import type { UIFnPartProps } from '../parts';
import { defineUIFnStaticContract, freezeUIFnParts } from './static-contract';

export interface InputProps {
  readonly type?: string; readonly value?: string | number; readonly defaultValue?: string | number; readonly name?: string;
  readonly disabled?: boolean; readonly readOnly?: boolean; readonly required?: boolean; readonly invalid?: boolean;
}
export interface InputState { readonly status: 'valid' | 'invalid' | 'disabled'; readonly disabled: boolean; readonly readOnly: boolean; readonly required: boolean; readonly invalid: boolean; }
export interface InputContractParts { readonly root: UIFnPartProps; }

export const InputContract = defineUIFnStaticContract<InputProps, InputState, InputContractParts>({
  kind: 'typed-static-contract', name: 'Input', anatomy: [{ name: 'root', element: 'input', cardinality: 'one' }],
  getState(inputs) {
    const disabled = Boolean(inputs.disabled); const invalid = Boolean(inputs.invalid);
    return Object.freeze({ disabled, invalid, readOnly: Boolean(inputs.readOnly), required: Boolean(inputs.required), status: disabled ? 'disabled' : invalid ? 'invalid' : 'valid' });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    return freezeUIFnParts({ root: {
      id: createUIFnPartId(context.scopeId, 'input', 'root'), disabled: state.disabled,
      attributes: { type: inputs.type ?? 'text', value: inputs.value, defaultValue: inputs.defaultValue, name: inputs.name, readonly: state.readOnly, required: state.required },
      aria: { invalid: state.invalid }, data: { state: state.status },
    } });
  },
});
export type InputContract = typeof InputContract;
