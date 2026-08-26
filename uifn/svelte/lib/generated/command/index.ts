import type { ComponentProps } from 'svelte';
import CommandRootComponent from './Root.svelte';
import CommandLabelComponent from './Label.svelte';
import CommandInputComponent from './Input.svelte';
import CommandListComponent from './List.svelte';
import CommandEmptyComponent from './Empty.svelte';
import CommandLoadingComponent from './Loading.svelte';
import CommandGroupComponent from './Group.svelte';
import CommandGroupHeadingComponent from './GroupHeading.svelte';
import CommandItemComponent from './Item.svelte';
import CommandItemIndicatorComponent from './ItemIndicator.svelte';
import CommandSeparatorComponent from './Separator.svelte';
import CommandShortcutComponent from './Shortcut.svelte';
import CommandHiddenInputComponent from './HiddenInput.svelte';

export const CommandRoot = CommandRootComponent;
export type CommandRootProps = ComponentProps<typeof CommandRootComponent>;

export const CommandLabel = CommandLabelComponent;
export type CommandLabelProps = ComponentProps<typeof CommandLabelComponent>;

export const CommandInput = CommandInputComponent;
export type CommandInputProps = ComponentProps<typeof CommandInputComponent>;

export const CommandList = CommandListComponent;
export type CommandListProps = ComponentProps<typeof CommandListComponent>;

export const CommandEmpty = CommandEmptyComponent;
export type CommandEmptyProps = ComponentProps<typeof CommandEmptyComponent>;

export const CommandLoading = CommandLoadingComponent;
export type CommandLoadingProps = ComponentProps<typeof CommandLoadingComponent>;

export const CommandGroup = CommandGroupComponent;
export type CommandGroupProps = ComponentProps<typeof CommandGroupComponent>;

export const CommandGroupHeading = CommandGroupHeadingComponent;
export type CommandGroupHeadingProps = ComponentProps<typeof CommandGroupHeadingComponent>;

export const CommandItem = CommandItemComponent;
export type CommandItemProps = ComponentProps<typeof CommandItemComponent>;

export const CommandItemIndicator = CommandItemIndicatorComponent;
export type CommandItemIndicatorProps = ComponentProps<typeof CommandItemIndicatorComponent>;

export const CommandSeparator = CommandSeparatorComponent;
export type CommandSeparatorProps = ComponentProps<typeof CommandSeparatorComponent>;

export const CommandShortcut = CommandShortcutComponent;
export type CommandShortcutProps = ComponentProps<typeof CommandShortcutComponent>;

export const CommandHiddenInput = CommandHiddenInputComponent;
export type CommandHiddenInputProps = ComponentProps<typeof CommandHiddenInputComponent>;

export const CommandProvider = CommandRoot;
export const Command = Object.assign(CommandRoot, { Provider: CommandProvider, Root: CommandRoot, Label: CommandLabel, Input: CommandInput, List: CommandList, Empty: CommandEmpty, Loading: CommandLoading, Group: CommandGroup, GroupHeading: CommandGroupHeading, Item: CommandItem, ItemIndicator: CommandItemIndicator, Separator: CommandSeparator, Shortcut: CommandShortcut, HiddenInput: CommandHiddenInput });
