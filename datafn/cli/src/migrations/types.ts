/**
 * Migration Types
 *
 * DataFn Schema Migration Plan definitions.
 */

export type MigrationChange =
  | { kind: "addResource"; resource: string }
  | { kind: "removeResource"; resource: string }
  | {
      kind: "addField";
      resource: string;
      field: string;
      type: string;
      required: boolean;
    }
  | { kind: "removeField"; resource: string; field: string }
  | {
      kind: "alterField";
      resource: string;
      field: string;
      changes: { type?: string; required?: boolean };
    };

export interface MigrationPlan {
  changes: MigrationChange[];
}
