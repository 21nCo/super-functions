import { createMenuController, type MenuProps } from '@uifn/core/primitives/menu';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const MenuDefinition: SveltePrimitiveDefinition<MenuProps> = {
  name: 'Menu',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","orientation","loop","dir"],
  contextKey: Symbol('uifn.Menu'),
  createController: createMenuController as never,
};
