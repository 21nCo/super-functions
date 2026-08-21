import type { ComponentProps } from 'svelte';
import TourRootComponent from './Root.svelte';
import TourPortalComponent from './Portal.svelte';
import TourBackdropComponent from './Backdrop.svelte';
import TourSpotlightComponent from './Spotlight.svelte';
import TourPositionerComponent from './Positioner.svelte';
import TourContentComponent from './Content.svelte';
import TourTitleComponent from './Title.svelte';
import TourDescriptionComponent from './Description.svelte';
import TourPreviousComponent from './Previous.svelte';
import TourNextComponent from './Next.svelte';
import TourSkipComponent from './Skip.svelte';
import TourCloseComponent from './Close.svelte';
import TourProgressComponent from './Progress.svelte';

export const TourRoot = TourRootComponent;
export type TourRootProps = ComponentProps<typeof TourRootComponent>;

export const TourPortal = TourPortalComponent;
export type TourPortalProps = ComponentProps<typeof TourPortalComponent>;

export const TourBackdrop = TourBackdropComponent;
export type TourBackdropProps = ComponentProps<typeof TourBackdropComponent>;

export const TourSpotlight = TourSpotlightComponent;
export type TourSpotlightProps = ComponentProps<typeof TourSpotlightComponent>;

export const TourPositioner = TourPositionerComponent;
export type TourPositionerProps = ComponentProps<typeof TourPositionerComponent>;

export const TourContent = TourContentComponent;
export type TourContentProps = ComponentProps<typeof TourContentComponent>;

export const TourTitle = TourTitleComponent;
export type TourTitleProps = ComponentProps<typeof TourTitleComponent>;

export const TourDescription = TourDescriptionComponent;
export type TourDescriptionProps = ComponentProps<typeof TourDescriptionComponent>;

export const TourPrevious = TourPreviousComponent;
export type TourPreviousProps = ComponentProps<typeof TourPreviousComponent>;

export const TourNext = TourNextComponent;
export type TourNextProps = ComponentProps<typeof TourNextComponent>;

export const TourSkip = TourSkipComponent;
export type TourSkipProps = ComponentProps<typeof TourSkipComponent>;

export const TourClose = TourCloseComponent;
export type TourCloseProps = ComponentProps<typeof TourCloseComponent>;

export const TourProgress = TourProgressComponent;
export type TourProgressProps = ComponentProps<typeof TourProgressComponent>;

export const TourProvider = TourRoot;
export const Tour = Object.assign(TourRoot, { Provider: TourProvider, Root: TourRoot, Portal: TourPortal, Backdrop: TourBackdrop, Spotlight: TourSpotlight, Positioner: TourPositioner, Content: TourContent, Title: TourTitle, Description: TourDescription, Previous: TourPrevious, Next: TourNext, Skip: TourSkip, Close: TourClose, Progress: TourProgress });
