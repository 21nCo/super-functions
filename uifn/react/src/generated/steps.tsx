'use client';

import * as React from 'react';
import { createStepsController, type StepsProps, type StepsController } from '@uifn/core/primitives/steps';
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

const StepsContext = React.createContext<ReactPrimitiveBridge<StepsProps> | null>(null);
const StepsDefinition: ReactPrimitiveDefinition<StepsProps> = {
  name: 'Steps',
  family: 'status-feedback',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["step","defaultStep","count","orientation","linear"],
  context: StepsContext,
  createController: createStepsController as never,
};

export type StepsRootProps = ReactPrimitiveRootProps<StepsProps, 'nav'>;
export const StepsRoot = React.forwardRef<React.ElementRef<'nav'>, StepsRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={StepsDefinition} element="nav" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
StepsRoot.displayName = 'StepsRoot';

export type StepsListProps = ReactPrimitivePartProps<StepsController['parts']['list'], 'ol', false>;
export const StepsList = React.forwardRef<React.ElementRef<'ol'>, StepsListProps>((props, ref) => (
  <ReactPrimitivePart definition={StepsDefinition as never} part="list" element="ol" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
StepsList.displayName = 'StepsList';

export type StepsItemProps = ReactPrimitivePartProps<StepsController['parts']['item'], 'li', true>;
export const StepsItem = React.forwardRef<React.ElementRef<'li'>, StepsItemProps>((props, ref) => (
  <ReactPrimitivePart definition={StepsDefinition as never} part="item" element="li" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
StepsItem.displayName = 'StepsItem';

export type StepsTriggerProps = ReactPrimitivePartProps<StepsController['parts']['trigger'], 'button', true>;
export const StepsTrigger = React.forwardRef<React.ElementRef<'button'>, StepsTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={StepsDefinition as never} part="trigger" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
StepsTrigger.displayName = 'StepsTrigger';

export type StepsIndicatorProps = ReactPrimitivePartProps<StepsController['parts']['indicator'], 'span', true>;
export const StepsIndicator = React.forwardRef<React.ElementRef<'span'>, StepsIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={StepsDefinition as never} part="indicator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
StepsIndicator.displayName = 'StepsIndicator';

export type StepsSeparatorProps = ReactPrimitivePartProps<StepsController['parts']['separator'], 'span', true>;
export const StepsSeparator = React.forwardRef<React.ElementRef<'span'>, StepsSeparatorProps>((props, ref) => (
  <ReactPrimitivePart definition={StepsDefinition as never} part="separator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
StepsSeparator.displayName = 'StepsSeparator';

export type StepsContentProps = ReactPrimitivePartProps<StepsController['parts']['content'], 'div', true>;
export const StepsContent = React.forwardRef<React.ElementRef<'div'>, StepsContentProps>((props, ref) => (
  <ReactPrimitivePart definition={StepsDefinition as never} part="content" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
StepsContent.displayName = 'StepsContent';

export type StepsCompletedProps = ReactPrimitivePartProps<StepsController['parts']['completed'], 'span', true>;
export const StepsCompleted = React.forwardRef<React.ElementRef<'span'>, StepsCompletedProps>((props, ref) => (
  <ReactPrimitivePart definition={StepsDefinition as never} part="completed" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
StepsCompleted.displayName = 'StepsCompleted';

export const StepsProvider = StepsRoot;
export function useSteps(inputs: StepsProps): ReactPrimitiveHookResult<StepsController['state'], StepsController['actions']> {
  return useReactPrimitive(StepsDefinition, inputs) as ReactPrimitiveHookResult<StepsController['state'], StepsController['actions']>;
}
export const Steps = Object.assign(StepsRoot, { Provider: StepsProvider, Root: StepsRoot, List: StepsList, Item: StepsItem, Trigger: StepsTrigger, Indicator: StepsIndicator, Separator: StepsSeparator, Content: StepsContent, Completed: StepsCompleted });
