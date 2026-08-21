import { createTreeViewController, type TreeViewProps } from '@uifn/core/primitives/tree-view';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const TreeViewDefinition: SveltePrimitiveDefinition<TreeViewProps> = {
  name: 'TreeView',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["expanded","defaultExpanded","selection","defaultSelection","items","selectionMode","dir"],
  contextKey: Symbol('uifn.TreeView'),
  createController: createTreeViewController as never,
};
