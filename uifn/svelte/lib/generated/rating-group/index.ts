import type { ComponentProps } from 'svelte';
import RatingGroupRootComponent from './Root.svelte';
import RatingGroupLabelComponent from './Label.svelte';
import RatingGroupControlComponent from './Control.svelte';
import RatingGroupItemComponent from './Item.svelte';
import RatingGroupItemIndicatorComponent from './ItemIndicator.svelte';
import RatingGroupHiddenInputComponent from './HiddenInput.svelte';
import RatingGroupValueTextComponent from './ValueText.svelte';

export const RatingGroupRoot = RatingGroupRootComponent;
export type RatingGroupRootProps = ComponentProps<typeof RatingGroupRootComponent>;

export const RatingGroupLabel = RatingGroupLabelComponent;
export type RatingGroupLabelProps = ComponentProps<typeof RatingGroupLabelComponent>;

export const RatingGroupControl = RatingGroupControlComponent;
export type RatingGroupControlProps = ComponentProps<typeof RatingGroupControlComponent>;

export const RatingGroupItem = RatingGroupItemComponent;
export type RatingGroupItemProps = ComponentProps<typeof RatingGroupItemComponent>;

export const RatingGroupItemIndicator = RatingGroupItemIndicatorComponent;
export type RatingGroupItemIndicatorProps = ComponentProps<typeof RatingGroupItemIndicatorComponent>;

export const RatingGroupHiddenInput = RatingGroupHiddenInputComponent;
export type RatingGroupHiddenInputProps = ComponentProps<typeof RatingGroupHiddenInputComponent>;

export const RatingGroupValueText = RatingGroupValueTextComponent;
export type RatingGroupValueTextProps = ComponentProps<typeof RatingGroupValueTextComponent>;

export const RatingGroupProvider = RatingGroupRoot;
export const RatingGroup = Object.assign(RatingGroupRoot, { Provider: RatingGroupProvider, Root: RatingGroupRoot, Label: RatingGroupLabel, Control: RatingGroupControl, Item: RatingGroupItem, ItemIndicator: RatingGroupItemIndicator, HiddenInput: RatingGroupHiddenInput, ValueText: RatingGroupValueText });
