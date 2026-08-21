import { createToastController, type ToastProps } from '@uifn/core/primitives/toast';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const ToastDefinition: SveltePrimitiveDefinition<ToastProps> = {
  name: 'Toast',
  family: 'status-feedback',
  kind: 'interactive-controller',
  rootPart: 'viewport',
  inputNames: ["toasts","limit","duration","placement","pauseOnHover","pauseOnFocus","duplicatePolicy","messages","onDismiss","onRemove","onAnnounce"],
  contextKey: Symbol('uifn.Toast'),
  createController: createToastController as never,
};
