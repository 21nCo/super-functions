import { createContext, type JSX } from 'solid-js';
import { createSplitterController, type SplitterProps, type SplitterController } from '@uifn/core/primitives/splitter';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const SplitterContext = createContext<SolidPrimitiveContextValue<SplitterProps>>();
export const SplitterDefinition: SolidPrimitiveDefinition<SplitterProps> = {
  name: 'Splitter',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["sizes","defaultSizes","minSizes","maxSizes","orientation","dir","disabled"],
  context: SplitterContext,
  createController: createSplitterController as never,
};

function SplitterRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SplitterRootProps = SolidPrimitiveRootProps<SplitterProps, 'div'>;
export function SplitterRoot(props: SplitterRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={SplitterDefinition} element="div" renderElement={SplitterRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function SplitterPanelElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SplitterPanelProps = SolidPrimitivePartProps<SplitterController['parts']['panel'], 'div', true>;
export function SplitterPanel(props: SplitterPanelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SplitterDefinition as never}
      part="panel"
      element="div"
      renderElement={SplitterPanelElement as never}
      many={true}
      props={props as never}
    />
  );
}

function SplitterResizeTriggerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SplitterResizeTriggerProps = SolidPrimitivePartProps<SplitterController['parts']['resizeTrigger'], 'div', true>;
export function SplitterResizeTrigger(props: SplitterResizeTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SplitterDefinition as never}
      part="resizeTrigger"
      element="div"
      renderElement={SplitterResizeTriggerElement as never}
      many={true}
      props={props as never}
    />
  );
}

function SplitterResizeHandleElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SplitterResizeHandleProps = SolidPrimitivePartProps<SplitterController['parts']['resizeHandle'], 'div', true>;
export function SplitterResizeHandle(props: SplitterResizeHandleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SplitterDefinition as never}
      part="resizeHandle"
      element="div"
      renderElement={SplitterResizeHandleElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const SplitterProvider = SplitterRoot;
export const Splitter = /* @__PURE__ */ Object.assign(SplitterRoot, { Provider: SplitterProvider, Root: SplitterRoot, Panel: SplitterPanel, ResizeTrigger: SplitterResizeTrigger, ResizeHandle: SplitterResizeHandle });
