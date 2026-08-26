import { createContext, type JSX } from 'solid-js';
import { createMenubarController, type MenubarProps, type MenubarController } from '@uifn/core/primitives/menubar';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const MenubarContext = createContext<SolidPrimitiveContextValue<MenubarProps>>();
export const MenubarDefinition: SolidPrimitiveDefinition<MenubarProps> = {
  name: 'Menubar',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","loop","dir"],
  context: MenubarContext,
  createController: createMenubarController as never,
};

function MenubarRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenubarRootProps = SolidPrimitiveRootProps<MenubarProps, 'div'>;
export function MenubarRoot(props: MenubarRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={MenubarDefinition} element="div" renderElement={MenubarRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function MenubarMenuElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenubarMenuProps = SolidPrimitivePartProps<MenubarController['parts']['menu'], 'div', true>;
export function MenubarMenu(props: MenubarMenuProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenubarDefinition as never}
      part="menu"
      element="div"
      renderElement={MenubarMenuElement as never}
      many={true}
      props={props as never}
    />
  );
}

function MenubarTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type MenubarTriggerProps = SolidPrimitivePartProps<MenubarController['parts']['trigger'], 'button', true>;
export function MenubarTrigger(props: MenubarTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenubarDefinition as never}
      part="trigger"
      element="button"
      renderElement={MenubarTriggerElement as never}
      many={true}
      props={props as never}
    />
  );
}

function MenubarContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenubarContentProps = SolidPrimitivePartProps<MenubarController['parts']['content'], 'div', true>;
export function MenubarContent(props: MenubarContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenubarDefinition as never}
      part="content"
      element="div"
      renderElement={MenubarContentElement as never}
      many={true}
      props={props as never}
    />
  );
}

function MenubarItemElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenubarItemProps = SolidPrimitivePartProps<MenubarController['parts']['item'], 'div', true>;
export function MenubarItem(props: MenubarItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenubarDefinition as never}
      part="item"
      element="div"
      renderElement={MenubarItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function MenubarSubmenuTriggerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenubarSubmenuTriggerProps = SolidPrimitivePartProps<MenubarController['parts']['submenuTrigger'], 'div', true>;
export function MenubarSubmenuTrigger(props: MenubarSubmenuTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenubarDefinition as never}
      part="submenuTrigger"
      element="div"
      renderElement={MenubarSubmenuTriggerElement as never}
      many={true}
      props={props as never}
    />
  );
}

function MenubarSubmenuContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MenubarSubmenuContentProps = SolidPrimitivePartProps<MenubarController['parts']['submenuContent'], 'div', true>;
export function MenubarSubmenuContent(props: MenubarSubmenuContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MenubarDefinition as never}
      part="submenuContent"
      element="div"
      renderElement={MenubarSubmenuContentElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const MenubarProvider = MenubarRoot;
export const Menubar = /* @__PURE__ */ Object.assign(MenubarRoot, { Provider: MenubarProvider, Root: MenubarRoot, Menu: MenubarMenu, Trigger: MenubarTrigger, Content: MenubarContent, Item: MenubarItem, SubmenuTrigger: MenubarSubmenuTrigger, SubmenuContent: MenubarSubmenuContent });
