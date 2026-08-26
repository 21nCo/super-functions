import { createClipboardController, type ClipboardProps } from '@uifn/core/primitives/clipboard';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const ClipboardDefinition: SveltePrimitiveDefinition<ClipboardProps> = {
  name: 'Clipboard',
  family: 'status-feedback',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","timeout","disabled"],
  contextKey: Symbol('uifn.Clipboard'),
  createController: createClipboardController as never,
};
