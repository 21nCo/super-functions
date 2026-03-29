import type { DatafnClient, DatafnTable } from "@datafn/client";

export interface Todos {
  completed?: boolean;
  id: string;
  text: string;
}

export interface Tables {
  todos: Todos;
}

export type TypedClient = DatafnClient & {
  todos: DatafnTable<Todos>;
};
