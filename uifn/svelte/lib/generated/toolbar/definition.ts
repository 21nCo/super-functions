import { createToolbarController, type ToolbarProps } from '@uifn/core/primitives/toolbar';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const ToolbarDefinition: SveltePrimitiveDefinition<ToolbarProps> = {
  name: 'Toolbar',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["orientation","loop","dir","disabled"],
  contextKey: Symbol('uifn.Toolbar'),
  createController: createToolbarController as never,
};
