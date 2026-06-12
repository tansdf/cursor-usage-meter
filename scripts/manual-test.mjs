import fs from 'fs';
import os from 'os';
import path from 'path';

const API_BASE = 'https://api2.cursor.sh';

function resolveDbPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new Error('APPDATA not set');
    }
    return path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  return path.join(os.homedir(), '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

async function readToken() {
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    return null;
  }
  const wasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) });
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken' LIMIT 1");
  stmt.bind([]);
  if (!stmt.step()) {
    db.close();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  db.close();
  const raw = row.value;
  return typeof raw === 'string' ? raw : null;
}

async function fetchUsage(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Connect-Protocol-Version': '1',
  };
  const usage = await fetch(`${API_BASE}/aiserver.v1.DashboardService/GetCurrentPeriodUsage`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  const plan = await fetch(`${API_BASE}/aiserver.v1.DashboardService/GetPlanInfo`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  return {
    usage: await usage.json(),
    plan: await plan.json(),
    usageStatus: usage.status,
    planStatus: plan.status,
  };
}

const token = await readToken();
if (!token) {
  console.log('SKIP: No Cursor access token found (sign in to Cursor first).');
  process.exit(0);
}

const result = await fetchUsage(token);
console.log('Usage status:', result.usageStatus);
console.log('Plan status:', result.planStatus);
console.log(JSON.stringify(result, null, 2));
