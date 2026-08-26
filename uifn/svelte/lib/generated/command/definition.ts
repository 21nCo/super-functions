import { createCommandController, type CommandProps } from '@uifn/core/primitives/command';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const CommandDefinition: SveltePrimitiveDefinition<CommandProps> = {
  name: 'Command',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","inputValue","defaultInputValue","items","multiple","loop","name","disabled","readOnly","required","placeholder"],
  contextKey: Symbol('uifn.Command'),
  createController: createCommandController as never,
};
