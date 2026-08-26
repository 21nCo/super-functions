'use client';

import * as React from 'react';
import { createTreeViewController, type TreeViewProps, type TreeViewController } from '@uifn/core/primitives/tree-view';
import {
  ReactPrimitivePart,
  ReactPrimitiveRoot,
  useReactPrimitive,
  type ReactPrimitiveBridge,
  type ReactPrimitiveDefinition,
  type ReactPrimitiveHookResult,
  type ReactPrimitivePartProps,
  type ReactPrimitiveRootProps,
} from '../internal/compound';

const TreeViewContext = React.createContext<ReactPrimitiveBridge<TreeViewProps> | null>(null);
const TreeViewDefinition: ReactPrimitiveDefinition<TreeViewProps> = {
  name: 'TreeView',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["expanded","defaultExpanded","selection","defaultSelection","items","selectionMode","dir"],
  context: TreeViewContext,
  createController: createTreeViewController as never,
};

export type TreeViewRootProps = ReactPrimitiveRootProps<TreeViewProps, 'div'>;
export const TreeViewRoot = React.forwardRef<React.ElementRef<'div'>, TreeViewRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={TreeViewDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TreeViewRoot.displayName = 'TreeViewRoot';

export type TreeViewLabelProps = ReactPrimitivePartProps<TreeViewController['parts']['label'], 'span', false>;
export const TreeViewLabel = React.forwardRef<React.ElementRef<'span'>, TreeViewLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={TreeViewDefinition as never} part="label" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TreeViewLabel.displayName = 'TreeViewLabel';

export type TreeViewTreeProps = ReactPrimitivePartProps<TreeViewController['parts']['tree'], 'div', false>;
export const TreeViewTree = React.forwardRef<React.ElementRef<'div'>, TreeViewTreeProps>((props, ref) => (
  <ReactPrimitivePart definition={TreeViewDefinition as never} part="tree" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TreeViewTree.displayName = 'TreeViewTree';

export type TreeViewItemProps = ReactPrimitivePartProps<TreeViewController['parts']['item'], 'div', true>;
export const TreeViewItem = React.forwardRef<React.ElementRef<'div'>, TreeViewItemProps>((props, ref) => (
  <ReactPrimitivePart definition={TreeViewDefinition as never} part="item" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TreeViewItem.displayName = 'TreeViewItem';

export type TreeViewItemTriggerProps = ReactPrimitivePartProps<TreeViewController['parts']['itemTrigger'], 'button', true>;
export const TreeViewItemTrigger = React.forwardRef<React.ElementRef<'button'>, TreeViewItemTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={TreeViewDefinition as never} part="itemTrigger" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TreeViewItemTrigger.displayName = 'TreeViewItemTrigger';

export type TreeViewItemTextProps = ReactPrimitivePartProps<TreeViewController['parts']['itemText'], 'span', true>;
export const TreeViewItemText = React.forwardRef<React.ElementRef<'span'>, TreeViewItemTextProps>((props, ref) => (
  <ReactPrimitivePart definition={TreeViewDefinition as never} part="itemText" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TreeViewItemText.displayName = 'TreeViewItemText';

export type TreeViewBranchProps = ReactPrimitivePartProps<TreeViewController['parts']['branch'], 'div', true>;
export const TreeViewBranch = React.forwardRef<React.ElementRef<'div'>, TreeViewBranchProps>((props, ref) => (
  <ReactPrimitivePart definition={TreeViewDefinition as never} part="branch" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TreeViewBranch.displayName = 'TreeViewBranch';

export type TreeViewIndicatorProps = ReactPrimitivePartProps<TreeViewController['parts']['indicator'], 'span', true>;
export const TreeViewIndicator = React.forwardRef<React.ElementRef<'span'>, TreeViewIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={TreeViewDefinition as never} part="indicator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TreeViewIndicator.displayName = 'TreeViewIndicator';

export const TreeViewProvider = TreeViewRoot;
export function useTreeView(inputs: TreeViewProps): ReactPrimitiveHookResult<TreeViewController['state'], TreeViewController['actions']> {
  return useReactPrimitive(TreeViewDefinition, inputs) as ReactPrimitiveHookResult<TreeViewController['state'], TreeViewController['actions']>;
}
export const TreeView = Object.assign(TreeViewRoot, { Provider: TreeViewProvider, Root: TreeViewRoot, Label: TreeViewLabel, Tree: TreeViewTree, Item: TreeViewItem, ItemTrigger: TreeViewItemTrigger, ItemText: TreeViewItemText, Branch: TreeViewBranch, Indicator: TreeViewIndicator });
