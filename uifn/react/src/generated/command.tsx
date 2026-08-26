'use client';

import * as React from 'react';
import { createCommandController, type CommandProps, type CommandController } from '@uifn/core/primitives/command';
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

const CommandContext = React.createContext<ReactPrimitiveBridge<CommandProps> | null>(null);
const CommandDefinition: ReactPrimitiveDefinition<CommandProps> = {
  name: 'Command',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","inputValue","defaultInputValue","items","multiple","loop","name","disabled","readOnly","required","placeholder"],
  context: CommandContext,
  createController: createCommandController as never,
};

export type CommandRootProps = ReactPrimitiveRootProps<CommandProps, 'div'>;
export const CommandRoot = React.forwardRef<React.ElementRef<'div'>, CommandRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={CommandDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandRoot.displayName = 'CommandRoot';

export type CommandLabelProps = ReactPrimitivePartProps<CommandController['parts']['label'], 'label', false>;
export const CommandLabel = React.forwardRef<React.ElementRef<'label'>, CommandLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={CommandDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandLabel.displayName = 'CommandLabel';

export type CommandInputProps = ReactPrimitivePartProps<CommandController['parts']['input'], 'input', false>;
export const CommandInput = React.forwardRef<React.ElementRef<'input'>, CommandInputProps>((props, ref) => (
  <ReactPrimitivePart definition={CommandDefinition as never} part="input" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandInput.displayName = 'CommandInput';

export type CommandListProps = ReactPrimitivePartProps<CommandController['parts']['list'], 'div', false>;
export const CommandList = React.forwardRef<React.ElementRef<'div'>, CommandListProps>((props, ref) => (
  <ReactPrimitivePart definition={CommandDefinition as never} part="list" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandList.displayName = 'CommandList';

export type CommandEmptyProps = ReactPrimitivePartProps<CommandController['parts']['empty'], 'div', false>;
export const CommandEmpty = React.forwardRef<React.ElementRef<'div'>, CommandEmptyProps>((props, ref) => (
  <ReactPrimitivePart definition={CommandDefinition as never} part="empty" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandEmpty.displayName = 'CommandEmpty';

export type CommandLoadingProps = ReactPrimitivePartProps<CommandController['parts']['loading'], 'div', false>;
export const CommandLoading = React.forwardRef<React.ElementRef<'div'>, CommandLoadingProps>((props, ref) => (
  <ReactPrimitivePart definition={CommandDefinition as never} part="loading" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandLoading.displayName = 'CommandLoading';

export type CommandGroupProps = ReactPrimitivePartProps<CommandController['parts']['group'], 'div', true>;
export const CommandGroup = React.forwardRef<React.ElementRef<'div'>, CommandGroupProps>((props, ref) => (
  <ReactPrimitivePart definition={CommandDefinition as never} part="group" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandGroup.displayName = 'CommandGroup';

export type CommandGroupHeadingProps = ReactPrimitivePartProps<CommandController['parts']['groupHeading'], 'div', true>;
export const CommandGroupHeading = React.forwardRef<React.ElementRef<'div'>, CommandGroupHeadingProps>((props, ref) => (
  <ReactPrimitivePart definition={CommandDefinition as never} part="groupHeading" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandGroupHeading.displayName = 'CommandGroupHeading';

export type CommandItemProps = ReactPrimitivePartProps<CommandController['parts']['item'], 'div', true>;
export const CommandItem = React.forwardRef<React.ElementRef<'div'>, CommandItemProps>((props, ref) => (
  <ReactPrimitivePart definition={CommandDefinition as never} part="item" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandItem.displayName = 'CommandItem';

export type CommandItemIndicatorProps = ReactPrimitivePartProps<CommandController['parts']['itemIndicator'], 'span', true>;
export const CommandItemIndicator = React.forwardRef<React.ElementRef<'span'>, CommandItemIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={CommandDefinition as never} part="itemIndicator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandItemIndicator.displayName = 'CommandItemIndicator';

export type CommandSeparatorProps = ReactPrimitivePartProps<CommandController['parts']['separator'], 'div', true>;
export const CommandSeparator = React.forwardRef<React.ElementRef<'div'>, CommandSeparatorProps>((props, ref) => (
  <ReactPrimitivePart definition={CommandDefinition as never} part="separator" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandSeparator.displayName = 'CommandSeparator';

export type CommandShortcutProps = ReactPrimitivePartProps<CommandController['parts']['shortcut'], 'kbd', true>;
export const CommandShortcut = React.forwardRef<React.ElementRef<'kbd'>, CommandShortcutProps>((props, ref) => (
  <ReactPrimitivePart definition={CommandDefinition as never} part="shortcut" element="kbd" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandShortcut.displayName = 'CommandShortcut';

export type CommandHiddenInputProps = ReactPrimitivePartProps<CommandController['parts']['hiddenInput'], 'input', false>;
export const CommandHiddenInput = React.forwardRef<React.ElementRef<'input'>, CommandHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={CommandDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CommandHiddenInput.displayName = 'CommandHiddenInput';

export const CommandProvider = CommandRoot;
export function useCommand(inputs: CommandProps = {} as CommandProps): ReactPrimitiveHookResult<CommandController['state'], CommandController['actions']> {
  return useReactPrimitive(CommandDefinition, inputs) as ReactPrimitiveHookResult<CommandController['state'], CommandController['actions']>;
}
export const Command = Object.assign(CommandRoot, { Provider: CommandProvider, Root: CommandRoot, Label: CommandLabel, Input: CommandInput, List: CommandList, Empty: CommandEmpty, Loading: CommandLoading, Group: CommandGroup, GroupHeading: CommandGroupHeading, Item: CommandItem, ItemIndicator: CommandItemIndicator, Separator: CommandSeparator, Shortcut: CommandShortcut, HiddenInput: CommandHiddenInput });
