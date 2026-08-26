import { assertContext } from '@uifn/core/errors';

export function assertReactContext<T>(
  value: T | null | undefined,
  component: string,
  message: string
): T {
  return assertContext(value, {
    package: '@uifn/react',
    component,
    message,
  });
}
