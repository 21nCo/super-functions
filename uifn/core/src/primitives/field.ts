import { createUIFnPartId } from '../algorithms/id';
import type { UIFnPartProps } from '../parts';
import { defineUIFnStaticContract, freezeUIFnParts } from './static-contract';

export interface FieldProps {
  readonly name?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly invalid?: boolean;
}

export interface FieldState extends Required<Omit<FieldProps, 'name'>> {
  readonly status: 'valid' | 'invalid' | 'disabled';
}

export interface FieldContractParts {
  readonly root: UIFnPartProps;
  readonly label: UIFnPartProps;
  readonly control: UIFnPartProps;
  readonly description: UIFnPartProps;
  readonly error: UIFnPartProps;
  readonly requiredIndicator: UIFnPartProps;
}

export const FieldContract = defineUIFnStaticContract<FieldProps, FieldState, FieldContractParts>({
  kind: 'typed-static-contract', name: 'Field',
  anatomy: [
    { name: 'root', element: 'div', cardinality: 'one' },
    { name: 'label', element: 'label', cardinality: 'one' },
    { name: 'control', element: 'div', cardinality: 'one' },
    { name: 'description', element: 'div', cardinality: 'one' },
    { name: 'error', element: 'div', cardinality: 'one' },
    { name: 'requiredIndicator', element: 'span', cardinality: 'one' },
  ],
  getState(inputs) {
    const disabled = Boolean(inputs.disabled);
    const invalid = Boolean(inputs.invalid);
    return Object.freeze({ disabled, invalid, readOnly: Boolean(inputs.readOnly), required: Boolean(inputs.required), status: disabled ? 'disabled' : invalid ? 'invalid' : 'valid' });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    const controlId = createUIFnPartId(context.scopeId, 'field', 'control');
    const descriptionId = createUIFnPartId(context.scopeId, 'field', 'description');
    const errorId = createUIFnPartId(context.scopeId, 'field', 'error');
    return freezeUIFnParts({
      root: { id: createUIFnPartId(context.scopeId, 'field', 'root'), data: { state: state.status, disabled: state.disabled } },
      label: { id: createUIFnPartId(context.scopeId, 'field', 'label'), attributes: { for: controlId }, data: { disabled: state.disabled } },
      control: {
        id: controlId,
        attributes: { name: inputs.name, readonly: state.readOnly, required: state.required },
        aria: { invalid: state.invalid, describedby: state.invalid ? `${descriptionId} ${errorId}` : descriptionId, errormessage: state.invalid ? errorId : undefined },
        data: { state: state.status }, disabled: state.disabled,
      },
      description: { id: descriptionId },
      error: { id: errorId, role: state.invalid ? 'alert' : undefined, hidden: !state.invalid },
      requiredIndicator: { aria: { hidden: true }, hidden: !state.required },
    });
  },
});

export type FieldContract = typeof FieldContract;
