import { createContext, type JSX } from 'solid-js';
import { createTabsController, type TabsProps, type TabsController } from '@uifn/core/primitives/tabs';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const TabsContext = createContext<SolidPrimitiveContextValue<TabsProps>>();
export const TabsDefinition: SolidPrimitiveDefinition<TabsProps> = {
  name: 'Tabs',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","activationMode","orientation","loop","dir"],
  context: TabsContext,
  createController: createTabsController as never,
};

function TabsRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TabsRootProps = SolidPrimitiveRootProps<TabsProps, 'div'>;
export function TabsRoot(props: TabsRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={TabsDefinition} element="div" renderElement={TabsRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function TabsListElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TabsListProps = SolidPrimitivePartProps<TabsController['parts']['list'], 'div', false>;
export function TabsList(props: TabsListProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TabsDefinition as never}
      part="list"
      element="div"
      renderElement={TabsListElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TabsTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type TabsTriggerProps = SolidPrimitivePartProps<TabsController['parts']['trigger'], 'button', true>;
export function TabsTrigger(props: TabsTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TabsDefinition as never}
      part="trigger"
      element="button"
      renderElement={TabsTriggerElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TabsContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TabsContentProps = SolidPrimitivePartProps<TabsController['parts']['content'], 'div', true>;
export function TabsContent(props: TabsContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TabsDefinition as never}
      part="content"
      element="div"
      renderElement={TabsContentElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TabsIndicatorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TabsIndicatorProps = SolidPrimitivePartProps<TabsController['parts']['indicator'], 'div', false>;
export function TabsIndicator(props: TabsIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TabsDefinition as never}
      part="indicator"
      element="div"
      renderElement={TabsIndicatorElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const TabsProvider = TabsRoot;
export const Tabs = /* @__PURE__ */ Object.assign(TabsRoot, { Provider: TabsProvider, Root: TabsRoot, List: TabsList, Trigger: TabsTrigger, Content: TabsContent, Indicator: TabsIndicator });
