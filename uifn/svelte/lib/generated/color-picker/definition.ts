import { createColorPickerController, type ColorPickerProps } from '@uifn/core/primitives/color-picker';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const ColorPickerDefinition: SveltePrimitiveDefinition<ColorPickerProps> = {
  name: 'ColorPicker',
  family: 'date-color',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","open","defaultOpen","colorSpace","alpha","name","disabled","readOnly"],
  contextKey: Symbol('uifn.ColorPicker'),
  createController: createColorPickerController as never,
};
