import { createContext, type JSX } from 'solid-js';
import { createContextMenuController, type ContextMenuProps, type ContextMenuController } from '@uifn/core/primitives/context-menu';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ContextMenuContext = createContext<SolidPrimitiveContextValue<ContextMenuProps>>();
export const ContextMenuDefinition: SolidPrimitiveDefinition<ContextMenuProps> = {
  name: 'ContextMenu',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","dir","loop"],
  context: ContextMenuContext,
  createController: createContextMenuController as never,
};

function ContextMenuRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ContextMenuRootProps = SolidPrimitiveRootProps<ContextMenuProps, 'div'>;
export function ContextMenuRoot(props: ContextMenuRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ContextMenuDefinition} element="div" renderElement={ContextMenuRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function ContextMenuTriggerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ContextMenuTriggerProps = SolidPrimitivePartProps<ContextMenuController['parts']['trigger'], 'div', false>;
export function ContextMenuTrigger(props: ContextMenuTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ContextMenuDefinition as never}
      part="trigger"
      element="div"
      renderElement={ContextMenuTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ContextMenuPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ContextMenuPositionerProps = SolidPrimitivePartProps<ContextMenuController['parts']['positioner'], 'div', false>;
export function ContextMenuPositioner(props: ContextMenuPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ContextMenuDefinition as never}
      part="positioner"
      element="div"
      renderElement={ContextMenuPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ContextMenuContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ContextMenuContentProps = SolidPrimitivePartProps<ContextMenuController['parts']['content'], 'div', false>;
export function ContextMenuContent(props: ContextMenuContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ContextMenuDefinition as never}
      part="content"
      element="div"
      renderElement={ContextMenuContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ContextMenuItemElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ContextMenuItemProps = SolidPrimitivePartProps<ContextMenuController['parts']['item'], 'div', true>;
export function ContextMenuItem(props: ContextMenuItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ContextMenuDefinition as never}
      part="item"
      element="div"
      renderElement={ContextMenuItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ContextMenuItemIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type ContextMenuItemIndicatorProps = SolidPrimitivePartProps<ContextMenuController['parts']['itemIndicator'], 'span', true>;
export function ContextMenuItemIndicator(props: ContextMenuItemIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ContextMenuDefinition as never}
      part="itemIndicator"
      element="span"
      renderElement={ContextMenuItemIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ContextMenuSeparatorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ContextMenuSeparatorProps = SolidPrimitivePartProps<ContextMenuController['parts']['separator'], 'div', true>;
export function ContextMenuSeparator(props: ContextMenuSeparatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ContextMenuDefinition as never}
      part="separator"
      element="div"
      renderElement={ContextMenuSeparatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ContextMenuGroupElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ContextMenuGroupProps = SolidPrimitivePartProps<ContextMenuController['parts']['group'], 'div', true>;
export function ContextMenuGroup(props: ContextMenuGroupProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ContextMenuDefinition as never}
      part="group"
      element="div"
      renderElement={ContextMenuGroupElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ContextMenuGroupLabelElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ContextMenuGroupLabelProps = SolidPrimitivePartProps<ContextMenuController['parts']['groupLabel'], 'div', true>;
export function ContextMenuGroupLabel(props: ContextMenuGroupLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ContextMenuDefinition as never}
      part="groupLabel"
      element="div"
      renderElement={ContextMenuGroupLabelElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ContextMenuSubmenuTriggerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ContextMenuSubmenuTriggerProps = SolidPrimitivePartProps<ContextMenuController['parts']['submenuTrigger'], 'div', true>;
export function ContextMenuSubmenuTrigger(props: ContextMenuSubmenuTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ContextMenuDefinition as never}
      part="submenuTrigger"
      element="div"
      renderElement={ContextMenuSubmenuTriggerElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ContextMenuSubmenuContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ContextMenuSubmenuContentProps = SolidPrimitivePartProps<ContextMenuController['parts']['submenuContent'], 'div', true>;
export function ContextMenuSubmenuContent(props: ContextMenuSubmenuContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ContextMenuDefinition as never}
      part="submenuContent"
      element="div"
      renderElement={ContextMenuSubmenuContentElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const ContextMenuProvider = ContextMenuRoot;
export const ContextMenu = /* @__PURE__ */ Object.assign(ContextMenuRoot, { Provider: ContextMenuProvider, Root: ContextMenuRoot, Trigger: ContextMenuTrigger, Positioner: ContextMenuPositioner, Content: ContextMenuContent, Item: ContextMenuItem, ItemIndicator: ContextMenuItemIndicator, Separator: ContextMenuSeparator, Group: ContextMenuGroup, GroupLabel: ContextMenuGroupLabel, SubmenuTrigger: ContextMenuSubmenuTrigger, SubmenuContent: ContextMenuSubmenuContent });
