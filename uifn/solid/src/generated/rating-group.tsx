import { createContext, type JSX } from 'solid-js';
import { createRatingGroupController, type RatingGroupProps, type RatingGroupController } from '@uifn/core/primitives/rating-group';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const RatingGroupContext = createContext<SolidPrimitiveContextValue<RatingGroupProps>>();
export const RatingGroupDefinition: SolidPrimitiveDefinition<RatingGroupProps> = {
  name: 'RatingGroup',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","count","allowHalf","name","disabled","readOnly","required"],
  context: RatingGroupContext,
  createController: createRatingGroupController as never,
};

function RatingGroupRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type RatingGroupRootProps = SolidPrimitiveRootProps<RatingGroupProps, 'div'>;
export function RatingGroupRoot(props: RatingGroupRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={RatingGroupDefinition} element="div" renderElement={RatingGroupRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function RatingGroupLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type RatingGroupLabelProps = SolidPrimitivePartProps<RatingGroupController['parts']['label'], 'label', false>;
export function RatingGroupLabel(props: RatingGroupLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={RatingGroupDefinition as never}
      part="label"
      element="label"
      renderElement={RatingGroupLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function RatingGroupControlElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type RatingGroupControlProps = SolidPrimitivePartProps<RatingGroupController['parts']['control'], 'div', false>;
export function RatingGroupControl(props: RatingGroupControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={RatingGroupDefinition as never}
      part="control"
      element="div"
      renderElement={RatingGroupControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function RatingGroupItemElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type RatingGroupItemProps = SolidPrimitivePartProps<RatingGroupController['parts']['item'], 'button', true>;
export function RatingGroupItem(props: RatingGroupItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={RatingGroupDefinition as never}
      part="item"
      element="button"
      renderElement={RatingGroupItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function RatingGroupItemIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type RatingGroupItemIndicatorProps = SolidPrimitivePartProps<RatingGroupController['parts']['itemIndicator'], 'span', true>;
export function RatingGroupItemIndicator(props: RatingGroupItemIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={RatingGroupDefinition as never}
      part="itemIndicator"
      element="span"
      renderElement={RatingGroupItemIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function RatingGroupHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type RatingGroupHiddenInputProps = SolidPrimitivePartProps<RatingGroupController['parts']['hiddenInput'], 'input', false>;
export function RatingGroupHiddenInput(props: RatingGroupHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={RatingGroupDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={RatingGroupHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function RatingGroupValueTextElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type RatingGroupValueTextProps = SolidPrimitivePartProps<RatingGroupController['parts']['valueText'], 'span', false>;
export function RatingGroupValueText(props: RatingGroupValueTextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={RatingGroupDefinition as never}
      part="valueText"
      element="span"
      renderElement={RatingGroupValueTextElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const RatingGroupProvider = RatingGroupRoot;
export const RatingGroup = /* @__PURE__ */ Object.assign(RatingGroupRoot, { Provider: RatingGroupProvider, Root: RatingGroupRoot, Label: RatingGroupLabel, Control: RatingGroupControl, Item: RatingGroupItem, ItemIndicator: RatingGroupItemIndicator, HiddenInput: RatingGroupHiddenInput, ValueText: RatingGroupValueText });
