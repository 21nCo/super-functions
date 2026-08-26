import type { UIFnEnvironment } from '../environment';
import {
  createMenuLikeController,
  type MenuActions,
  type MenuController,
  type MenuControllerParts,
  type MenuItem,
  type MenuProps,
  type MenuState,
} from './menu';

export type ContextMenuItem = MenuItem;
export type ContextMenuProps = MenuProps;
export type ContextMenuState = MenuState;
export type ContextMenuActions = MenuActions;
export type ContextMenuControllerParts = MenuControllerParts;
export type ContextMenuController = MenuController;

export function createContextMenuController(
  props: ContextMenuProps = {},
  env: UIFnEnvironment = {},
): ContextMenuController {
  return createMenuLikeController('ContextMenu', props, env);
}
