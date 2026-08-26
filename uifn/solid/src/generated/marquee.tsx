import { createContext, type JSX } from 'solid-js';
import { MarqueeContract, type MarqueeProps, type MarqueeContractParts } from '@uifn/core/primitives/marquee';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const MarqueeContext = createContext<SolidPrimitiveContextValue<MarqueeProps>>();
export const MarqueeDefinition: SolidPrimitiveDefinition<MarqueeProps> = {
  name: 'Marquee',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["direction","speed","pauseOnHover","pauseOnFocus","reducedMotionBehavior"],
  context: MarqueeContext,
  contract: MarqueeContract as never,
};

function MarqueeRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MarqueeRootProps = SolidPrimitiveRootProps<MarqueeProps, 'div'>;
export function MarqueeRoot(props: MarqueeRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={MarqueeDefinition} element="div" renderElement={MarqueeRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function MarqueeViewportElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MarqueeViewportProps = SolidPrimitivePartProps<MarqueeContractParts['viewport'], 'div', false>;
export function MarqueeViewport(props: MarqueeViewportProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MarqueeDefinition as never}
      part="viewport"
      element="div"
      renderElement={MarqueeViewportElement as never}
      many={false}
      props={props as never}
    />
  );
}

function MarqueeTrackElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MarqueeTrackProps = SolidPrimitivePartProps<MarqueeContractParts['track'], 'div', false>;
export function MarqueeTrack(props: MarqueeTrackProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MarqueeDefinition as never}
      part="track"
      element="div"
      renderElement={MarqueeTrackElement as never}
      many={false}
      props={props as never}
    />
  );
}

function MarqueeItemElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MarqueeItemProps = SolidPrimitivePartProps<MarqueeContractParts['item'], 'div', true>;
export function MarqueeItem(props: MarqueeItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MarqueeDefinition as never}
      part="item"
      element="div"
      renderElement={MarqueeItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const MarqueeProvider = MarqueeRoot;
export const Marquee = /* @__PURE__ */ Object.assign(MarqueeRoot, { Provider: MarqueeProvider, Root: MarqueeRoot, Viewport: MarqueeViewport, Track: MarqueeTrack, Item: MarqueeItem });
