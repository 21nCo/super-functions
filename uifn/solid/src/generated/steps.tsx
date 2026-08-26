import { createContext, type JSX } from 'solid-js';
import { createStepsController, type StepsProps, type StepsController } from '@uifn/core/primitives/steps';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const StepsContext = createContext<SolidPrimitiveContextValue<StepsProps>>();
export const StepsDefinition: SolidPrimitiveDefinition<StepsProps> = {
  name: 'Steps',
  family: 'status-feedback',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["step","defaultStep","count","orientation","linear"],
  context: StepsContext,
  createController: createStepsController as never,
};

function StepsRootElement(props: JSX.IntrinsicElements['nav']): JSX.Element {
  return <nav {...props} />;
}

export type StepsRootProps = SolidPrimitiveRootProps<StepsProps, 'nav'>;
export function StepsRoot(props: StepsRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={StepsDefinition} element="nav" renderElement={StepsRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function StepsListElement(props: JSX.IntrinsicElements['ol']): JSX.Element {
  return <ol {...props} />;
}

export type StepsListProps = SolidPrimitivePartProps<StepsController['parts']['list'], 'ol', false>;
export function StepsList(props: StepsListProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={StepsDefinition as never}
      part="list"
      element="ol"
      renderElement={StepsListElement as never}
      many={false}
      props={props as never}
    />
  );
}

function StepsItemElement(props: JSX.IntrinsicElements['li']): JSX.Element {
  return <li {...props} />;
}

export type StepsItemProps = SolidPrimitivePartProps<StepsController['parts']['item'], 'li', true>;
export function StepsItem(props: StepsItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={StepsDefinition as never}
      part="item"
      element="li"
      renderElement={StepsItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function StepsTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type StepsTriggerProps = SolidPrimitivePartProps<StepsController['parts']['trigger'], 'button', true>;
export function StepsTrigger(props: StepsTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={StepsDefinition as never}
      part="trigger"
      element="button"
      renderElement={StepsTriggerElement as never}
      many={true}
      props={props as never}
    />
  );
}

function StepsIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type StepsIndicatorProps = SolidPrimitivePartProps<StepsController['parts']['indicator'], 'span', true>;
export function StepsIndicator(props: StepsIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={StepsDefinition as never}
      part="indicator"
      element="span"
      renderElement={StepsIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function StepsSeparatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type StepsSeparatorProps = SolidPrimitivePartProps<StepsController['parts']['separator'], 'span', true>;
export function StepsSeparator(props: StepsSeparatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={StepsDefinition as never}
      part="separator"
      element="span"
      renderElement={StepsSeparatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function StepsContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type StepsContentProps = SolidPrimitivePartProps<StepsController['parts']['content'], 'div', true>;
export function StepsContent(props: StepsContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={StepsDefinition as never}
      part="content"
      element="div"
      renderElement={StepsContentElement as never}
      many={true}
      props={props as never}
    />
  );
}

function StepsCompletedElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type StepsCompletedProps = SolidPrimitivePartProps<StepsController['parts']['completed'], 'span', true>;
export function StepsCompleted(props: StepsCompletedProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={StepsDefinition as never}
      part="completed"
      element="span"
      renderElement={StepsCompletedElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const StepsProvider = StepsRoot;
export const Steps = /* @__PURE__ */ Object.assign(StepsRoot, { Provider: StepsProvider, Root: StepsRoot, List: StepsList, Item: StepsItem, Trigger: StepsTrigger, Indicator: StepsIndicator, Separator: StepsSeparator, Content: StepsContent, Completed: StepsCompleted });
