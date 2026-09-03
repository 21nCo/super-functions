import type { DatafnFieldSchema } from "./types.js";

type DatafnFieldType = DatafnFieldSchema["type"];
type NoFieldOptions = Record<never, never>;

type DatafnFieldMetadataOptions = Partial<
  Pick<DatafnFieldSchema, "readonly" | "unique" | "encrypt" | "volatile">
>;

type DatafnFieldCommonOptions<Value> = DatafnFieldMetadataOptions & {
  required?: boolean;
} & (
    | {
        nullable?: false;
        default?: Value;
      }
    | {
        nullable: true;
        default?: Value | null;
      }
  );

type DatafnEnumOptions<Value> = {
  enum?: readonly Value[];
};

/** A JSON-compatible value accepted by a DataFn JSON field. */
export type DatafnJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly DatafnJsonValue[]
  | { readonly [key: string]: DatafnJsonValue };

/** Named options for a string field. */
export type DatafnStringFieldOptions = DatafnFieldCommonOptions<string> &
  DatafnEnumOptions<string> & {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };

/** Named options for a number field. */
export type DatafnNumberFieldOptions = DatafnFieldCommonOptions<number> &
  DatafnEnumOptions<number> & {
    min?: number;
    max?: number;
  };

/** Named options for a boolean field. */
export type DatafnBooleanFieldOptions = DatafnFieldCommonOptions<boolean> &
  DatafnEnumOptions<boolean>;

/** Named options for an object field. */
export type DatafnObjectFieldOptions = DatafnFieldCommonOptions<
  Readonly<Record<string, unknown>>
>;

/** Named options for an array field. */
export type DatafnArrayFieldOptions = DatafnFieldCommonOptions<
  readonly unknown[]
> & {
  min?: number;
  max?: number;
};

/** Named options for a date field. */
export type DatafnDateFieldOptions = DatafnFieldCommonOptions<string | number>;

/** Named options for a file-reference field. */
export type DatafnFileFieldOptions = DatafnFieldCommonOptions<string> &
  DatafnEnumOptions<string>;

/** Named options for a JSON field. */
export type DatafnJsonFieldOptions = DatafnFieldCommonOptions<
  Exclude<DatafnJsonValue, null>
>;

/** Maps each public field kind to its accepted named options. */
export type DatafnFieldOptionsByType = {
  string: DatafnStringFieldOptions;
  number: DatafnNumberFieldOptions;
  boolean: DatafnBooleanFieldOptions;
  object: DatafnObjectFieldOptions;
  array: DatafnArrayFieldOptions;
  date: DatafnDateFieldOptions;
  file: DatafnFileFieldOptions;
  json: DatafnJsonFieldOptions;
};

type KeysOfUnion<Value> = Value extends Value ? keyof Value : never;

type StrictOptions<Options, Shape> = Options &
  Record<Exclude<keyof Options, KeysOfUnion<Shape>>, never>;

type BooleanOption<
  Options,
  Key extends "required" | "nullable",
> = Key extends keyof Options
  ? [Exclude<Options[Key], undefined>] extends [never]
    ? false
    : Exclude<Options[Key], undefined> extends boolean
      ? Exclude<Options[Key], undefined>
      : false
  : false;

/** Plain field schema returned by a const-safe field builder. */
export type DatafnBuiltField<
  Name extends string,
  Type extends DatafnFieldType,
  Options extends DatafnFieldOptionsByType[Type],
> = Omit<Options, "name" | "type" | "required" | "nullable"> & {
  readonly name: Name;
  readonly type: Type;
  readonly required: BooleanOption<Options, "required">;
  readonly nullable: BooleanOption<Options, "nullable">;
};

function buildField<
  const Name extends string,
  Type extends DatafnFieldType,
  Options extends DatafnFieldOptionsByType[Type],
>(
  name: Name,
  type: Type,
  options?: Options,
): DatafnBuiltField<Name, Type, Options> {
  const values = options as Record<string, unknown> | undefined;
  return {
    ...values,
    name,
    type,
    required: values?.required ?? false,
    nullable: values?.nullable ?? false,
  } as DatafnBuiltField<Name, Type, Options>;
}

/**
 * Const-safe field builders. Each builder returns a plain schema object,
 * preserves inference-relevant literals, and defaults `required` and
 * `nullable` to `false`.
 */
export const field = {
  string<
    const Name extends string,
    const Options extends DatafnStringFieldOptions = NoFieldOptions,
  >(
    name: Name,
    options?: StrictOptions<Options, DatafnStringFieldOptions>,
  ): DatafnBuiltField<Name, "string", Options> {
    return buildField<Name, "string", Options>(
      name,
      "string",
      options as Options,
    );
  },

  number<
    const Name extends string,
    const Options extends DatafnNumberFieldOptions = NoFieldOptions,
  >(
    name: Name,
    options?: StrictOptions<Options, DatafnNumberFieldOptions>,
  ): DatafnBuiltField<Name, "number", Options> {
    return buildField<Name, "number", Options>(
      name,
      "number",
      options as Options,
    );
  },

  boolean<
    const Name extends string,
    const Options extends DatafnBooleanFieldOptions = NoFieldOptions,
  >(
    name: Name,
    options?: StrictOptions<Options, DatafnBooleanFieldOptions>,
  ): DatafnBuiltField<Name, "boolean", Options> {
    return buildField<Name, "boolean", Options>(
      name,
      "boolean",
      options as Options,
    );
  },

  object<
    const Name extends string,
    const Options extends DatafnObjectFieldOptions = NoFieldOptions,
  >(
    name: Name,
    options?: StrictOptions<Options, DatafnObjectFieldOptions>,
  ): DatafnBuiltField<Name, "object", Options> {
    return buildField<Name, "object", Options>(
      name,
      "object",
      options as Options,
    );
  },

  array<
    const Name extends string,
    const Options extends DatafnArrayFieldOptions = NoFieldOptions,
  >(
    name: Name,
    options?: StrictOptions<Options, DatafnArrayFieldOptions>,
  ): DatafnBuiltField<Name, "array", Options> {
    return buildField<Name, "array", Options>(
      name,
      "array",
      options as Options,
    );
  },

  date<
    const Name extends string,
    const Options extends DatafnDateFieldOptions = NoFieldOptions,
  >(
    name: Name,
    options?: StrictOptions<Options, DatafnDateFieldOptions>,
  ): DatafnBuiltField<Name, "date", Options> {
    return buildField<Name, "date", Options>(name, "date", options as Options);
  },

  file<
    const Name extends string,
    const Options extends DatafnFileFieldOptions = NoFieldOptions,
  >(
    name: Name,
    options?: StrictOptions<Options, DatafnFileFieldOptions>,
  ): DatafnBuiltField<Name, "file", Options> {
    return buildField<Name, "file", Options>(name, "file", options as Options);
  },

  json<
    const Name extends string,
    const Options extends DatafnJsonFieldOptions = NoFieldOptions,
  >(
    name: Name,
    options?: StrictOptions<Options, DatafnJsonFieldOptions>,
  ): DatafnBuiltField<Name, "json", Options> {
    return buildField<Name, "json", Options>(name, "json", options as Options);
  },
} as const;
