import { createDrawerController, type DrawerProps } from '@uifn/core/primitives/drawer';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const DrawerDefinition: SveltePrimitiveDefinition<DrawerProps> = {
  name: 'Drawer',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","side","modal","dismissThreshold"],
  contextKey: Symbol('uifn.Drawer'),
  createController: createDrawerController as never,
};
