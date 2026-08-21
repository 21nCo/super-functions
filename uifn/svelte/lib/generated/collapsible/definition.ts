import { createCollapsibleController, type CollapsibleProps } from '@uifn/core/primitives/collapsible';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const CollapsibleDefinition: SveltePrimitiveDefinition<CollapsibleProps> = {
  name: 'Collapsible',
  family: 'disclosure',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","disabled"],
  contextKey: Symbol('uifn.Collapsible'),
  createController: createCollapsibleController as never,
};
