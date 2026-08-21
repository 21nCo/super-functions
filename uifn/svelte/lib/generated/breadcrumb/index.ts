import type { ComponentProps } from 'svelte';
import BreadcrumbRootComponent from './Root.svelte';
import BreadcrumbListComponent from './List.svelte';
import BreadcrumbItemComponent from './Item.svelte';
import BreadcrumbLinkComponent from './Link.svelte';
import BreadcrumbPageComponent from './Page.svelte';
import BreadcrumbSeparatorComponent from './Separator.svelte';
import BreadcrumbEllipsisComponent from './Ellipsis.svelte';

export const BreadcrumbRoot = BreadcrumbRootComponent;
export type BreadcrumbRootProps = ComponentProps<typeof BreadcrumbRootComponent>;

export const BreadcrumbList = BreadcrumbListComponent;
export type BreadcrumbListProps = ComponentProps<typeof BreadcrumbListComponent>;

export const BreadcrumbItem = BreadcrumbItemComponent;
export type BreadcrumbItemProps = ComponentProps<typeof BreadcrumbItemComponent>;

export const BreadcrumbLink = BreadcrumbLinkComponent;
export type BreadcrumbLinkProps = ComponentProps<typeof BreadcrumbLinkComponent>;

export const BreadcrumbPage = BreadcrumbPageComponent;
export type BreadcrumbPageProps = ComponentProps<typeof BreadcrumbPageComponent>;

export const BreadcrumbSeparator = BreadcrumbSeparatorComponent;
export type BreadcrumbSeparatorProps = ComponentProps<typeof BreadcrumbSeparatorComponent>;

export const BreadcrumbEllipsis = BreadcrumbEllipsisComponent;
export type BreadcrumbEllipsisProps = ComponentProps<typeof BreadcrumbEllipsisComponent>;

export const BreadcrumbProvider = BreadcrumbRoot;
export const Breadcrumb = Object.assign(BreadcrumbRoot, { Provider: BreadcrumbProvider, Root: BreadcrumbRoot, List: BreadcrumbList, Item: BreadcrumbItem, Link: BreadcrumbLink, Page: BreadcrumbPage, Separator: BreadcrumbSeparator, Ellipsis: BreadcrumbEllipsis });
