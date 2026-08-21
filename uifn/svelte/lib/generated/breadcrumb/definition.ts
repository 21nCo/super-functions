import { BreadcrumbContract, type BreadcrumbProps } from '@uifn/core/primitives/breadcrumb';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const BreadcrumbDefinition: SveltePrimitiveDefinition<BreadcrumbProps> = {
  name: 'Breadcrumb',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["label"],
  contextKey: Symbol('uifn.Breadcrumb'),
  contract: BreadcrumbContract as never,
};
