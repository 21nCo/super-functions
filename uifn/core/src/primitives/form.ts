import { createUIFnPartId } from '../algorithms/id';
import type { UIFnPartProps } from '../parts';
import { defineUIFnStaticContract, freezeUIFnParts } from './static-contract';

export interface FormProps { readonly noValidate?: boolean; readonly disabled?: boolean; readonly invalid?: boolean; }
export interface FormState { readonly disabled: boolean; readonly invalid: boolean; readonly status: 'valid' | 'invalid' | 'disabled'; }
export interface FormContractParts { readonly root: UIFnPartProps; readonly errorSummary: UIFnPartProps; readonly actions: UIFnPartProps; }

export const FormContract = defineUIFnStaticContract<FormProps, FormState, FormContractParts>({
  kind: 'typed-static-contract', name: 'Form',
  anatomy: [{ name: 'root', element: 'form', cardinality: 'one' }, { name: 'errorSummary', element: 'div', cardinality: 'one' }, { name: 'actions', element: 'div', cardinality: 'one' }],
  getState(inputs) {
    const disabled = Boolean(inputs.disabled); const invalid = Boolean(inputs.invalid);
    return Object.freeze({ disabled, invalid, status: disabled ? 'disabled' : invalid ? 'invalid' : 'valid' });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs); const summaryId = createUIFnPartId(context.scopeId, 'form', 'error-summary');
    return freezeUIFnParts({
      root: { id: createUIFnPartId(context.scopeId, 'form', 'root'), attributes: { novalidate: Boolean(inputs.noValidate) }, aria: { describedby: state.invalid ? summaryId : undefined }, data: { state: state.status, disabled: state.disabled } },
      errorSummary: { id: summaryId, role: state.invalid ? 'alert' : undefined, tabIndex: state.invalid ? -1 : undefined, hidden: !state.invalid },
      actions: { data: { disabled: state.disabled } },
    });
  },
});
export type FormContract = typeof FormContract;
