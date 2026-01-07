/**
 * Ambient type declarations for optional peer dependencies
 * These are loaded dynamically at runtime
 */

declare module 'pg' {
  export class Pool {
    constructor(config?: any);
    query(...args: any[]): Promise<any>;
    end(): Promise<void>;
  }
}

declare module 'mysql2/promise' {
  export function createPool(config?: any): any;
}

declare module 'mysql2' {
  export function createPool(config?: any): any;
}

declare module 'better-sqlite3' {
  export default class Database {
    constructor(filename?: string);
    prepare(sql: string): any;
    exec(sql: string): any;
    all(sql: string, params?: any[]): any[];
    close(): void;
  }
}

declare module 'kysely' {
  export class Kysely<DB = any> {
    constructor(config: any);
    schema: any;
    insertInto(table: string): any;
    updateTable(table: string): any;
    transaction(): any;
  }

  export class PostgresDialect {
    constructor(config: any);
  }

  export class MysqlDialect {
    constructor(config: any);
  }

  export class SqliteDialect {
    constructor(config: any);
  }
}
