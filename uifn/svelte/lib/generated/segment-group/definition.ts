import { createSegmentGroupController, type SegmentGroupProps } from '@uifn/core/primitives/segment-group';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const SegmentGroupDefinition: SveltePrimitiveDefinition<SegmentGroupProps> = {
  name: 'SegmentGroup',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","orientation","disabled","readOnly","required"],
  contextKey: Symbol('uifn.SegmentGroup'),
  createController: createSegmentGroupController as never,
};
