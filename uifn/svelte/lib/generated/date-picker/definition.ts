import { createDatePickerController, type DatePickerProps } from '@uifn/core/primitives/date-picker';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const DatePickerDefinition: SveltePrimitiveDefinition<DatePickerProps> = {
  name: 'DatePicker',
  family: 'date-color',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","open","defaultOpen","locale","timeZone","min","max","unavailable","name"],
  contextKey: Symbol('uifn.DatePicker'),
  createController: createDatePickerController as never,
};
