import { createContext, type JSX } from 'solid-js';
import { createAutocompleteController, type AutocompleteProps, type AutocompleteController } from '@uifn/core/primitives/autocomplete';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const AutocompleteContext = createContext<SolidPrimitiveContextValue<AutocompleteProps>>();
export const AutocompleteDefinition: SolidPrimitiveDefinition<AutocompleteProps> = {
  name: 'Autocomplete',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","items","filter","disabled","readOnly"],
  context: AutocompleteContext,
  createController: createAutocompleteController as never,
};

function AutocompleteRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AutocompleteRootProps = SolidPrimitiveRootProps<AutocompleteProps, 'div'>;
export function AutocompleteRoot(props: AutocompleteRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={AutocompleteDefinition} element="div" renderElement={AutocompleteRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function AutocompleteLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type AutocompleteLabelProps = SolidPrimitivePartProps<AutocompleteController['parts']['label'], 'label', false>;
export function AutocompleteLabel(props: AutocompleteLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AutocompleteDefinition as never}
      part="label"
      element="label"
      renderElement={AutocompleteLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AutocompleteControlElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AutocompleteControlProps = SolidPrimitivePartProps<AutocompleteController['parts']['control'], 'div', false>;
export function AutocompleteControl(props: AutocompleteControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AutocompleteDefinition as never}
      part="control"
      element="div"
      renderElement={AutocompleteControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AutocompleteInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type AutocompleteInputProps = SolidPrimitivePartProps<AutocompleteController['parts']['input'], 'input', false>;
export function AutocompleteInput(props: AutocompleteInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AutocompleteDefinition as never}
      part="input"
      element="input"
      renderElement={AutocompleteInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AutocompleteClearElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type AutocompleteClearProps = SolidPrimitivePartProps<AutocompleteController['parts']['clear'], 'button', false>;
export function AutocompleteClear(props: AutocompleteClearProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AutocompleteDefinition as never}
      part="clear"
      element="button"
      renderElement={AutocompleteClearElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AutocompletePositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AutocompletePositionerProps = SolidPrimitivePartProps<AutocompleteController['parts']['positioner'], 'div', false>;
export function AutocompletePositioner(props: AutocompletePositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AutocompleteDefinition as never}
      part="positioner"
      element="div"
      renderElement={AutocompletePositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AutocompleteContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AutocompleteContentProps = SolidPrimitivePartProps<AutocompleteController['parts']['content'], 'div', false>;
export function AutocompleteContent(props: AutocompleteContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AutocompleteDefinition as never}
      part="content"
      element="div"
      renderElement={AutocompleteContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AutocompleteItemElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AutocompleteItemProps = SolidPrimitivePartProps<AutocompleteController['parts']['item'], 'div', true>;
export function AutocompleteItem(props: AutocompleteItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AutocompleteDefinition as never}
      part="item"
      element="div"
      renderElement={AutocompleteItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function AutocompleteEmptyElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AutocompleteEmptyProps = SolidPrimitivePartProps<AutocompleteController['parts']['empty'], 'div', false>;
export function AutocompleteEmpty(props: AutocompleteEmptyProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AutocompleteDefinition as never}
      part="empty"
      element="div"
      renderElement={AutocompleteEmptyElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const AutocompleteProvider = AutocompleteRoot;
export const Autocomplete = /* @__PURE__ */ Object.assign(AutocompleteRoot, { Provider: AutocompleteProvider, Root: AutocompleteRoot, Label: AutocompleteLabel, Control: AutocompleteControl, Input: AutocompleteInput, Clear: AutocompleteClear, Positioner: AutocompletePositioner, Content: AutocompleteContent, Item: AutocompleteItem, Empty: AutocompleteEmpty });
