import { createTooltipController, type TooltipProps } from '@uifn/core/primitives/tooltip';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const TooltipDefinition: SveltePrimitiveDefinition<TooltipProps> = {
  name: 'Tooltip',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","openDelay","closeDelay","placement","disabled"],
  contextKey: Symbol('uifn.Tooltip'),
  createController: createTooltipController as never,
};
