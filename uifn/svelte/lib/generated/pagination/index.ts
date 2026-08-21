import type { ComponentProps } from 'svelte';
import PaginationRootComponent from './Root.svelte';
import PaginationListComponent from './List.svelte';
import PaginationItemComponent from './Item.svelte';
import PaginationPageTriggerComponent from './PageTrigger.svelte';
import PaginationPreviousComponent from './Previous.svelte';
import PaginationNextComponent from './Next.svelte';
import PaginationEllipsisComponent from './Ellipsis.svelte';

export const PaginationRoot = PaginationRootComponent;
export type PaginationRootProps = ComponentProps<typeof PaginationRootComponent>;

export const PaginationList = PaginationListComponent;
export type PaginationListProps = ComponentProps<typeof PaginationListComponent>;

export const PaginationItem = PaginationItemComponent;
export type PaginationItemProps = ComponentProps<typeof PaginationItemComponent>;

export const PaginationPageTrigger = PaginationPageTriggerComponent;
export type PaginationPageTriggerProps = ComponentProps<typeof PaginationPageTriggerComponent>;

export const PaginationPrevious = PaginationPreviousComponent;
export type PaginationPreviousProps = ComponentProps<typeof PaginationPreviousComponent>;

export const PaginationNext = PaginationNextComponent;
export type PaginationNextProps = ComponentProps<typeof PaginationNextComponent>;

export const PaginationEllipsis = PaginationEllipsisComponent;
export type PaginationEllipsisProps = ComponentProps<typeof PaginationEllipsisComponent>;

export const PaginationProvider = PaginationRoot;
export const Pagination = Object.assign(PaginationRoot, { Provider: PaginationProvider, Root: PaginationRoot, List: PaginationList, Item: PaginationItem, PageTrigger: PaginationPageTrigger, Previous: PaginationPrevious, Next: PaginationNext, Ellipsis: PaginationEllipsis });
