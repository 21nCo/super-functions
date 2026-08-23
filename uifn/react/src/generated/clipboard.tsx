'use client';

import * as React from 'react';
import { createClipboardController, type ClipboardProps, type ClipboardController } from '@uifn/core/primitives/clipboard';
import {
  ReactPrimitivePart,
  ReactPrimitiveRoot,
  useReactPrimitive,
  type ReactPrimitiveBridge,
  type ReactPrimitiveDefinition,
  type ReactPrimitiveHookResult,
  type ReactPrimitivePartProps,
  type ReactPrimitiveRootProps,
} from '../internal/compound';

const ClipboardContext = React.createContext<ReactPrimitiveBridge<ClipboardProps> | null>(null);
const ClipboardDefinition: ReactPrimitiveDefinition<ClipboardProps> = {
  name: 'Clipboard',
  family: 'status-feedback',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","timeout","disabled"],
  context: ClipboardContext,
  createController: createClipboardController as never,
};

export type ClipboardRootProps = ReactPrimitiveRootProps<ClipboardProps, 'div'>;
export const ClipboardRoot = React.forwardRef<React.ElementRef<'div'>, ClipboardRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ClipboardDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ClipboardRoot.displayName = 'ClipboardRoot';

export type ClipboardTriggerProps = ReactPrimitivePartProps<ClipboardController['parts']['trigger'], 'button', false>;
export const ClipboardTrigger = React.forwardRef<React.ElementRef<'button'>, ClipboardTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={ClipboardDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ClipboardTrigger.displayName = 'ClipboardTrigger';

export type ClipboardStatusProps = ReactPrimitivePartProps<ClipboardController['parts']['status'], 'span', false>;
export const ClipboardStatus = React.forwardRef<React.ElementRef<'span'>, ClipboardStatusProps>((props, ref) => (
  <ReactPrimitivePart definition={ClipboardDefinition as never} part="status" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ClipboardStatus.displayName = 'ClipboardStatus';

export const ClipboardProvider = ClipboardRoot;
export function useClipboard(inputs: ClipboardProps = {} as ClipboardProps): ReactPrimitiveHookResult<ClipboardController['state'], ClipboardController['actions']> {
  return useReactPrimitive(ClipboardDefinition, inputs) as ReactPrimitiveHookResult<ClipboardController['state'], ClipboardController['actions']>;
}
export const Clipboard = Object.assign(ClipboardRoot, { Provider: ClipboardProvider, Root: ClipboardRoot, Trigger: ClipboardTrigger, Status: ClipboardStatus });
