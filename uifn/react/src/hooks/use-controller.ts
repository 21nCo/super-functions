import * as React from 'react';
import type { UIFnController, UIFnEnvironment } from '@uifn/core';

type AnyController = UIFnController<unknown, object, object>;

function createReactEnvironment(id: string): UIFnEnvironment {
  const token = id.replace(/[^a-zA-Z0-9_-]/g, '');

  return {
    generateId(scope) {
      return `${scope}-${token}`;
    },
  };
}

export function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = React.useRef(value);
  ref.current = value;
  return ref;
}

export function useController<TController extends AnyController>(
  createController: (env: UIFnEnvironment) => TController
): TController {
  const reactId = React.useId();
  const controllerRef = React.useRef<TController | null>(null);
  const destroyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = createController(createReactEnvironment(reactId));
  }

  const controller = controllerRef.current;
  React.useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState
  );

  React.useEffect(() => {
    if (destroyTimerRef.current) {
      clearTimeout(destroyTimerRef.current);
      destroyTimerRef.current = null;
    }

    return () => {
      const controllerToDestroy = controller;
      destroyTimerRef.current = setTimeout(() => {
        if (controllerRef.current === controllerToDestroy) {
          controllerToDestroy.destroy();
          controllerRef.current = null;
        }
        destroyTimerRef.current = null;
      }, 0);
    };
  }, [controller]);

  return controller;
}
