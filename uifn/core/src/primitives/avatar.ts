import { createUIFnPartId } from '../algorithms/id';
import type { UIFnPartProps } from '../parts';
import { defineUIFnStaticContract, freezeUIFnParts } from './static-contract';

export type AvatarStatus = 'loading' | 'loaded' | 'error';

export interface AvatarProps {
  readonly src?: string;
  readonly alt: string;
  readonly fallbackDelay?: number;
  readonly status?: AvatarStatus;
}

export interface AvatarState {
  readonly status: AvatarStatus;
  readonly showImage: boolean;
  readonly showFallback: boolean;
}

export interface AvatarContractParts {
  readonly root: UIFnPartProps;
  readonly image: UIFnPartProps;
  readonly fallback: UIFnPartProps;
}

export const AvatarContract = defineUIFnStaticContract<AvatarProps, AvatarState, AvatarContractParts>({
  kind: 'typed-static-contract',
  name: 'Avatar',
  anatomy: [
    { name: 'root', element: 'span', cardinality: 'one' },
    { name: 'image', element: 'img', cardinality: 'one' },
    { name: 'fallback', element: 'span', cardinality: 'one' },
  ],
  getState(inputs) {
    const status = inputs.status ?? (inputs.src ? 'loading' : 'error');
    return Object.freeze({ status, showImage: status !== 'error', showFallback: status !== 'loaded' });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    const rootId = createUIFnPartId(context.scopeId, 'avatar', 'root');
    return freezeUIFnParts({
      root: { id: rootId, data: { state: state.status } },
      image: {
        id: createUIFnPartId(context.scopeId, 'avatar', 'image'),
        attributes: { src: inputs.src, alt: inputs.alt },
        data: { state: state.status },
        hidden: !state.showImage,
      },
      fallback: {
        id: createUIFnPartId(context.scopeId, 'avatar', 'fallback'),
        aria: { hidden: !state.showFallback },
        data: { state: state.showFallback ? 'visible' : 'hidden', delay: inputs.fallbackDelay },
        hidden: !state.showFallback,
      },
    });
  },
});

export type AvatarContract = typeof AvatarContract;
