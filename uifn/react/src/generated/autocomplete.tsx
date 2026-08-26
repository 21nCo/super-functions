'use client';

import * as React from 'react';
import { createAutocompleteController, type AutocompleteProps, type AutocompleteController } from '@uifn/core/primitives/autocomplete';
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

const AutocompleteContext = React.createContext<ReactPrimitiveBridge<AutocompleteProps> | null>(null);
const AutocompleteDefinition: ReactPrimitiveDefinition<AutocompleteProps> = {
  name: 'Autocomplete',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","items","filter","disabled","readOnly"],
  context: AutocompleteContext,
  createController: createAutocompleteController as never,
};

export type AutocompleteRootProps = ReactPrimitiveRootProps<AutocompleteProps, 'div'>;
export const AutocompleteRoot = React.forwardRef<React.ElementRef<'div'>, AutocompleteRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={AutocompleteDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AutocompleteRoot.displayName = 'AutocompleteRoot';

export type AutocompleteLabelProps = ReactPrimitivePartProps<AutocompleteController['parts']['label'], 'label', false>;
export const AutocompleteLabel = React.forwardRef<React.ElementRef<'label'>, AutocompleteLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={AutocompleteDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AutocompleteLabel.displayName = 'AutocompleteLabel';

export type AutocompleteControlProps = ReactPrimitivePartProps<AutocompleteController['parts']['control'], 'div', false>;
export const AutocompleteControl = React.forwardRef<React.ElementRef<'div'>, AutocompleteControlProps>((props, ref) => (
  <ReactPrimitivePart definition={AutocompleteDefinition as never} part="control" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AutocompleteControl.displayName = 'AutocompleteControl';

export type AutocompleteInputProps = ReactPrimitivePartProps<AutocompleteController['parts']['input'], 'input', false>;
export const AutocompleteInput = React.forwardRef<React.ElementRef<'input'>, AutocompleteInputProps>((props, ref) => (
  <ReactPrimitivePart definition={AutocompleteDefinition as never} part="input" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AutocompleteInput.displayName = 'AutocompleteInput';

export type AutocompleteClearProps = ReactPrimitivePartProps<AutocompleteController['parts']['clear'], 'button', false>;
export const AutocompleteClear = React.forwardRef<React.ElementRef<'button'>, AutocompleteClearProps>((props, ref) => (
  <ReactPrimitivePart definition={AutocompleteDefinition as never} part="clear" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AutocompleteClear.displayName = 'AutocompleteClear';

export type AutocompletePositionerProps = ReactPrimitivePartProps<AutocompleteController['parts']['positioner'], 'div', false>;
export const AutocompletePositioner = React.forwardRef<React.ElementRef<'div'>, AutocompletePositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={AutocompleteDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AutocompletePositioner.displayName = 'AutocompletePositioner';

export type AutocompleteContentProps = ReactPrimitivePartProps<AutocompleteController['parts']['content'], 'div', false>;
export const AutocompleteContent = React.forwardRef<React.ElementRef<'div'>, AutocompleteContentProps>((props, ref) => (
  <ReactPrimitivePart definition={AutocompleteDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AutocompleteContent.displayName = 'AutocompleteContent';

export type AutocompleteItemProps = ReactPrimitivePartProps<AutocompleteController['parts']['item'], 'div', true>;
export const AutocompleteItem = React.forwardRef<React.ElementRef<'div'>, AutocompleteItemProps>((props, ref) => (
  <ReactPrimitivePart definition={AutocompleteDefinition as never} part="item" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AutocompleteItem.displayName = 'AutocompleteItem';

export type AutocompleteEmptyProps = ReactPrimitivePartProps<AutocompleteController['parts']['empty'], 'div', false>;
export const AutocompleteEmpty = React.forwardRef<React.ElementRef<'div'>, AutocompleteEmptyProps>((props, ref) => (
  <ReactPrimitivePart definition={AutocompleteDefinition as never} part="empty" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AutocompleteEmpty.displayName = 'AutocompleteEmpty';

export const AutocompleteProvider = AutocompleteRoot;
export function useAutocomplete(inputs: AutocompleteProps): ReactPrimitiveHookResult<AutocompleteController['state'], AutocompleteController['actions']> {
  return useReactPrimitive(AutocompleteDefinition, inputs) as ReactPrimitiveHookResult<AutocompleteController['state'], AutocompleteController['actions']>;
}
export const Autocomplete = Object.assign(AutocompleteRoot, { Provider: AutocompleteProvider, Root: AutocompleteRoot, Label: AutocompleteLabel, Control: AutocompleteControl, Input: AutocompleteInput, Clear: AutocompleteClear, Positioner: AutocompletePositioner, Content: AutocompleteContent, Item: AutocompleteItem, Empty: AutocompleteEmpty });
