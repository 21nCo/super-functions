import { createContext, type JSX } from 'solid-js';
import { createMenuController, type MenuProps, type MenuController } from '@uifn/core/primitives/menu';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const MenuContext = createContext<SolidPrimitiveContextValue<MenuProps>>();
export const MenuDefinition: SolidPrimitiveDefinition<MenuProps> = {
  name: 'Menu',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","orientation","loop","dir"],
  context: MenuContext,
  createController: createMenuController as never,
};

function MenuRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenuRootProps = SolidPrimitiveRootProps<MenuProps, 'div'>;
export function MenuRoot(props: MenuRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={MenuDefinition} element="div" renderElement={MenuRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function MenuTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type MenuTriggerProps = SolidPrimitivePartProps<MenuController['parts']['trigger'], 'button', false>;
export function MenuTrigger(props: MenuTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenuDefinition as never}
      part="trigger"
      element="button"
      renderElement={MenuTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function MenuPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenuPositionerProps = SolidPrimitivePartProps<MenuController['parts']['positioner'], 'div', false>;
export function MenuPositioner(props: MenuPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenuDefinition as never}
      part="positioner"
      element="div"
      renderElement={MenuPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function MenuContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenuContentProps = SolidPrimitivePartProps<MenuController['parts']['content'], 'div', false>;
export function MenuContent(props: MenuContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenuDefinition as never}
      part="content"
      element="div"
      renderElement={MenuContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function MenuItemElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenuItemProps = SolidPrimitivePartProps<MenuController['parts']['item'], 'div', true>;
export function MenuItem(props: MenuItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenuDefinition as never}
      part="item"
      element="div"
      renderElement={MenuItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function MenuItemIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type MenuItemIndicatorProps = SolidPrimitivePartProps<MenuController['parts']['itemIndicator'], 'span', true>;
export function MenuItemIndicator(props: MenuItemIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenuDefinition as never}
      part="itemIndicator"
      element="span"
      renderElement={MenuItemIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function MenuSeparatorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenuSeparatorProps = SolidPrimitivePartProps<MenuController['parts']['separator'], 'div', true>;
export function MenuSeparator(props: MenuSeparatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenuDefinition as never}
      part="separator"
      element="div"
      renderElement={MenuSeparatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function MenuGroupElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenuGroupProps = SolidPrimitivePartProps<MenuController['parts']['group'], 'div', true>;
export function MenuGroup(props: MenuGroupProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenuDefinition as never}
      part="group"
      element="div"
      renderElement={MenuGroupElement as never}
      many={true}
      props={props as never}
    />
  );
}

function MenuGroupLabelElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenuGroupLabelProps = SolidPrimitivePartProps<MenuController['parts']['groupLabel'], 'div', true>;
export function MenuGroupLabel(props: MenuGroupLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenuDefinition as never}
      part="groupLabel"
      element="div"
      renderElement={MenuGroupLabelElement as never}
      many={true}
      props={props as never}
    />
  );
}

function MenuSubmenuTriggerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenuSubmenuTriggerProps = SolidPrimitivePartProps<MenuController['parts']['submenuTrigger'], 'div', true>;
export function MenuSubmenuTrigger(props: MenuSubmenuTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenuDefinition as never}
      part="submenuTrigger"
      element="div"
      renderElement={MenuSubmenuTriggerElement as never}
      many={true}
      props={props as never}
    />
  );
}

function MenuSubmenuContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenuSubmenuContentProps = SolidPrimitivePartProps<MenuController['parts']['submenuContent'], 'div', true>;
export function MenuSubmenuContent(props: MenuSubmenuContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenuDefinition as never}
      part="submenuContent"
      element="div"
      renderElement={MenuSubmenuContentElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const MenuProvider = MenuRoot;
export const Menu = /* @__PURE__ */ Object.assign(MenuRoot, { Provider: MenuProvider, Root: MenuRoot, Trigger: MenuTrigger, Positioner: MenuPositioner, Content: MenuContent, Item: MenuItem, ItemIndicator: MenuItemIndicator, Separator: MenuSeparator, Group: MenuGroup, GroupLabel: MenuGroupLabel, SubmenuTrigger: MenuSubmenuTrigger, SubmenuContent: MenuSubmenuContent });
