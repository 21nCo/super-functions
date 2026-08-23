import { createContext, type JSX } from 'solid-js';
import { createClipboardController, type ClipboardProps, type ClipboardController } from '@uifn/core/primitives/clipboard';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ClipboardContext = createContext<SolidPrimitiveContextValue<ClipboardProps>>();
export const ClipboardDefinition: SolidPrimitiveDefinition<ClipboardProps> = {
  name: 'Clipboard',
  family: 'status-feedback',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","timeout","disabled"],
  context: ClipboardContext,
  createController: createClipboardController as never,
};

function ClipboardRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ClipboardRootProps = SolidPrimitiveRootProps<ClipboardProps, 'div'>;
export function ClipboardRoot(props: ClipboardRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ClipboardDefinition} element="div" renderElement={ClipboardRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function ClipboardTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type ClipboardTriggerProps = SolidPrimitivePartProps<ClipboardController['parts']['trigger'], 'button', false>;
export function ClipboardTrigger(props: ClipboardTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ClipboardDefinition as never}
      part="trigger"
      element="button"
      renderElement={ClipboardTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ClipboardStatusElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type ClipboardStatusProps = SolidPrimitivePartProps<ClipboardController['parts']['status'], 'span', false>;
export function ClipboardStatus(props: ClipboardStatusProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ClipboardDefinition as never}
      part="status"
      element="span"
      renderElement={ClipboardStatusElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const ClipboardProvider = ClipboardRoot;
export const Clipboard = /* @__PURE__ */ Object.assign(ClipboardRoot, { Provider: ClipboardProvider, Root: ClipboardRoot, Trigger: ClipboardTrigger, Status: ClipboardStatus });
