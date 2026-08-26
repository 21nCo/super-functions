import { createContext, type JSX } from 'solid-js';
import { createCommandController, type CommandProps, type CommandController } from '@uifn/core/primitives/command';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const CommandContext = createContext<SolidPrimitiveContextValue<CommandProps>>();
export const CommandDefinition: SolidPrimitiveDefinition<CommandProps> = {
  name: 'Command',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","inputValue","defaultInputValue","items","multiple","loop","name","disabled","readOnly","required","placeholder"],
  context: CommandContext,
  createController: createCommandController as never,
};

function CommandRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CommandRootProps = SolidPrimitiveRootProps<CommandProps, 'div'>;
export function CommandRoot(props: CommandRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={CommandDefinition} element="div" renderElement={CommandRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function CommandLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type CommandLabelProps = SolidPrimitivePartProps<CommandController['parts']['label'], 'label', false>;
export function CommandLabel(props: CommandLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CommandDefinition as never}
      part="label"
      element="label"
      renderElement={CommandLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CommandInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type CommandInputProps = SolidPrimitivePartProps<CommandController['parts']['input'], 'input', false>;
export function CommandInput(props: CommandInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CommandDefinition as never}
      part="input"
      element="input"
      renderElement={CommandInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CommandListElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CommandListProps = SolidPrimitivePartProps<CommandController['parts']['list'], 'div', false>;
export function CommandList(props: CommandListProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CommandDefinition as never}
      part="list"
      element="div"
      renderElement={CommandListElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CommandEmptyElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CommandEmptyProps = SolidPrimitivePartProps<CommandController['parts']['empty'], 'div', false>;
export function CommandEmpty(props: CommandEmptyProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CommandDefinition as never}
      part="empty"
      element="div"
      renderElement={CommandEmptyElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CommandLoadingElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CommandLoadingProps = SolidPrimitivePartProps<CommandController['parts']['loading'], 'div', false>;
export function CommandLoading(props: CommandLoadingProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CommandDefinition as never}
      part="loading"
      element="div"
      renderElement={CommandLoadingElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CommandGroupElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CommandGroupProps = SolidPrimitivePartProps<CommandController['parts']['group'], 'div', true>;
export function CommandGroup(props: CommandGroupProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CommandDefinition as never}
      part="group"
      element="div"
      renderElement={CommandGroupElement as never}
      many={true}
      props={props as never}
    />
  );
}

function CommandGroupHeadingElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CommandGroupHeadingProps = SolidPrimitivePartProps<CommandController['parts']['groupHeading'], 'div', true>;
export function CommandGroupHeading(props: CommandGroupHeadingProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CommandDefinition as never}
      part="groupHeading"
      element="div"
      renderElement={CommandGroupHeadingElement as never}
      many={true}
      props={props as never}
    />
  );
}

function CommandItemElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CommandItemProps = SolidPrimitivePartProps<CommandController['parts']['item'], 'div', true>;
export function CommandItem(props: CommandItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CommandDefinition as never}
      part="item"
      element="div"
      renderElement={CommandItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function CommandItemIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type CommandItemIndicatorProps = SolidPrimitivePartProps<CommandController['parts']['itemIndicator'], 'span', true>;
export function CommandItemIndicator(props: CommandItemIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CommandDefinition as never}
      part="itemIndicator"
      element="span"
      renderElement={CommandItemIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function CommandSeparatorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CommandSeparatorProps = SolidPrimitivePartProps<CommandController['parts']['separator'], 'div', true>;
export function CommandSeparator(props: CommandSeparatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CommandDefinition as never}
      part="separator"
      element="div"
      renderElement={CommandSeparatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function CommandShortcutElement(props: JSX.IntrinsicElements['kbd']): JSX.Element {
  return <kbd {...props} />;
}

export type CommandShortcutProps = SolidPrimitivePartProps<CommandController['parts']['shortcut'], 'kbd', true>;
export function CommandShortcut(props: CommandShortcutProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CommandDefinition as never}
      part="shortcut"
      element="kbd"
      renderElement={CommandShortcutElement as never}
      many={true}
      props={props as never}
    />
  );
}

function CommandHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type CommandHiddenInputProps = SolidPrimitivePartProps<CommandController['parts']['hiddenInput'], 'input', false>;
export function CommandHiddenInput(props: CommandHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CommandDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={CommandHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const CommandProvider = CommandRoot;
export const Command = /* @__PURE__ */ Object.assign(CommandRoot, { Provider: CommandProvider, Root: CommandRoot, Label: CommandLabel, Input: CommandInput, List: CommandList, Empty: CommandEmpty, Loading: CommandLoading, Group: CommandGroup, GroupHeading: CommandGroupHeading, Item: CommandItem, ItemIndicator: CommandItemIndicator, Separator: CommandSeparator, Shortcut: CommandShortcut, HiddenInput: CommandHiddenInput });
