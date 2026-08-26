import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createUIFnError } from '../errors';
import {
  createUIFnOverlayBase,
  overlayStateData,
  type UIFnOverlayBaseActions,
  type UIFnOverlayBaseState,
  type UIFnOverlayCommonProps,
  type UIFnStaticOverlayPart,
} from './overlay';

export interface TourStep {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly target: string;
}

export type TourPhase = 'closed' | 'locating' | 'open' | 'transitioning' | 'complete';

export interface TourProps extends UIFnOverlayCommonProps {
  steps: readonly TourStep[];
  step?: number;
  defaultStep?: number;
  onStepChange?: (step: number) => void;
  onSkip?: () => void;
  onComplete?: () => void;
  onTargetMissing?: (step: TourStep) => void;
}

export interface TourState extends UIFnOverlayBaseState {
  readonly tourPhase: TourPhase;
  readonly step: number;
  readonly stepCount: number;
  readonly currentStep: TourStep | null;
  readonly stepControlled: boolean;
}

export interface TourActions extends UIFnOverlayBaseActions {
  next(): void;
  previous(): void;
  goTo(step: number): void;
  skip(): void;
  targetMissing(): void;
}

export interface TourControllerParts {
  root: UIFnStaticOverlayPart;
  portal: UIFnStaticOverlayPart;
  backdrop: UIFnStaticOverlayPart;
  spotlight: UIFnStaticOverlayPart;
  positioner: UIFnStaticOverlayPart;
  content: UIFnStaticOverlayPart;
  title: UIFnStaticOverlayPart;
  description: UIFnStaticOverlayPart;
  previous: UIFnStaticOverlayPart;
  next: UIFnStaticOverlayPart;
  skip: UIFnStaticOverlayPart;
  close: UIFnStaticOverlayPart;
  progress: UIFnStaticOverlayPart;
}

export type TourController = UIFnController<TourState, TourActions, TourControllerParts, TourProps>;

function validateSteps(steps: readonly TourStep[]): readonly TourStep[] {
  if (steps.length === 0 || new Set(steps.map((step) => step.id)).size !== steps.length) {
    throw createUIFnError({
      code: 'UIFN_ERR_INVALID_VALUE',
      package: '@uifn/core',
      component: 'Tour',
      message: 'Tour steps MUST be non-empty with unique ids.',
    });
  }
  return Object.freeze(steps.map((step) => Object.freeze({ ...step })));
}

export function createTourController(
  props: TourProps,
  env: UIFnEnvironment = {},
): TourController {
  const steps = validateSteps(props.steps);
  const stepControlled = props.step !== undefined;
  let currentStep = Math.min(steps.length - 1, Math.max(0, props.step ?? props.defaultStep ?? 0));
  let tourPhase: TourPhase = (props.open ?? props.defaultOpen ?? false) ? 'open' : 'closed';
  const base = createUIFnOverlayBase({ primitive: 'Tour', props, env, defaultPlacement: 'bottom' });
  const commitStep = (next: number, reason: string) => {
    const clamped = Math.min(steps.length - 1, Math.max(0, Math.trunc(next)));
    props.onStepChange?.(clamped);
    if (!stepControlled) currentStep = clamped;
    tourPhase = 'transitioning';
    base.patchState({ lastChangeReason: reason }, reason);
    tourPhase = 'open';
    base.patchState({ lastChangeReason: `${reason}-complete` }, `${reason}-complete`);
  };
  const actions: TourActions = {
    ...base.actions,
    next() {
      if (currentStep >= steps.length - 1) {
        tourPhase = 'complete';
        props.onComplete?.();
        base.actions.close('close-complete');
        return;
      }
      commitStep(currentStep + 1, 'next-step');
    },
    previous() { commitStep(currentStep - 1, 'previous-step'); },
    goTo(step) {
      if (!Number.isFinite(step)) return;
      commitStep(step, 'go-to-step');
    },
    skip() {
      tourPhase = 'complete';
      props.onSkip?.();
      base.actions.close('close-skip');
    },
    targetMissing() {
      tourPhase = 'locating';
      props.onTargetMissing?.(steps[currentStep]);
      base.patchState({ lastChangeReason: 'target-missing' }, 'target-missing');
    },
  };
  const ids = base.ids;
  const data = () => ({
    ...overlayStateData(base.getState()),
    step: currentStep,
    phase: tourPhase,
  });
  const parts: TourControllerParts = {
    root: base.part('root', () => ({ id: ids.rootId, data: data() }), { id: true, data: ['state'] }),
    portal: base.part('portal', () => ({ id: ids.portalId, data: data() }), { id: true, data: ['state'] }),
    backdrop: base.part('backdrop', () => ({
      id: ids.backdropId, aria: { hidden: true }, data: data(),
      hidden: !base.getState().open && !base.getState().forceMount,
    }), { id: true, aria: ['hidden'], data: ['state'] }),
    spotlight: base.part('spotlight', () => ({
      id: `${ids.rootId}-spotlight`, aria: { hidden: true }, data: data(),
    }), { id: true, aria: ['hidden'] }),
    positioner: base.part('positioner', () => ({ id: ids.positionerId, data: data() }), { id: true, data: ['state'] }),
    content: base.part('content', () => {
      const state = base.getState();
      return {
        role: 'dialog', id: ids.contentId, tabIndex: -1,
        aria: {
          modal: state.modal || undefined,
          label: state.accessibleName ?? undefined,
          labelledby: state.accessibleName ? undefined : ids.titleId,
          describedby: ids.descriptionId,
        },
        data: data(), hidden: !state.open && !state.forceMount,
      };
    }, { role: true, id: true, tabIndex: true, data: ['state'] }),
    title: base.part('title', () => ({ id: ids.titleId, data: data() }), { id: true }),
    description: base.part('description', () => ({ id: ids.descriptionId, data: data() }), { id: true }),
    previous: base.part('previous', () => ({
      role: 'button', id: `${ids.contentId}-previous`, tabIndex: 0,
      attributes: { type: 'button' }, disabled: currentStep === 0,
      data: data(), on: { click: () => actions.previous() },
    }), { role: true, id: true, tabIndex: true, attributes: ['type'] }),
    next: base.part('next', () => ({
      role: 'button', id: `${ids.contentId}-next`, tabIndex: 0,
      attributes: { type: 'button' }, data: { ...data(), autofocus: 'primary' },
      on: { click: () => actions.next() },
    }), { role: true, id: true, tabIndex: true, attributes: ['type'] }),
    skip: base.part('skip', () => ({
      role: 'button', id: `${ids.contentId}-skip`, tabIndex: 0,
      attributes: { type: 'button' }, data: data(), on: { click: () => actions.skip() },
    }), { role: true, id: true, tabIndex: true, attributes: ['type'] }),
    close: base.part('close', () => ({
      role: 'button', id: ids.closeId, tabIndex: 0,
      attributes: { type: 'button', 'aria-label': 'Close tour' },
      data: data(), on: { click: () => actions.close('close-trigger') },
    }), { role: true, id: true, tabIndex: true, attributes: ['type'] }),
    progress: base.part('progress', () => ({
      role: 'status', id: `${ids.contentId}-progress`,
      aria: { live: 'polite', atomic: true, label: `Step ${currentStep + 1} of ${steps.length}` },
      data: data(),
    }), { role: true, id: true, aria: ['live', 'label'] }),
  };
  const getState = (): TourState => ({
    ...base.getState(),
    tourPhase: base.getState().open ? tourPhase : (tourPhase === 'complete' ? 'complete' : 'closed'),
    step: currentStep,
    stepCount: steps.length,
    currentStep: steps[currentStep] ?? null,
    stepControlled,
  });
  return base.controller(actions, parts, getState, (inputs) => {
    if (inputs.step !== undefined) {
      currentStep = Math.min(steps.length - 1, Math.max(0, Math.trunc(inputs.step)));
      base.patchState({ lastChangeReason: 'controlled-step-sync' }, 'controlled-step-sync');
    }
  }) as TourController;
}
