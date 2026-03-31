import { createOutput, type Spinner } from "./output.js";
export type { Spinner } from "./output.js";

function getOutput() {
  return createOutput();
}

export const ui = {
  success(message: string): void {
    getOutput().success(message);
  },
  error(message: string): void {
    getOutput().error(message);
  },
  warn(message: string): void {
    getOutput().warn(message);
  },
  info(message: string): void {
    getOutput().info(message);
  },
  spinner(message: string): Spinner {
    return getOutput().spinner(message);
  },
  table(rows: Array<Record<string, string | number | boolean | null | undefined>>): void {
    const columns = rows.length === 0 ? [] : Object.keys(rows[0]);
    getOutput().table({ columns, rows });
  },
};
