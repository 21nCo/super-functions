import { createContext, type JSX } from 'solid-js';
import { createCarouselController, type CarouselProps, type CarouselController } from '@uifn/core/primitives/carousel';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const CarouselContext = createContext<SolidPrimitiveContextValue<CarouselProps>>();
export const CarouselDefinition: SolidPrimitiveDefinition<CarouselProps> = {
  name: 'Carousel',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["index","defaultIndex","itemCount","loop","orientation","autoplayDelay"],
  context: CarouselContext,
  createController: createCarouselController as never,
};

function CarouselRootElement(props: JSX.IntrinsicElements['section']): JSX.Element {
  return <section {...props} />;
}

export type CarouselRootProps = SolidPrimitiveRootProps<CarouselProps, 'section'>;
export function CarouselRoot(props: CarouselRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={CarouselDefinition} element="section" renderElement={CarouselRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function CarouselViewportElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CarouselViewportProps = SolidPrimitivePartProps<CarouselController['parts']['viewport'], 'div', false>;
export function CarouselViewport(props: CarouselViewportProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CarouselDefinition as never}
      part="viewport"
      element="div"
      renderElement={CarouselViewportElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CarouselItemElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CarouselItemProps = SolidPrimitivePartProps<CarouselController['parts']['item'], 'div', true>;
export function CarouselItem(props: CarouselItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CarouselDefinition as never}
      part="item"
      element="div"
      renderElement={CarouselItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function CarouselPreviousElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type CarouselPreviousProps = SolidPrimitivePartProps<CarouselController['parts']['previous'], 'button', false>;
export function CarouselPrevious(props: CarouselPreviousProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CarouselDefinition as never}
      part="previous"
      element="button"
      renderElement={CarouselPreviousElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CarouselNextElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type CarouselNextProps = SolidPrimitivePartProps<CarouselController['parts']['next'], 'button', false>;
export function CarouselNext(props: CarouselNextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CarouselDefinition as never}
      part="next"
      element="button"
      renderElement={CarouselNextElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CarouselIndicatorGroupElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CarouselIndicatorGroupProps = SolidPrimitivePartProps<CarouselController['parts']['indicatorGroup'], 'div', false>;
export function CarouselIndicatorGroup(props: CarouselIndicatorGroupProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CarouselDefinition as never}
      part="indicatorGroup"
      element="div"
      renderElement={CarouselIndicatorGroupElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CarouselIndicatorElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type CarouselIndicatorProps = SolidPrimitivePartProps<CarouselController['parts']['indicator'], 'button', true>;
export function CarouselIndicator(props: CarouselIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CarouselDefinition as never}
      part="indicator"
      element="button"
      renderElement={CarouselIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function CarouselLiveRegionElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CarouselLiveRegionProps = SolidPrimitivePartProps<CarouselController['parts']['liveRegion'], 'div', false>;
export function CarouselLiveRegion(props: CarouselLiveRegionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CarouselDefinition as never}
      part="liveRegion"
      element="div"
      renderElement={CarouselLiveRegionElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const CarouselProvider = CarouselRoot;
export const Carousel = /* @__PURE__ */ Object.assign(CarouselRoot, { Provider: CarouselProvider, Root: CarouselRoot, Viewport: CarouselViewport, Item: CarouselItem, Previous: CarouselPrevious, Next: CarouselNext, IndicatorGroup: CarouselIndicatorGroup, Indicator: CarouselIndicator, LiveRegion: CarouselLiveRegion });
