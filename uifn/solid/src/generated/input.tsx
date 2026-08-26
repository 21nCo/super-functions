import { createContext, type JSX } from 'solid-js';
import { InputContract, type InputProps, type InputContractParts } from '@uifn/core/primitives/input';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const InputContext = createContext<SolidPrimitiveContextValue<InputProps>>();
export const InputDefinition: SolidPrimitiveDefinition<InputProps> = {
  name: 'Input',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["type","value","defaultValue","name","disabled","readOnly","required","invalid"],
  context: InputContext,
  contract: InputContract as never,
};

function InputRootElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type InputRootProps = SolidPrimitiveRootProps<InputProps, 'input'>;
export function InputRoot(props: InputRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={InputDefinition} element="input" renderElement={InputRootElement as never} hydrationId={hydrationId} props={props as never} />;
}



export const InputProvider = InputRoot;
export const Input = /* @__PURE__ */ Object.assign(InputRoot, { Provider: InputProvider, Root: InputRoot });
