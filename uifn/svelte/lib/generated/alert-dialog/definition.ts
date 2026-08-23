import { createAlertDialogController, type AlertDialogProps } from '@uifn/core/primitives/alert-dialog';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const AlertDialogDefinition: SveltePrimitiveDefinition<AlertDialogProps> = {
  name: 'AlertDialog',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","initialFocus","restoreFocus"],
  contextKey: Symbol('uifn.AlertDialog'),
  createController: createAlertDialogController as never,
};
