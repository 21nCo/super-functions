'use client';

import * as React from 'react';
import { createToggleController, type ToggleProps, type ToggleController } from '@uifn/core/primitives/toggle';
import {
  ReactPrimitivePart,
  ReactPrimitiveRoot,
  useReactPrimitive,
  type ReactPrimitiveBridge,
  type ReactPrimitiveDefinition,
  type ReactPrimitiveHookResult,
  type ReactPrimitivePartProps,
  type ReactPrimitiveRootProps,
} from '../internal/compound';

const ToggleContext = React.createContext<ReactPrimitiveBridge<ToggleProps> | null>(null);
const ToggleDefinition: ReactPrimitiveDefinition<ToggleProps> = {
  name: 'Toggle',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["pressed","defaultPressed","disabled"],
  context: ToggleContext,
  createController: createToggleController as never,
};

export type ToggleRootProps = ReactPrimitiveRootProps<ToggleProps, 'button'>;
export const ToggleRoot = React.forwardRef<React.ElementRef<'button'>, ToggleRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ToggleDefinition} element="button" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToggleRoot.displayName = 'ToggleRoot';



export const ToggleProvider = ToggleRoot;
export function useToggle(inputs: ToggleProps = {} as ToggleProps): ReactPrimitiveHookResult<ToggleController['state'], ToggleController['actions']> {
  return useReactPrimitive(ToggleDefinition, inputs) as ReactPrimitiveHookResult<ToggleController['state'], ToggleController['actions']>;
}
export const Toggle = Object.assign(ToggleRoot, { Provider: ToggleProvider, Root: ToggleRoot });
