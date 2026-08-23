import { createContext, type JSX } from 'solid-js';
import { createTourController, type TourProps, type TourController } from '@uifn/core/primitives/tour';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const TourContext = createContext<SolidPrimitiveContextValue<TourProps>>();
export const TourDefinition: SolidPrimitiveDefinition<TourProps> = {
  name: 'Tour',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","step","defaultStep","steps","modal"],
  context: TourContext,
  createController: createTourController as never,
};

function TourRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TourRootProps = SolidPrimitiveRootProps<TourProps, 'div'>;
export function TourRoot(props: TourRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={TourDefinition} element="div" renderElement={TourRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function TourPortalElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TourPortalProps = SolidPrimitivePartProps<TourController['parts']['portal'], 'div', false>;
export function TourPortal(props: TourPortalProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TourDefinition as never}
      part="portal"
      element="div"
      renderElement={TourPortalElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TourBackdropElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TourBackdropProps = SolidPrimitivePartProps<TourController['parts']['backdrop'], 'div', false>;
export function TourBackdrop(props: TourBackdropProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TourDefinition as never}
      part="backdrop"
      element="div"
      renderElement={TourBackdropElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TourSpotlightElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TourSpotlightProps = SolidPrimitivePartProps<TourController['parts']['spotlight'], 'div', false>;
export function TourSpotlight(props: TourSpotlightProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TourDefinition as never}
      part="spotlight"
      element="div"
      renderElement={TourSpotlightElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TourPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TourPositionerProps = SolidPrimitivePartProps<TourController['parts']['positioner'], 'div', false>;
export function TourPositioner(props: TourPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TourDefinition as never}
      part="positioner"
      element="div"
      renderElement={TourPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TourContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TourContentProps = SolidPrimitivePartProps<TourController['parts']['content'], 'div', false>;
export function TourContent(props: TourContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TourDefinition as never}
      part="content"
      element="div"
      renderElement={TourContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TourTitleElement(props: JSX.IntrinsicElements['h2']): JSX.Element {
  return <h2 {...props} />;
}

export type TourTitleProps = SolidPrimitivePartProps<TourController['parts']['title'], 'h2', false>;
export function TourTitle(props: TourTitleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TourDefinition as never}
      part="title"
      element="h2"
      renderElement={TourTitleElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TourDescriptionElement(props: JSX.IntrinsicElements['p']): JSX.Element {
  return <p {...props} />;
}

export type TourDescriptionProps = SolidPrimitivePartProps<TourController['parts']['description'], 'p', false>;
export function TourDescription(props: TourDescriptionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TourDefinition as never}
      part="description"
      element="p"
      renderElement={TourDescriptionElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TourPreviousElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type TourPreviousProps = SolidPrimitivePartProps<TourController['parts']['previous'], 'button', false>;
export function TourPrevious(props: TourPreviousProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TourDefinition as never}
      part="previous"
      element="button"
      renderElement={TourPreviousElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TourNextElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type TourNextProps = SolidPrimitivePartProps<TourController['parts']['next'], 'button', false>;
export function TourNext(props: TourNextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TourDefinition as never}
      part="next"
      element="button"
      renderElement={TourNextElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TourSkipElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type TourSkipProps = SolidPrimitivePartProps<TourController['parts']['skip'], 'button', false>;
export function TourSkip(props: TourSkipProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TourDefinition as never}
      part="skip"
      element="button"
      renderElement={TourSkipElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TourCloseElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type TourCloseProps = SolidPrimitivePartProps<TourController['parts']['close'], 'button', false>;
export function TourClose(props: TourCloseProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TourDefinition as never}
      part="close"
      element="button"
      renderElement={TourCloseElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TourProgressElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TourProgressProps = SolidPrimitivePartProps<TourController['parts']['progress'], 'div', false>;
export function TourProgress(props: TourProgressProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TourDefinition as never}
      part="progress"
      element="div"
      renderElement={TourProgressElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const TourProvider = TourRoot;
export const Tour = /* @__PURE__ */ Object.assign(TourRoot, { Provider: TourProvider, Root: TourRoot, Portal: TourPortal, Backdrop: TourBackdrop, Spotlight: TourSpotlight, Positioner: TourPositioner, Content: TourContent, Title: TourTitle, Description: TourDescription, Previous: TourPrevious, Next: TourNext, Skip: TourSkip, Close: TourClose, Progress: TourProgress });
