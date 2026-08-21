import type { ComponentProps } from 'svelte';
import SegmentGroupRootComponent from './Root.svelte';
import SegmentGroupLabelComponent from './Label.svelte';
import SegmentGroupItemComponent from './Item.svelte';
import SegmentGroupItemTextComponent from './ItemText.svelte';
import SegmentGroupIndicatorComponent from './Indicator.svelte';
import SegmentGroupHiddenInputComponent from './HiddenInput.svelte';

export const SegmentGroupRoot = SegmentGroupRootComponent;
export type SegmentGroupRootProps = ComponentProps<typeof SegmentGroupRootComponent>;

export const SegmentGroupLabel = SegmentGroupLabelComponent;
export type SegmentGroupLabelProps = ComponentProps<typeof SegmentGroupLabelComponent>;

export const SegmentGroupItem = SegmentGroupItemComponent;
export type SegmentGroupItemProps = ComponentProps<typeof SegmentGroupItemComponent>;

export const SegmentGroupItemText = SegmentGroupItemTextComponent;
export type SegmentGroupItemTextProps = ComponentProps<typeof SegmentGroupItemTextComponent>;

export const SegmentGroupIndicator = SegmentGroupIndicatorComponent;
export type SegmentGroupIndicatorProps = ComponentProps<typeof SegmentGroupIndicatorComponent>;

export const SegmentGroupHiddenInput = SegmentGroupHiddenInputComponent;
export type SegmentGroupHiddenInputProps = ComponentProps<typeof SegmentGroupHiddenInputComponent>;

export const SegmentGroupProvider = SegmentGroupRoot;
export const SegmentGroup = Object.assign(SegmentGroupRoot, { Provider: SegmentGroupProvider, Root: SegmentGroupRoot, Label: SegmentGroupLabel, Item: SegmentGroupItem, ItemText: SegmentGroupItemText, Indicator: SegmentGroupIndicator, HiddenInput: SegmentGroupHiddenInput });
