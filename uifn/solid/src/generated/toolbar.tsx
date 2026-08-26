import { createContext, type JSX } from 'solid-js';
import { createToolbarController, type ToolbarProps, type ToolbarController } from '@uifn/core/primitives/toolbar';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ToolbarContext = createContext<SolidPrimitiveContextValue<ToolbarProps>>();
export const ToolbarDefinition: SolidPrimitiveDefinition<ToolbarProps> = {
  name: 'Toolbar',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["orientation","loop","dir","disabled"],
  context: ToolbarContext,
  createController: createToolbarController as never,
};

function ToolbarRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ToolbarRootProps = SolidPrimitiveRootProps<ToolbarProps, 'div'>;
export function ToolbarRoot(props: ToolbarRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ToolbarDefinition} element="div" renderElement={ToolbarRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function ToolbarButtonElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type ToolbarButtonProps = SolidPrimitivePartProps<ToolbarController['parts']['button'], 'button', true>;
export function ToolbarButton(props: ToolbarButtonProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ToolbarDefinition as never}
      part="button"
      element="button"
      renderElement={ToolbarButtonElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ToolbarLinkElement(props: JSX.IntrinsicElements['a']): JSX.Element {
  return <a {...props} />;
}

export type ToolbarLinkProps = SolidPrimitivePartProps<ToolbarController['parts']['link'], 'a', true>;
export function ToolbarLink(props: ToolbarLinkProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ToolbarDefinition as never}
      part="link"
      element="a"
      renderElement={ToolbarLinkElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ToolbarToggleGroupElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ToolbarToggleGroupProps = SolidPrimitivePartProps<ToolbarController['parts']['toggleGroup'], 'div', true>;
export function ToolbarToggleGroup(props: ToolbarToggleGroupProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ToolbarDefinition as never}
      part="toggleGroup"
      element="div"
      renderElement={ToolbarToggleGroupElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ToolbarSeparatorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ToolbarSeparatorProps = SolidPrimitivePartProps<ToolbarController['parts']['separator'], 'div', true>;
export function ToolbarSeparator(props: ToolbarSeparatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ToolbarDefinition as never}
      part="separator"
      element="div"
      renderElement={ToolbarSeparatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const ToolbarProvider = ToolbarRoot;
export const Toolbar = /* @__PURE__ */ Object.assign(ToolbarRoot, { Provider: ToolbarProvider, Root: ToolbarRoot, Button: ToolbarButton, Link: ToolbarLink, ToggleGroup: ToolbarToggleGroup, Separator: ToolbarSeparator });
