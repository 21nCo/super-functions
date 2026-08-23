'use client';

import * as React from 'react';
import { createRatingGroupController, type RatingGroupProps, type RatingGroupController } from '@uifn/core/primitives/rating-group';
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

const RatingGroupContext = React.createContext<ReactPrimitiveBridge<RatingGroupProps> | null>(null);
const RatingGroupDefinition: ReactPrimitiveDefinition<RatingGroupProps> = {
  name: 'RatingGroup',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","count","allowHalf","name","disabled","readOnly","required"],
  context: RatingGroupContext,
  createController: createRatingGroupController as never,
};

export type RatingGroupRootProps = ReactPrimitiveRootProps<RatingGroupProps, 'div'>;
export const RatingGroupRoot = React.forwardRef<React.ElementRef<'div'>, RatingGroupRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={RatingGroupDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RatingGroupRoot.displayName = 'RatingGroupRoot';

export type RatingGroupLabelProps = ReactPrimitivePartProps<RatingGroupController['parts']['label'], 'label', false>;
export const RatingGroupLabel = React.forwardRef<React.ElementRef<'label'>, RatingGroupLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={RatingGroupDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RatingGroupLabel.displayName = 'RatingGroupLabel';

export type RatingGroupControlProps = ReactPrimitivePartProps<RatingGroupController['parts']['control'], 'div', false>;
export const RatingGroupControl = React.forwardRef<React.ElementRef<'div'>, RatingGroupControlProps>((props, ref) => (
  <ReactPrimitivePart definition={RatingGroupDefinition as never} part="control" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RatingGroupControl.displayName = 'RatingGroupControl';

export type RatingGroupItemProps = ReactPrimitivePartProps<RatingGroupController['parts']['item'], 'button', true>;
export const RatingGroupItem = React.forwardRef<React.ElementRef<'button'>, RatingGroupItemProps>((props, ref) => (
  <ReactPrimitivePart definition={RatingGroupDefinition as never} part="item" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RatingGroupItem.displayName = 'RatingGroupItem';

export type RatingGroupItemIndicatorProps = ReactPrimitivePartProps<RatingGroupController['parts']['itemIndicator'], 'span', true>;
export const RatingGroupItemIndicator = React.forwardRef<React.ElementRef<'span'>, RatingGroupItemIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={RatingGroupDefinition as never} part="itemIndicator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RatingGroupItemIndicator.displayName = 'RatingGroupItemIndicator';

export type RatingGroupHiddenInputProps = ReactPrimitivePartProps<RatingGroupController['parts']['hiddenInput'], 'input', false>;
export const RatingGroupHiddenInput = React.forwardRef<React.ElementRef<'input'>, RatingGroupHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={RatingGroupDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RatingGroupHiddenInput.displayName = 'RatingGroupHiddenInput';

export type RatingGroupValueTextProps = ReactPrimitivePartProps<RatingGroupController['parts']['valueText'], 'span', false>;
export const RatingGroupValueText = React.forwardRef<React.ElementRef<'span'>, RatingGroupValueTextProps>((props, ref) => (
  <ReactPrimitivePart definition={RatingGroupDefinition as never} part="valueText" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RatingGroupValueText.displayName = 'RatingGroupValueText';

export const RatingGroupProvider = RatingGroupRoot;
export function useRatingGroup(inputs: RatingGroupProps = {} as RatingGroupProps): ReactPrimitiveHookResult<RatingGroupController['state'], RatingGroupController['actions']> {
  return useReactPrimitive(RatingGroupDefinition, inputs) as ReactPrimitiveHookResult<RatingGroupController['state'], RatingGroupController['actions']>;
}
export const RatingGroup = Object.assign(RatingGroupRoot, { Provider: RatingGroupProvider, Root: RatingGroupRoot, Label: RatingGroupLabel, Control: RatingGroupControl, Item: RatingGroupItem, ItemIndicator: RatingGroupItemIndicator, HiddenInput: RatingGroupHiddenInput, ValueText: RatingGroupValueText });
