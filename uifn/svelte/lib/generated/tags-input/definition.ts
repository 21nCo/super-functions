import { createTagsInputController, type TagsInputProps } from '@uifn/core/primitives/tags-input';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const TagsInputDefinition: SveltePrimitiveDefinition<TagsInputProps> = {
  name: 'TagsInput',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","allowDuplicates","max","delimiter","name","disabled","readOnly","required"],
  contextKey: Symbol('uifn.TagsInput'),
  createController: createTagsInputController as never,
};
