import { createDateInputController, type DateInputProps } from '@uifn/core/primitives/date-input';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const DateInputDefinition: SveltePrimitiveDefinition<DateInputProps> = {
  name: 'DateInput',
  family: 'date-color',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","locale","timeZone","min","max","name","disabled","readOnly"],
  contextKey: Symbol('uifn.DateInput'),
  createController: createDateInputController as never,
};
