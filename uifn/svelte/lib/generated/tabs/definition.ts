import { createTabsController, type TabsProps } from '@uifn/core/primitives/tabs';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const TabsDefinition: SveltePrimitiveDefinition<TabsProps> = {
  name: 'Tabs',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","activationMode","orientation","loop","dir"],
  contextKey: Symbol('uifn.Tabs'),
  createController: createTabsController as never,
};
