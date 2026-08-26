import { createContext, type JSX } from 'solid-js';
import { TextareaContract, type TextareaProps, type TextareaContractParts } from '@uifn/core/primitives/textarea';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const TextareaContext = createContext<SolidPrimitiveContextValue<TextareaProps>>();
export const TextareaDefinition: SolidPrimitiveDefinition<TextareaProps> = {
  name: 'Textarea',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","placeholder","rows","disabled","readOnly","required","invalid","resize"],
  context: TextareaContext,
  contract: TextareaContract as never,
};

function TextareaRootElement(props: JSX.IntrinsicElements['textarea']): JSX.Element {
  return <textarea {...props} />;
}

export type TextareaRootProps = SolidPrimitiveRootProps<TextareaProps, 'textarea'>;
export function TextareaRoot(props: TextareaRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={TextareaDefinition} element="textarea" renderElement={TextareaRootElement as never} hydrationId={hydrationId} props={props as never} />;
}



export const TextareaProvider = TextareaRoot;
export const Textarea = /* @__PURE__ */ Object.assign(TextareaRoot, { Provider: TextareaProvider, Root: TextareaRoot });
