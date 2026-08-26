import { createUIFnPartId } from '../algorithms/id';
import type { UIFnPartProps } from '../parts';
import { defineUIFnStaticContract, freezeUIFnParts } from './static-contract';

export interface FieldsetProps { readonly disabled?: boolean; readonly invalid?: boolean; }
export interface FieldsetState { readonly disabled: boolean; readonly invalid: boolean; readonly status: 'valid' | 'invalid' | 'disabled'; }
export interface FieldsetContractParts {
  readonly root: UIFnPartProps; readonly legend: UIFnPartProps; readonly content: UIFnPartProps;
  readonly description: UIFnPartProps; readonly error: UIFnPartProps;
}

export const FieldsetContract = defineUIFnStaticContract<FieldsetProps, FieldsetState, FieldsetContractParts>({
  kind: 'typed-static-contract', name: 'Fieldset',
  anatomy: [
    { name: 'root', element: 'fieldset', cardinality: 'one' }, { name: 'legend', element: 'legend', cardinality: 'one' },
    { name: 'content', element: 'div', cardinality: 'one' }, { name: 'description', element: 'div', cardinality: 'one' },
    { name: 'error', element: 'div', cardinality: 'one' },
  ],
  getState(inputs) {
    const disabled = Boolean(inputs.disabled); const invalid = Boolean(inputs.invalid);
    return Object.freeze({ disabled, invalid, status: disabled ? 'disabled' : invalid ? 'invalid' : 'valid' });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs); const descriptionId = createUIFnPartId(context.scopeId, 'fieldset', 'description');
    const errorId = createUIFnPartId(context.scopeId, 'fieldset', 'error');
    return freezeUIFnParts({
      root: { id: createUIFnPartId(context.scopeId, 'fieldset', 'root'), disabled: state.disabled, aria: { invalid: state.invalid, describedby: state.invalid ? `${descriptionId} ${errorId}` : descriptionId }, data: { state: state.status } },
      legend: { id: createUIFnPartId(context.scopeId, 'fieldset', 'legend') }, content: { data: { state: state.status } },
      description: { id: descriptionId }, error: { id: errorId, role: state.invalid ? 'alert' : undefined, hidden: !state.invalid },
    });
  },
});
export type FieldsetContract = typeof FieldsetContract;
