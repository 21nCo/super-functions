import { createFloatingPanelController, type FloatingPanelProps } from '@uifn/core/primitives/floating-panel';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const FloatingPanelDefinition: SveltePrimitiveDefinition<FloatingPanelProps> = {
  name: 'FloatingPanel',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","modal","placement","draggable","resizable"],
  contextKey: Symbol('uifn.FloatingPanel'),
  createController: createFloatingPanelController as never,
};
