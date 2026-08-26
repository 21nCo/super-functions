import { createMenubarController, type MenubarProps } from '@uifn/core/primitives/menubar';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const MenubarDefinition: SveltePrimitiveDefinition<MenubarProps> = {
  name: 'Menubar',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","loop","dir"],
  contextKey: Symbol('uifn.Menubar'),
  createController: createMenubarController as never,
};
