'use client';

import * as React from 'react';
import { createSwitchController, type SwitchProps, type SwitchController } from '@uifn/core/primitives/switch';
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

const SwitchContext = React.createContext<ReactPrimitiveBridge<SwitchProps> | null>(null);
const SwitchDefinition: ReactPrimitiveDefinition<SwitchProps> = {
  name: 'Switch',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["checked","defaultChecked","name","value","disabled","readOnly","required"],
  context: SwitchContext,
  createController: createSwitchController as never,
};

export type SwitchRootProps = ReactPrimitiveRootProps<SwitchProps, 'label'>;
export const SwitchRoot = React.forwardRef<React.ElementRef<'label'>, SwitchRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={SwitchDefinition} element="label" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SwitchRoot.displayName = 'SwitchRoot';

export type SwitchControlProps = ReactPrimitivePartProps<SwitchController['parts']['control'], 'button', false>;
export const SwitchControl = React.forwardRef<React.ElementRef<'button'>, SwitchControlProps>((props, ref) => (
  <ReactPrimitivePart definition={SwitchDefinition as never} part="control" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SwitchControl.displayName = 'SwitchControl';

export type SwitchThumbProps = ReactPrimitivePartProps<SwitchController['parts']['thumb'], 'span', false>;
export const SwitchThumb = React.forwardRef<React.ElementRef<'span'>, SwitchThumbProps>((props, ref) => (
  <ReactPrimitivePart definition={SwitchDefinition as never} part="thumb" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SwitchThumb.displayName = 'SwitchThumb';

export type SwitchLabelProps = ReactPrimitivePartProps<SwitchController['parts']['label'], 'span', false>;
export const SwitchLabel = React.forwardRef<React.ElementRef<'span'>, SwitchLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={SwitchDefinition as never} part="label" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SwitchLabel.displayName = 'SwitchLabel';

export type SwitchHiddenInputProps = ReactPrimitivePartProps<SwitchController['parts']['hiddenInput'], 'input', false>;
export const SwitchHiddenInput = React.forwardRef<React.ElementRef<'input'>, SwitchHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={SwitchDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SwitchHiddenInput.displayName = 'SwitchHiddenInput';

export const SwitchProvider = SwitchRoot;
export function useSwitch(inputs: SwitchProps = {} as SwitchProps): ReactPrimitiveHookResult<SwitchController['state'], SwitchController['actions']> {
  return useReactPrimitive(SwitchDefinition, inputs) as ReactPrimitiveHookResult<SwitchController['state'], SwitchController['actions']>;
}
export const Switch = Object.assign(SwitchRoot, { Provider: SwitchProvider, Root: SwitchRoot, Control: SwitchControl, Thumb: SwitchThumb, Label: SwitchLabel, HiddenInput: SwitchHiddenInput });
