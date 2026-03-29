// @ts-nocheck
import type { DatafnClient, DatafnTable } from "@datafn/client";

export interface Categories {
  color: string;
  id: string;
  name: string;
}

export interface Todos {
  completed: boolean;
  id: string;
  isArchived?: boolean;
  priority?: number;
  text: string;
  trashedAt?: number;
  trashedBy?: string;
}

export interface _DatafnJoinTodosTags {
  fromId: string;
  toId: string;
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
  updatedBy?: string;
}

export interface Tables {
  categories: Categories;
  todos: Todos;
  __datafn_join_todos_tags: _DatafnJoinTodosTags;
}

export type TypedClient = DatafnClient & {
  categories: DatafnTable<Categories>;
  todos: DatafnTable<Todos>;
};
