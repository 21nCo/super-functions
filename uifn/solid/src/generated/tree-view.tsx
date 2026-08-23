import { createContext, type JSX } from 'solid-js';
import { createTreeViewController, type TreeViewProps, type TreeViewController } from '@uifn/core/primitives/tree-view';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const TreeViewContext = createContext<SolidPrimitiveContextValue<TreeViewProps>>();
export const TreeViewDefinition: SolidPrimitiveDefinition<TreeViewProps> = {
  name: 'TreeView',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["expanded","defaultExpanded","selection","defaultSelection","items","selectionMode","dir"],
  context: TreeViewContext,
  createController: createTreeViewController as never,
};

function TreeViewRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TreeViewRootProps = SolidPrimitiveRootProps<TreeViewProps, 'div'>;
export function TreeViewRoot(props: TreeViewRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={TreeViewDefinition} element="div" renderElement={TreeViewRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function TreeViewLabelElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type TreeViewLabelProps = SolidPrimitivePartProps<TreeViewController['parts']['label'], 'span', false>;
export function TreeViewLabel(props: TreeViewLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TreeViewDefinition as never}
      part="label"
      element="span"
      renderElement={TreeViewLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TreeViewTreeElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TreeViewTreeProps = SolidPrimitivePartProps<TreeViewController['parts']['tree'], 'div', false>;
export function TreeViewTree(props: TreeViewTreeProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TreeViewDefinition as never}
      part="tree"
      element="div"
      renderElement={TreeViewTreeElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TreeViewItemElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TreeViewItemProps = SolidPrimitivePartProps<TreeViewController['parts']['item'], 'div', true>;
export function TreeViewItem(props: TreeViewItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TreeViewDefinition as never}
      part="item"
      element="div"
      renderElement={TreeViewItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TreeViewItemTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type TreeViewItemTriggerProps = SolidPrimitivePartProps<TreeViewController['parts']['itemTrigger'], 'button', true>;
export function TreeViewItemTrigger(props: TreeViewItemTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TreeViewDefinition as never}
      part="itemTrigger"
      element="button"
      renderElement={TreeViewItemTriggerElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TreeViewItemTextElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type TreeViewItemTextProps = SolidPrimitivePartProps<TreeViewController['parts']['itemText'], 'span', true>;
export function TreeViewItemText(props: TreeViewItemTextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TreeViewDefinition as never}
      part="itemText"
      element="span"
      renderElement={TreeViewItemTextElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TreeViewBranchElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TreeViewBranchProps = SolidPrimitivePartProps<TreeViewController['parts']['branch'], 'div', true>;
export function TreeViewBranch(props: TreeViewBranchProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TreeViewDefinition as never}
      part="branch"
      element="div"
      renderElement={TreeViewBranchElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TreeViewIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type TreeViewIndicatorProps = SolidPrimitivePartProps<TreeViewController['parts']['indicator'], 'span', true>;
export function TreeViewIndicator(props: TreeViewIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TreeViewDefinition as never}
      part="indicator"
      element="span"
      renderElement={TreeViewIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const TreeViewProvider = TreeViewRoot;
export const TreeView = /* @__PURE__ */ Object.assign(TreeViewRoot, { Provider: TreeViewProvider, Root: TreeViewRoot, Label: TreeViewLabel, Tree: TreeViewTree, Item: TreeViewItem, ItemTrigger: TreeViewItemTrigger, ItemText: TreeViewItemText, Branch: TreeViewBranch, Indicator: TreeViewIndicator });
