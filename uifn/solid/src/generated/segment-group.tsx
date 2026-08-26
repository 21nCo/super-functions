import { createContext, type JSX } from 'solid-js';
import { createSegmentGroupController, type SegmentGroupProps, type SegmentGroupController } from '@uifn/core/primitives/segment-group';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const SegmentGroupContext = createContext<SolidPrimitiveContextValue<SegmentGroupProps>>();
export const SegmentGroupDefinition: SolidPrimitiveDefinition<SegmentGroupProps> = {
  name: 'SegmentGroup',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","orientation","disabled","readOnly","required"],
  context: SegmentGroupContext,
  createController: createSegmentGroupController as never,
};

function SegmentGroupRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SegmentGroupRootProps = SolidPrimitiveRootProps<SegmentGroupProps, 'div'>;
export function SegmentGroupRoot(props: SegmentGroupRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={SegmentGroupDefinition} element="div" renderElement={SegmentGroupRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function SegmentGroupLabelElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type SegmentGroupLabelProps = SolidPrimitivePartProps<SegmentGroupController['parts']['label'], 'span', false>;
export function SegmentGroupLabel(props: SegmentGroupLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SegmentGroupDefinition as never}
      part="label"
      element="span"
      renderElement={SegmentGroupLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SegmentGroupItemElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type SegmentGroupItemProps = SolidPrimitivePartProps<SegmentGroupController['parts']['item'], 'button', true>;
export function SegmentGroupItem(props: SegmentGroupItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SegmentGroupDefinition as never}
      part="item"
      element="button"
      renderElement={SegmentGroupItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function SegmentGroupItemTextElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type SegmentGroupItemTextProps = SolidPrimitivePartProps<SegmentGroupController['parts']['itemText'], 'span', true>;
export function SegmentGroupItemText(props: SegmentGroupItemTextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SegmentGroupDefinition as never}
      part="itemText"
      element="span"
      renderElement={SegmentGroupItemTextElement as never}
      many={true}
      props={props as never}
    />
  );
}

function SegmentGroupIndicatorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SegmentGroupIndicatorProps = SolidPrimitivePartProps<SegmentGroupController['parts']['indicator'], 'div', false>;
export function SegmentGroupIndicator(props: SegmentGroupIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SegmentGroupDefinition as never}
      part="indicator"
      element="div"
      renderElement={SegmentGroupIndicatorElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SegmentGroupHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type SegmentGroupHiddenInputProps = SolidPrimitivePartProps<SegmentGroupController['parts']['hiddenInput'], 'input', false>;
export function SegmentGroupHiddenInput(props: SegmentGroupHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SegmentGroupDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={SegmentGroupHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const SegmentGroupProvider = SegmentGroupRoot;
export const SegmentGroup = /* @__PURE__ */ Object.assign(SegmentGroupRoot, { Provider: SegmentGroupProvider, Root: SegmentGroupRoot, Label: SegmentGroupLabel, Item: SegmentGroupItem, ItemText: SegmentGroupItemText, Indicator: SegmentGroupIndicator, HiddenInput: SegmentGroupHiddenInput });
