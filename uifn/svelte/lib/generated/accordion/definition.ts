import { createAccordionController, type AccordionProps } from '@uifn/core/primitives/accordion';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const AccordionDefinition: SveltePrimitiveDefinition<AccordionProps> = {
  name: 'Accordion',
  family: 'disclosure',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","multiple","collapsible","disabled","type"],
  contextKey: Symbol('uifn.Accordion'),
  createController: createAccordionController as never,
};
