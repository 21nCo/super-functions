import { createTimerController, type TimerProps } from '@uifn/core/primitives/timer';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const TimerDefinition: SveltePrimitiveDefinition<TimerProps> = {
  name: 'Timer',
  family: 'status-feedback',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["duration","remaining","defaultRemaining","direction","autoStart","announceInterval"],
  contextKey: Symbol('uifn.Timer'),
  createController: createTimerController as never,
};
