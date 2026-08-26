'use client';

import * as React from 'react';
import { createSegmentGroupController, type SegmentGroupProps, type SegmentGroupController } from '@uifn/core/primitives/segment-group';
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

const SegmentGroupContext = React.createContext<ReactPrimitiveBridge<SegmentGroupProps> | null>(null);
const SegmentGroupDefinition: ReactPrimitiveDefinition<SegmentGroupProps> = {
  name: 'SegmentGroup',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","orientation","disabled","readOnly","required"],
  context: SegmentGroupContext,
  createController: createSegmentGroupController as never,
};

export type SegmentGroupRootProps = ReactPrimitiveRootProps<SegmentGroupProps, 'div'>;
export const SegmentGroupRoot = React.forwardRef<React.ElementRef<'div'>, SegmentGroupRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={SegmentGroupDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SegmentGroupRoot.displayName = 'SegmentGroupRoot';

export type SegmentGroupLabelProps = ReactPrimitivePartProps<SegmentGroupController['parts']['label'], 'span', false>;
export const SegmentGroupLabel = React.forwardRef<React.ElementRef<'span'>, SegmentGroupLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={SegmentGroupDefinition as never} part="label" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SegmentGroupLabel.displayName = 'SegmentGroupLabel';

export type SegmentGroupItemProps = ReactPrimitivePartProps<SegmentGroupController['parts']['item'], 'button', true>;
export const SegmentGroupItem = React.forwardRef<React.ElementRef<'button'>, SegmentGroupItemProps>((props, ref) => (
  <ReactPrimitivePart definition={SegmentGroupDefinition as never} part="item" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SegmentGroupItem.displayName = 'SegmentGroupItem';

export type SegmentGroupItemTextProps = ReactPrimitivePartProps<SegmentGroupController['parts']['itemText'], 'span', true>;
export const SegmentGroupItemText = React.forwardRef<React.ElementRef<'span'>, SegmentGroupItemTextProps>((props, ref) => (
  <ReactPrimitivePart definition={SegmentGroupDefinition as never} part="itemText" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SegmentGroupItemText.displayName = 'SegmentGroupItemText';

export type SegmentGroupIndicatorProps = ReactPrimitivePartProps<SegmentGroupController['parts']['indicator'], 'div', false>;
export const SegmentGroupIndicator = React.forwardRef<React.ElementRef<'div'>, SegmentGroupIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={SegmentGroupDefinition as never} part="indicator" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SegmentGroupIndicator.displayName = 'SegmentGroupIndicator';

export type SegmentGroupHiddenInputProps = ReactPrimitivePartProps<SegmentGroupController['parts']['hiddenInput'], 'input', false>;
export const SegmentGroupHiddenInput = React.forwardRef<React.ElementRef<'input'>, SegmentGroupHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={SegmentGroupDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SegmentGroupHiddenInput.displayName = 'SegmentGroupHiddenInput';

export const SegmentGroupProvider = SegmentGroupRoot;
export function useSegmentGroup(inputs: SegmentGroupProps = {} as SegmentGroupProps): ReactPrimitiveHookResult<SegmentGroupController['state'], SegmentGroupController['actions']> {
  return useReactPrimitive(SegmentGroupDefinition, inputs) as ReactPrimitiveHookResult<SegmentGroupController['state'], SegmentGroupController['actions']>;
}
export const SegmentGroup = Object.assign(SegmentGroupRoot, { Provider: SegmentGroupProvider, Root: SegmentGroupRoot, Label: SegmentGroupLabel, Item: SegmentGroupItem, ItemText: SegmentGroupItemText, Indicator: SegmentGroupIndicator, HiddenInput: SegmentGroupHiddenInput });
