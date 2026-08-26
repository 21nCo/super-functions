import type { ComponentProps } from 'svelte';
import TreeViewRootComponent from './Root.svelte';
import TreeViewLabelComponent from './Label.svelte';
import TreeViewTreeComponent from './Tree.svelte';
import TreeViewItemComponent from './Item.svelte';
import TreeViewItemTriggerComponent from './ItemTrigger.svelte';
import TreeViewItemTextComponent from './ItemText.svelte';
import TreeViewBranchComponent from './Branch.svelte';
import TreeViewIndicatorComponent from './Indicator.svelte';

export const TreeViewRoot = TreeViewRootComponent;
export type TreeViewRootProps = ComponentProps<typeof TreeViewRootComponent>;

export const TreeViewLabel = TreeViewLabelComponent;
export type TreeViewLabelProps = ComponentProps<typeof TreeViewLabelComponent>;

export const TreeViewTree = TreeViewTreeComponent;
export type TreeViewTreeProps = ComponentProps<typeof TreeViewTreeComponent>;

export const TreeViewItem = TreeViewItemComponent;
export type TreeViewItemProps = ComponentProps<typeof TreeViewItemComponent>;

export const TreeViewItemTrigger = TreeViewItemTriggerComponent;
export type TreeViewItemTriggerProps = ComponentProps<typeof TreeViewItemTriggerComponent>;

export const TreeViewItemText = TreeViewItemTextComponent;
export type TreeViewItemTextProps = ComponentProps<typeof TreeViewItemTextComponent>;

export const TreeViewBranch = TreeViewBranchComponent;
export type TreeViewBranchProps = ComponentProps<typeof TreeViewBranchComponent>;

export const TreeViewIndicator = TreeViewIndicatorComponent;
export type TreeViewIndicatorProps = ComponentProps<typeof TreeViewIndicatorComponent>;

export const TreeViewProvider = TreeViewRoot;
export const TreeView = Object.assign(TreeViewRoot, { Provider: TreeViewProvider, Root: TreeViewRoot, Label: TreeViewLabel, Tree: TreeViewTree, Item: TreeViewItem, ItemTrigger: TreeViewItemTrigger, ItemText: TreeViewItemText, Branch: TreeViewBranch, Indicator: TreeViewIndicator });
