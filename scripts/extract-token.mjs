import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function defaultDbPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new Error('APPDATA is not set.');
    }
    return path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  return path.join(os.homedir(), '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

const dbPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultDbPath();
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const wasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const initSqlJs = require('sql.js');
const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) });
const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));

const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken' LIMIT 1");
stmt.bind([]);
if (!stmt.step()) {
  console.error('cursorAuth/accessToken not found in ItemTable.');
  process.exit(1);
}
const row = stmt.getAsObject();
stmt.free();
db.close();

let token = String(row.value ?? '').trim();
if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
  token = token.slice(1, -1).trim();
}
if (!token) {
  console.error('Access token value is empty.');
  process.exit(1);
}

console.log(token);
