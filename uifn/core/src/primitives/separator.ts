import { createUIFnPartId } from '../algorithms/id';
import type { UIFnPartProps } from '../parts';
import { defineUIFnStaticContract, freezeUIFnParts } from './static-contract';

export interface SeparatorProps { readonly orientation?: 'horizontal' | 'vertical'; readonly decorative?: boolean; }
export interface SeparatorState { readonly orientation: 'horizontal' | 'vertical'; readonly decorative: boolean; readonly status: 'ready'; }
export interface SeparatorContractParts { readonly root: UIFnPartProps; }

export const SeparatorContract = defineUIFnStaticContract<SeparatorProps, SeparatorState, SeparatorContractParts>({
  kind: 'typed-static-contract', name: 'Separator', anatomy: [{ name: 'root', element: 'div', cardinality: 'one' }],
  getState(inputs) { return Object.freeze({ orientation: inputs.orientation ?? 'horizontal', decorative: Boolean(inputs.decorative), status: 'ready' }); },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    return freezeUIFnParts({ root: {
      id: createUIFnPartId(context.scopeId, 'separator', 'root'), role: state.decorative ? 'presentation' : 'separator',
      aria: state.decorative ? { hidden: true } : { orientation: state.orientation }, data: { orientation: state.orientation, decorative: state.decorative },
    } });
  },
});
export type SeparatorContract = typeof SeparatorContract;
