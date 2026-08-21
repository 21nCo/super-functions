import { createSplitterController, type SplitterProps } from '@uifn/core/primitives/splitter';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const SplitterDefinition: SveltePrimitiveDefinition<SplitterProps> = {
  name: 'Splitter',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["sizes","defaultSizes","minSizes","maxSizes","orientation","dir","disabled"],
  contextKey: Symbol('uifn.Splitter'),
  createController: createSplitterController as never,
};
