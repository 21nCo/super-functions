'use client';

import * as React from 'react';
import { createTourController, type TourProps, type TourController } from '@uifn/core/primitives/tour';
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

const TourContext = React.createContext<ReactPrimitiveBridge<TourProps> | null>(null);
const TourDefinition: ReactPrimitiveDefinition<TourProps> = {
  name: 'Tour',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","step","defaultStep","steps","modal"],
  context: TourContext,
  createController: createTourController as never,
};

export type TourRootProps = ReactPrimitiveRootProps<TourProps, 'div'>;
export const TourRoot = React.forwardRef<React.ElementRef<'div'>, TourRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={TourDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourRoot.displayName = 'TourRoot';

export type TourPortalProps = ReactPrimitivePartProps<TourController['parts']['portal'], 'div', false>;
export const TourPortal = React.forwardRef<React.ElementRef<'div'>, TourPortalProps>((props, ref) => (
  <ReactPrimitivePart definition={TourDefinition as never} part="portal" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourPortal.displayName = 'TourPortal';

export type TourBackdropProps = ReactPrimitivePartProps<TourController['parts']['backdrop'], 'div', false>;
export const TourBackdrop = React.forwardRef<React.ElementRef<'div'>, TourBackdropProps>((props, ref) => (
  <ReactPrimitivePart definition={TourDefinition as never} part="backdrop" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourBackdrop.displayName = 'TourBackdrop';

export type TourSpotlightProps = ReactPrimitivePartProps<TourController['parts']['spotlight'], 'div', false>;
export const TourSpotlight = React.forwardRef<React.ElementRef<'div'>, TourSpotlightProps>((props, ref) => (
  <ReactPrimitivePart definition={TourDefinition as never} part="spotlight" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourSpotlight.displayName = 'TourSpotlight';

export type TourPositionerProps = ReactPrimitivePartProps<TourController['parts']['positioner'], 'div', false>;
export const TourPositioner = React.forwardRef<React.ElementRef<'div'>, TourPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={TourDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourPositioner.displayName = 'TourPositioner';

export type TourContentProps = ReactPrimitivePartProps<TourController['parts']['content'], 'div', false>;
export const TourContent = React.forwardRef<React.ElementRef<'div'>, TourContentProps>((props, ref) => (
  <ReactPrimitivePart definition={TourDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourContent.displayName = 'TourContent';

export type TourTitleProps = ReactPrimitivePartProps<TourController['parts']['title'], 'h2', false>;
export const TourTitle = React.forwardRef<React.ElementRef<'h2'>, TourTitleProps>((props, ref) => (
  <ReactPrimitivePart definition={TourDefinition as never} part="title" element="h2" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourTitle.displayName = 'TourTitle';

export type TourDescriptionProps = ReactPrimitivePartProps<TourController['parts']['description'], 'p', false>;
export const TourDescription = React.forwardRef<React.ElementRef<'p'>, TourDescriptionProps>((props, ref) => (
  <ReactPrimitivePart definition={TourDefinition as never} part="description" element="p" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourDescription.displayName = 'TourDescription';

export type TourPreviousProps = ReactPrimitivePartProps<TourController['parts']['previous'], 'button', false>;
export const TourPrevious = React.forwardRef<React.ElementRef<'button'>, TourPreviousProps>((props, ref) => (
  <ReactPrimitivePart definition={TourDefinition as never} part="previous" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourPrevious.displayName = 'TourPrevious';

export type TourNextProps = ReactPrimitivePartProps<TourController['parts']['next'], 'button', false>;
export const TourNext = React.forwardRef<React.ElementRef<'button'>, TourNextProps>((props, ref) => (
  <ReactPrimitivePart definition={TourDefinition as never} part="next" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourNext.displayName = 'TourNext';

export type TourSkipProps = ReactPrimitivePartProps<TourController['parts']['skip'], 'button', false>;
export const TourSkip = React.forwardRef<React.ElementRef<'button'>, TourSkipProps>((props, ref) => (
  <ReactPrimitivePart definition={TourDefinition as never} part="skip" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourSkip.displayName = 'TourSkip';

export type TourCloseProps = ReactPrimitivePartProps<TourController['parts']['close'], 'button', false>;
export const TourClose = React.forwardRef<React.ElementRef<'button'>, TourCloseProps>((props, ref) => (
  <ReactPrimitivePart definition={TourDefinition as never} part="close" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourClose.displayName = 'TourClose';

export type TourProgressProps = ReactPrimitivePartProps<TourController['parts']['progress'], 'div', false>;
export const TourProgress = React.forwardRef<React.ElementRef<'div'>, TourProgressProps>((props, ref) => (
  <ReactPrimitivePart definition={TourDefinition as never} part="progress" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TourProgress.displayName = 'TourProgress';

export const TourProvider = TourRoot;
export function useTour(inputs: TourProps): ReactPrimitiveHookResult<TourController['state'], TourController['actions']> {
  return useReactPrimitive(TourDefinition, inputs) as ReactPrimitiveHookResult<TourController['state'], TourController['actions']>;
}
export const Tour = Object.assign(TourRoot, { Provider: TourProvider, Root: TourRoot, Portal: TourPortal, Backdrop: TourBackdrop, Spotlight: TourSpotlight, Positioner: TourPositioner, Content: TourContent, Title: TourTitle, Description: TourDescription, Previous: TourPrevious, Next: TourNext, Skip: TourSkip, Close: TourClose, Progress: TourProgress });
