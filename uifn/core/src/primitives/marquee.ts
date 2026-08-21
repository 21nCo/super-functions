import { createUIFnPartId } from '../algorithms/id';
import type { UIFnPartProps } from '../parts';
import { defineUIFnStaticContract, freezeUIFnParts } from './static-contract';

export interface MarqueeProps {
  readonly direction?: 'left' | 'right' | 'up' | 'down'; readonly speed?: number; readonly pauseOnHover?: boolean;
  readonly pauseOnFocus?: boolean; readonly reducedMotionBehavior?: 'stop' | 'slow'; readonly reducedMotion?: boolean;
}
export interface MarqueeState { readonly status: 'running' | 'paused'; readonly duration: number; readonly direction: NonNullable<MarqueeProps['direction']>; }
export interface MarqueeContractParts { readonly root: UIFnPartProps; readonly viewport: UIFnPartProps; readonly track: UIFnPartProps; readonly item: (index: number) => UIFnPartProps; }

export const MarqueeContract = defineUIFnStaticContract<MarqueeProps, MarqueeState, MarqueeContractParts>({
  kind: 'typed-static-contract', name: 'Marquee',
  anatomy: [{ name: 'root', element: 'div', cardinality: 'one' }, { name: 'viewport', element: 'div', cardinality: 'one' }, { name: 'track', element: 'div', cardinality: 'one' }, { name: 'item', element: 'div', cardinality: 'many' }],
  getState(inputs) {
    const speed = Math.max(1, inputs.speed ?? 50); const paused = Boolean(inputs.reducedMotion && (inputs.reducedMotionBehavior ?? 'stop') === 'stop');
    return Object.freeze({ status: paused ? 'paused' : 'running', duration: inputs.reducedMotion ? 100 / speed * 10 : 100 / speed, direction: inputs.direction ?? 'left' });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    return freezeUIFnParts({
      root: { id: createUIFnPartId(context.scopeId, 'marquee', 'root'), data: { state: state.status, direction: state.direction, pauseOnHover: inputs.pauseOnHover, pauseOnFocus: inputs.pauseOnFocus } },
      viewport: { attributes: { tabindex: inputs.pauseOnFocus ? 0 : undefined } },
      track: { data: { state: state.status }, style: { animationDuration: `${state.duration}s`, animationPlayState: state.status === 'paused' ? 'paused' : 'running' } },
      item: (index: number) => ({ id: createUIFnPartId(context.scopeId, 'marquee', 'item', index) }),
    });
  },
});
export type MarqueeContract = typeof MarqueeContract;
