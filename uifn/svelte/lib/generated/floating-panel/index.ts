import type { ComponentProps } from 'svelte';
import FloatingPanelRootComponent from './Root.svelte';
import FloatingPanelTriggerComponent from './Trigger.svelte';
import FloatingPanelPositionerComponent from './Positioner.svelte';
import FloatingPanelContentComponent from './Content.svelte';
import FloatingPanelHeaderComponent from './Header.svelte';
import FloatingPanelTitleComponent from './Title.svelte';
import FloatingPanelDescriptionComponent from './Description.svelte';
import FloatingPanelDragHandleComponent from './DragHandle.svelte';
import FloatingPanelResizeHandleComponent from './ResizeHandle.svelte';
import FloatingPanelCloseComponent from './Close.svelte';

export const FloatingPanelRoot = FloatingPanelRootComponent;
export type FloatingPanelRootProps = ComponentProps<typeof FloatingPanelRootComponent>;

export const FloatingPanelTrigger = FloatingPanelTriggerComponent;
export type FloatingPanelTriggerProps = ComponentProps<typeof FloatingPanelTriggerComponent>;

export const FloatingPanelPositioner = FloatingPanelPositionerComponent;
export type FloatingPanelPositionerProps = ComponentProps<typeof FloatingPanelPositionerComponent>;

export const FloatingPanelContent = FloatingPanelContentComponent;
export type FloatingPanelContentProps = ComponentProps<typeof FloatingPanelContentComponent>;

export const FloatingPanelHeader = FloatingPanelHeaderComponent;
export type FloatingPanelHeaderProps = ComponentProps<typeof FloatingPanelHeaderComponent>;

export const FloatingPanelTitle = FloatingPanelTitleComponent;
export type FloatingPanelTitleProps = ComponentProps<typeof FloatingPanelTitleComponent>;

export const FloatingPanelDescription = FloatingPanelDescriptionComponent;
export type FloatingPanelDescriptionProps = ComponentProps<typeof FloatingPanelDescriptionComponent>;

export const FloatingPanelDragHandle = FloatingPanelDragHandleComponent;
export type FloatingPanelDragHandleProps = ComponentProps<typeof FloatingPanelDragHandleComponent>;

export const FloatingPanelResizeHandle = FloatingPanelResizeHandleComponent;
export type FloatingPanelResizeHandleProps = ComponentProps<typeof FloatingPanelResizeHandleComponent>;

export const FloatingPanelClose = FloatingPanelCloseComponent;
export type FloatingPanelCloseProps = ComponentProps<typeof FloatingPanelCloseComponent>;

export const FloatingPanelProvider = FloatingPanelRoot;
export const FloatingPanel = Object.assign(FloatingPanelRoot, { Provider: FloatingPanelProvider, Root: FloatingPanelRoot, Trigger: FloatingPanelTrigger, Positioner: FloatingPanelPositioner, Content: FloatingPanelContent, Header: FloatingPanelHeader, Title: FloatingPanelTitle, Description: FloatingPanelDescription, DragHandle: FloatingPanelDragHandle, ResizeHandle: FloatingPanelResizeHandle, Close: FloatingPanelClose });
