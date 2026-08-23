import { createUIFnPartId } from '../algorithms/id';
import type { UIFnPartProps } from '../parts';
import { defineUIFnStaticContract, freezeUIFnParts } from './static-contract';

type IdleState = Readonly<{ status: 'idle' }>;

function idleState(): IdleState {
  return Object.freeze({ status: 'idle' });
}

function structuralPart(
  scopeId: string,
  primitive: string,
  part: string,
  data: Record<string, string | number | boolean | undefined> = {},
): UIFnPartProps {
  return {
    id: createUIFnPartId(scopeId, primitive, part),
    data: { state: 'idle', ...data },
  };
}

function structuralValuePart(
  scopeId: string,
  primitive: string,
  part: string,
  value: string | number,
  data: Record<string, string | number | boolean | undefined> = {},
): UIFnPartProps {
  return {
    id: createUIFnPartId(scopeId, primitive, part, value),
    data: { state: 'idle', ...data },
  };
}

export interface BadgeProps {
  readonly variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success';
}
export interface BadgeState {
  readonly status: 'idle';
  readonly variant: NonNullable<BadgeProps['variant']>;
}
export interface BadgeContractParts { readonly root: UIFnPartProps }
export const BadgeContract = defineUIFnStaticContract<BadgeProps, BadgeState, BadgeContractParts>({
  kind: 'typed-static-contract',
  name: 'Badge',
  anatomy: [{ name: 'root', element: 'span', cardinality: 'one' }],
  getState(inputs) {
    return Object.freeze({ status: 'idle', variant: inputs.variant ?? 'default' });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    return freezeUIFnParts({
      root: structuralPart(context.scopeId, 'badge', 'root', { variant: state.variant }),
    });
  },
});
export type BadgeContract = typeof BadgeContract;

export interface BreadcrumbProps { readonly label?: string }
export interface BreadcrumbState extends IdleState { readonly label: string }
export interface BreadcrumbContractParts {
  readonly root: UIFnPartProps;
  readonly list: UIFnPartProps;
  readonly item: (value: string | number) => UIFnPartProps;
  readonly link: (value: string | number) => UIFnPartProps;
  readonly page: UIFnPartProps;
  readonly separator: (value: string | number) => UIFnPartProps;
  readonly ellipsis: UIFnPartProps;
}
export const BreadcrumbContract = defineUIFnStaticContract<BreadcrumbProps, BreadcrumbState, BreadcrumbContractParts>({
  kind: 'typed-static-contract',
  name: 'Breadcrumb',
  anatomy: [
    { name: 'root', element: 'nav', cardinality: 'one' },
    { name: 'list', element: 'ol', cardinality: 'one' },
    { name: 'item', element: 'li', cardinality: 'many' },
    { name: 'link', element: 'a', cardinality: 'many' },
    { name: 'page', element: 'span', cardinality: 'one' },
    { name: 'separator', element: 'li', cardinality: 'many' },
    { name: 'ellipsis', element: 'span', cardinality: 'one' },
  ],
  getState(inputs) {
    return Object.freeze({ status: 'idle', label: inputs.label ?? 'Breadcrumb' });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    return freezeUIFnParts({
      root: { ...structuralPart(context.scopeId, 'breadcrumb', 'root'), aria: { label: state.label } },
      list: structuralPart(context.scopeId, 'breadcrumb', 'list'),
      item: (value: string | number) => structuralValuePart(context.scopeId, 'breadcrumb', 'item', value),
      link: (value: string | number) => structuralValuePart(context.scopeId, 'breadcrumb', 'link', value),
      page: { ...structuralPart(context.scopeId, 'breadcrumb', 'page'), aria: { current: 'page' } },
      separator: (value: string | number) => ({
        ...structuralValuePart(context.scopeId, 'breadcrumb', 'separator', value),
        aria: { hidden: true },
      }),
      ellipsis: { ...structuralPart(context.scopeId, 'breadcrumb', 'ellipsis'), aria: { hidden: true } },
    });
  },
});
export type BreadcrumbContract = typeof BreadcrumbContract;

export interface CardProps { readonly elevated?: boolean }
export interface CardState extends IdleState { readonly elevated: boolean }
export interface CardContractParts {
  readonly root: UIFnPartProps;
  readonly header: UIFnPartProps;
  readonly title: UIFnPartProps;
  readonly description: UIFnPartProps;
  readonly action: UIFnPartProps;
  readonly content: UIFnPartProps;
  readonly footer: UIFnPartProps;
}
export const CardContract = defineUIFnStaticContract<CardProps, CardState, CardContractParts>({
  kind: 'typed-static-contract',
  name: 'Card',
  anatomy: [
    { name: 'root', element: 'div', cardinality: 'one' },
    { name: 'header', element: 'div', cardinality: 'one' },
    { name: 'title', element: 'h3', cardinality: 'one' },
    { name: 'description', element: 'p', cardinality: 'one' },
    { name: 'action', element: 'div', cardinality: 'one' },
    { name: 'content', element: 'div', cardinality: 'one' },
    { name: 'footer', element: 'div', cardinality: 'one' },
  ],
  getState(inputs) {
    return Object.freeze({ status: 'idle', elevated: Boolean(inputs.elevated) });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    return freezeUIFnParts({
      root: structuralPart(context.scopeId, 'card', 'root', { elevated: state.elevated }),
      header: structuralPart(context.scopeId, 'card', 'header'),
      title: structuralPart(context.scopeId, 'card', 'title'),
      description: structuralPart(context.scopeId, 'card', 'description'),
      action: structuralPart(context.scopeId, 'card', 'action'),
      content: structuralPart(context.scopeId, 'card', 'content'),
      footer: structuralPart(context.scopeId, 'card', 'footer'),
    });
  },
});
export type CardContract = typeof CardContract;

export interface InputGroupProps {
  readonly disabled?: boolean;
  readonly invalid?: boolean;
}
export interface InputGroupState {
  readonly status: 'valid' | 'invalid' | 'disabled';
  readonly disabled: boolean;
  readonly invalid: boolean;
}
export interface InputGroupContractParts {
  readonly root: UIFnPartProps;
  readonly addon: (value: string | number) => UIFnPartProps;
  readonly text: (value: string | number) => UIFnPartProps;
  readonly control: UIFnPartProps;
  readonly input: UIFnPartProps;
  readonly textarea: UIFnPartProps;
  readonly button: (value: string | number) => UIFnPartProps;
}
export const InputGroupContract = defineUIFnStaticContract<InputGroupProps, InputGroupState, InputGroupContractParts>({
  kind: 'typed-static-contract',
  name: 'InputGroup',
  anatomy: [
    { name: 'root', element: 'div', cardinality: 'one' },
    { name: 'addon', element: 'div', cardinality: 'many' },
    { name: 'text', element: 'span', cardinality: 'many' },
    { name: 'control', element: 'div', cardinality: 'one' },
    { name: 'input', element: 'input', cardinality: 'one' },
    { name: 'textarea', element: 'textarea', cardinality: 'one' },
    { name: 'button', element: 'button', cardinality: 'many' },
  ],
  getState(inputs) {
    const disabled = Boolean(inputs.disabled);
    const invalid = Boolean(inputs.invalid);
    return Object.freeze({
      disabled,
      invalid,
      status: disabled ? 'disabled' : invalid ? 'invalid' : 'valid',
    });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    const common = { state: state.status, disabled: state.disabled, invalid: state.invalid };
    return freezeUIFnParts({
      root: { ...structuralPart(context.scopeId, 'input-group', 'root', common), role: 'group' },
      addon: (value: string | number) => structuralValuePart(context.scopeId, 'input-group', 'addon', value, common),
      text: (value: string | number) => structuralValuePart(context.scopeId, 'input-group', 'text', value, common),
      control: structuralPart(context.scopeId, 'input-group', 'control', common),
      input: {
        ...structuralPart(context.scopeId, 'input-group', 'input', common),
        disabled: state.disabled,
        aria: { invalid: state.invalid },
      },
      textarea: {
        ...structuralPart(context.scopeId, 'input-group', 'textarea', common),
        disabled: state.disabled,
        aria: { invalid: state.invalid },
      },
      button: (value: string | number) => ({
        ...structuralValuePart(context.scopeId, 'input-group', 'button', value, common),
        disabled: state.disabled,
        attributes: { type: 'button' },
      }),
    });
  },
});
export type InputGroupContract = typeof InputGroupContract;

export interface SkeletonProps { readonly visible?: boolean }
export interface SkeletonState { readonly status: 'loading' | 'hidden'; readonly visible: boolean }
export interface SkeletonContractParts { readonly root: UIFnPartProps }
export const SkeletonContract = defineUIFnStaticContract<SkeletonProps, SkeletonState, SkeletonContractParts>({
  kind: 'typed-static-contract',
  name: 'Skeleton',
  anatomy: [{ name: 'root', element: 'div', cardinality: 'one' }],
  getState(inputs) {
    const visible = inputs.visible ?? true;
    return Object.freeze({ status: visible ? 'loading' : 'hidden', visible });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    return freezeUIFnParts({
      root: {
        id: createUIFnPartId(context.scopeId, 'skeleton', 'root'),
        hidden: !state.visible,
        aria: { hidden: true },
        data: { state: state.status },
      },
    });
  },
});
export type SkeletonContract = typeof SkeletonContract;

export interface TableProps { readonly striped?: boolean }
export interface TableState extends IdleState { readonly striped: boolean }
export interface TableContractParts {
  readonly root: UIFnPartProps;
  readonly table: UIFnPartProps;
  readonly header: UIFnPartProps;
  readonly body: UIFnPartProps;
  readonly footer: UIFnPartProps;
  readonly row: (value: string | number) => UIFnPartProps;
  readonly head: (value: string | number) => UIFnPartProps;
  readonly cell: (value: string | number) => UIFnPartProps;
  readonly caption: UIFnPartProps;
}
export const TableContract = defineUIFnStaticContract<TableProps, TableState, TableContractParts>({
  kind: 'typed-static-contract',
  name: 'Table',
  anatomy: [
    { name: 'root', element: 'div', cardinality: 'one' },
    { name: 'table', element: 'table', cardinality: 'one' },
    { name: 'header', element: 'thead', cardinality: 'one' },
    { name: 'body', element: 'tbody', cardinality: 'one' },
    { name: 'footer', element: 'tfoot', cardinality: 'one' },
    { name: 'row', element: 'tr', cardinality: 'many' },
    { name: 'head', element: 'th', cardinality: 'many' },
    { name: 'cell', element: 'td', cardinality: 'many' },
    { name: 'caption', element: 'caption', cardinality: 'one' },
  ],
  getState(inputs) {
    return Object.freeze({ status: 'idle', striped: Boolean(inputs.striped) });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    const common = { striped: state.striped };
    return freezeUIFnParts({
      root: structuralPart(context.scopeId, 'table', 'root', common),
      table: structuralPart(context.scopeId, 'table', 'table', common),
      header: structuralPart(context.scopeId, 'table', 'header', common),
      body: structuralPart(context.scopeId, 'table', 'body', common),
      footer: structuralPart(context.scopeId, 'table', 'footer', common),
      row: (value: string | number) => structuralValuePart(context.scopeId, 'table', 'row', value, common),
      head: (value: string | number) => ({
        ...structuralValuePart(context.scopeId, 'table', 'head', value, common),
        attributes: { scope: 'col' },
      }),
      cell: (value: string | number) => structuralValuePart(context.scopeId, 'table', 'cell', value, common),
      caption: structuralPart(context.scopeId, 'table', 'caption', common),
    });
  },
});
export type TableContract = typeof TableContract;

export interface TextareaProps {
  readonly value?: string;
  readonly defaultValue?: string;
  readonly name?: string;
  readonly placeholder?: string;
  readonly rows?: number;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly invalid?: boolean;
  readonly resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}
export interface TextareaState {
  readonly status: 'valid' | 'invalid' | 'disabled';
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly invalid: boolean;
  readonly resize: NonNullable<TextareaProps['resize']>;
}
export interface TextareaContractParts { readonly root: UIFnPartProps }
export const TextareaContract = defineUIFnStaticContract<TextareaProps, TextareaState, TextareaContractParts>({
  kind: 'typed-static-contract',
  name: 'Textarea',
  anatomy: [{ name: 'root', element: 'textarea', cardinality: 'one' }],
  getState(inputs) {
    const disabled = Boolean(inputs.disabled);
    const invalid = Boolean(inputs.invalid);
    return Object.freeze({
      disabled,
      invalid,
      readOnly: Boolean(inputs.readOnly),
      required: Boolean(inputs.required),
      resize: inputs.resize ?? 'vertical',
      status: disabled ? 'disabled' : invalid ? 'invalid' : 'valid',
    });
  },
  getParts(inputs, context) {
    const state = this.getState(inputs);
    return freezeUIFnParts({
      root: {
        id: createUIFnPartId(context.scopeId, 'textarea', 'root'),
        disabled: state.disabled,
        attributes: {
          value: inputs.value,
          defaultValue: inputs.defaultValue,
          name: inputs.name,
          placeholder: inputs.placeholder,
          rows: inputs.rows,
          readonly: state.readOnly,
          required: state.required,
        },
        aria: { invalid: state.invalid },
        data: { state: state.status, resize: state.resize },
        style: { resize: state.resize },
      },
    });
  },
});
export type TextareaContract = typeof TextareaContract;
