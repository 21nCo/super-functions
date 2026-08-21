import type { UIFnPartProps } from '../parts';

export interface UIFnStaticContractContext {
  /** Framework-owned, SSR-stable instance scope (for example React useId). */
  readonly scopeId: string;
}

export interface UIFnStaticAnatomyPart<TPart extends string = string> {
  readonly name: TPart;
  readonly element: string;
  readonly cardinality: 'one' | 'many';
}

export interface UIFnStaticPrimitiveContract<
  TInputs extends object,
  TState extends object,
  TParts,
  TPart extends string = string,
> {
  readonly kind: 'typed-static-contract';
  readonly name: string;
  readonly anatomy: readonly UIFnStaticAnatomyPart<TPart>[];
  getState(inputs: TInputs): Readonly<TState>;
  getParts(inputs: TInputs, context: UIFnStaticContractContext): Readonly<TParts>;
}

export function defineUIFnStaticContract<
  TInputs extends object,
  TState extends object,
  TParts,
  TPart extends string = string,
>(contract: UIFnStaticPrimitiveContract<TInputs, TState, TParts, TPart>): Readonly<UIFnStaticPrimitiveContract<TInputs, TState, TParts, TPart>> {
  return Object.freeze({ ...contract, anatomy: Object.freeze([...contract.anatomy]) });
}

export function freezeUIFnParts<TParts extends Record<string, unknown>>(parts: TParts): Readonly<TParts> {
  return Object.freeze(parts);
}

export type UIFnStaticPartProps = Readonly<UIFnPartProps>;
