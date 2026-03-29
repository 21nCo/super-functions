import type { DatafnClient, DatafnTable } from "@datafn/client";

export interface Documents {
  content: string;
  readonly createdAt?: number | null;
  readonly createdBy?: string | null;
  id: string;
  title: string;
  readonly updatedAt?: number | null;
  readonly updatedBy?: string | null;
  readonly visibility?: string | null;
}

export interface Tables {
  documents: Documents;
}

export type TypedClient = DatafnClient & {
  documents: DatafnTable<Documents>;
};
