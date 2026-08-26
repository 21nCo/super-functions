'use client';

import * as React from 'react';
import { createToggleGroupController, type ToggleGroupProps, type ToggleGroupController } from '@uifn/core/primitives/toggle-group';
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

const ToggleGroupContext = React.createContext<ReactPrimitiveBridge<ToggleGroupProps> | null>(null);
const ToggleGroupDefinition: ReactPrimitiveDefinition<ToggleGroupProps> = {
  name: 'ToggleGroup',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","type","orientation","loop","disabled"],
  context: ToggleGroupContext,
  createController: createToggleGroupController as never,
};

export type ToggleGroupRootProps = ReactPrimitiveRootProps<ToggleGroupProps, 'div'>;
export const ToggleGroupRoot = React.forwardRef<React.ElementRef<'div'>, ToggleGroupRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ToggleGroupDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToggleGroupRoot.displayName = 'ToggleGroupRoot';

export type ToggleGroupItemProps = ReactPrimitivePartProps<ToggleGroupController['parts']['item'], 'button', true>;
export const ToggleGroupItem = React.forwardRef<React.ElementRef<'button'>, ToggleGroupItemProps>((props, ref) => (
  <ReactPrimitivePart definition={ToggleGroupDefinition as never} part="item" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToggleGroupItem.displayName = 'ToggleGroupItem';

export const ToggleGroupProvider = ToggleGroupRoot;
export function useToggleGroup(inputs: ToggleGroupProps = {} as ToggleGroupProps): ReactPrimitiveHookResult<ToggleGroupController['state'], ToggleGroupController['actions']> {
  return useReactPrimitive(ToggleGroupDefinition, inputs) as ReactPrimitiveHookResult<ToggleGroupController['state'], ToggleGroupController['actions']>;
}
export const ToggleGroup = Object.assign(ToggleGroupRoot, { Provider: ToggleGroupProvider, Root: ToggleGroupRoot, Item: ToggleGroupItem });
