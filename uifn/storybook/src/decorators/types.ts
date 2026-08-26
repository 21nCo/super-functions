export interface UifnStoryContext {
  args?: Record<string, unknown>;
  globals?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

export type UifnStoryRender<T = unknown> = (context: UifnStoryContext) => T;
export type UifnStoryDecorator<T = unknown> = (story: UifnStoryRender<T>, context: UifnStoryContext) => T;

export function mergeContext(context: UifnStoryContext, patch: UifnStoryContext): UifnStoryContext {
  return {
    ...context,
    ...patch,
    globals: {
      ...(context.globals ?? {}),
      ...(patch.globals ?? {}),
    },
    parameters: {
      ...(context.parameters ?? {}),
      ...(patch.parameters ?? {}),
    },
  };
}
