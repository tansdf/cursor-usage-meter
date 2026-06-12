declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: Uint8Array) => SqlDatabase;
  }

  interface SqlDatabase {
    prepare: (sql: string) => SqlStatement;
    close: () => void;
  }

  interface SqlStatement {
    bind: (values: unknown[]) => void;
    step: () => boolean;
    getAsObject: () => Record<string, unknown>;
    free: () => void;
  }

  export type InitSqlJs = (opts?: { wasmBinary?: Buffer | Uint8Array }) => Promise<SqlJsStatic>;
  const initSqlJs: InitSqlJs;
  export default initSqlJs;
}
