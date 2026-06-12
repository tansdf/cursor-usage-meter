import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { API_BASE_URL, SECRET_STORAGE_KEY } from '../config';

const ACCESS_KEY = 'cursorAuth/accessToken';
const REFRESH_KEY = 'cursorAuth/refreshToken';
const MEMBERSHIP_KEY = 'cursorAuth/stripeMembershipType';

const KEYCHAIN_ACCESS_SERVICE = 'cursor-access-token';
const KEYCHAIN_REFRESH_SERVICE = 'cursor-refresh-token';

type InitSqlJs = (opts?: { wasmBinary?: Buffer | Uint8Array }) => Promise<{
  Database: new (data?: Uint8Array) => {
    prepare: (sql: string) => {
      bind: (values: unknown[]) => void;
      step: () => boolean;
      getAsObject: () => Record<string, unknown>;
      free: () => void;
    };
    close: () => void;
  };
}>;

type SqlDatabase = {
  prepare: (sql: string) => {
    bind: (values: unknown[]) => void;
    step: () => boolean;
    getAsObject: () => Record<string, unknown>;
    free: () => void;
  };
  close: () => void;
};

export type AuthTokenSource = 'memory' | 'secret' | 'sqlite' | 'keychain';

export interface AuthDiagnostic {
  stateDbPath: string;
  stateDbExists: boolean;
  stateDbSizeMb: number | null;
  candidateDbPaths: string[];
  extensionHost: 'local' | 'remote';
  remoteName: string | undefined;
  sqliteAccessToken: boolean;
  sqliteRefreshToken: boolean;
  sqliteMembershipType: string | null;
  keychainAccessToken: boolean;
  keychainRefreshToken: boolean;
  secretStorageToken: boolean;
  wasmAvailable: boolean;
  selectedSource: AuthTokenSource | null;
  notes: string[];
}

let cachedAccessToken: string | undefined;
let cachedRefreshToken: string | undefined;
let cachedTokenSource: AuthTokenSource | undefined;

export function defaultCursorStateDbPath(): string {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new Error('APPDATA environment variable is not set.');
    }
    return path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  return path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

function readArgvUserDataDirs(): string[] {
  const candidates = [
    path.join(os.homedir(), '.cursor', 'argv.json'),
    path.join(process.env.APPDATA ?? '', 'Cursor', 'User', 'argv.json'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'cursor', 'resources', 'app', 'argv.json'),
  ];
  const dirs: string[] = [];
  for (const argvPath of candidates) {
    if (!fs.existsSync(argvPath)) {
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(argvPath, 'utf8')) as { 'user-data-dir'?: string };
      const userDataDir = parsed['user-data-dir']?.trim();
      if (userDataDir) {
        dirs.push(userDataDir);
      }
    } catch {
      // ignore malformed argv.json
    }
  }
  return dirs;
}

export function enumerateStateDbPaths(): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  const push = (candidate: string): void => {
    const normalized = path.normalize(candidate);
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    paths.push(normalized);
  };

  const override = String(vscode.workspace.getConfiguration('cursorUsageMeter').get('stateDbPath') ?? '').trim();
  if (override.length > 0) {
    push(override);
  }

  const defaultPath = defaultCursorStateDbPath();
  push(defaultPath);
  push(`${defaultPath}.backup`);

  for (const userDataDir of readArgvUserDataDirs()) {
    const globalStorage = path.join(userDataDir, 'User', 'globalStorage');
    push(path.join(globalStorage, 'state.vscdb'));
    push(path.join(globalStorage, 'state.vscdb.backup'));
  }

  return paths;
}

function configuredStateDbPath(): string {
  return enumerateStateDbPaths()[0] ?? defaultCursorStateDbPath();
}

function resolveSqlJsWasmPath(extensionPath: string): string {
  return path.join(extensionPath, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
}

export function normalizeStoredToken(raw: unknown): string | null {
  if (typeof raw === 'string') {
    let value = raw.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }
    return value.length > 0 ? value : null;
  }
  if (raw instanceof Uint8Array) {
    return normalizeStoredToken(Buffer.from(raw).toString('utf8'));
  }
  return null;
}

function decodeDbValue(raw: unknown): string | null {
  return normalizeStoredToken(raw);
}

async function openDatabase(dbPath: string, extensionPath: string): Promise<SqlDatabase> {
  const wasmPath = resolveSqlJsWasmPath(extensionPath);
  if (!fs.existsSync(wasmPath)) {
    throw new Error('sql.js WASM file is missing from the extension install.');
  }
  const wasmBinary = fs.readFileSync(wasmPath);
  const sqlJsMod = await import('sql.js');
  const initSqlJs: InitSqlJs =
    typeof (sqlJsMod as { default?: InitSqlJs }).default === 'function'
      ? (sqlJsMod as { default: InitSqlJs }).default
      : (sqlJsMod as unknown as InitSqlJs);
  const SQL = await initSqlJs({ wasmBinary });
  const fileBuffer = fs.readFileSync(dbPath);
  return new SQL.Database(new Uint8Array(fileBuffer));
}

function readKeyFromDb(db: SqlDatabase, key: string): string | null {
  const stmt = db.prepare('SELECT value FROM ItemTable WHERE key = ? LIMIT 1');
  stmt.bind([key]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as { value?: unknown };
  stmt.free();
  return decodeDbValue(row.value);
}

function toCliDbPath(dbPath: string): string {
  if (process.platform === 'win32') {
    return dbPath;
  }
  const match = /^([A-Za-z]):\\(.*)$/.exec(dbPath);
  if (!match) {
    return dbPath;
  }
  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, '/');
  return `/mnt/${drive}/${rest}`;
}

function readKeyFromDbCli(dbPath: string, key: string): string | null {
  const cliPath = toCliDbPath(dbPath);
  const sql = `SELECT value FROM ItemTable WHERE key='${key}' LIMIT 1;`;
  const binaries =
    process.platform === 'win32'
      ? ['sqlite3.exe', 'sqlite3']
      : ['sqlite3', '/usr/bin/sqlite3'];
  for (const binary of binaries) {
    try {
      const output = execFileSync(binary, [cliPath, sql], {
        encoding: 'utf8',
        timeout: 30_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return decodeDbValue(output);
    } catch {
      // try next sqlite3 binary
    }
  }
  return null;
}

function readAuthKeysFromDbCli(dbPath: string): {
  accessToken: string | null;
  refreshToken: string | null;
  membershipType: string | null;
} {
  return {
    accessToken: readKeyFromDbCli(dbPath, ACCESS_KEY),
    refreshToken: readKeyFromDbCli(dbPath, REFRESH_KEY),
    membershipType: readKeyFromDbCli(dbPath, MEMBERSHIP_KEY),
  };
}

async function readSqliteAuth(extensionPath: string): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  membershipType: string | null;
  dbPath: string;
  dbExists: boolean;
  dbSizeMb: number | null;
  error: string | null;
}> {
  const candidates = enumerateStateDbPaths();
  let firstExistingPath = candidates[0] ?? defaultCursorStateDbPath();
  let lastError: string | null = null;

  for (const dbPath of candidates) {
    if (!fs.existsSync(dbPath)) {
      continue;
    }
    firstExistingPath = dbPath;
    const dbSizeMb = Math.round((fs.statSync(dbPath).size / (1024 * 1024)) * 10) / 10;

    if (dbSizeMb > 256) {
      const cliAuth = readAuthKeysFromDbCli(dbPath);
      if (cliAuth.accessToken || cliAuth.refreshToken || cliAuth.membershipType) {
        return {
          accessToken: cliAuth.accessToken,
          refreshToken: cliAuth.refreshToken,
          membershipType: cliAuth.membershipType,
          dbPath,
          dbExists: true,
          dbSizeMb,
          error: null,
        };
      }
    }

    try {
      const db = await openDatabase(dbPath, extensionPath);
      try {
        const accessToken = readKeyFromDb(db, ACCESS_KEY);
        const refreshToken = readKeyFromDb(db, REFRESH_KEY);
        const membershipType = readKeyFromDb(db, MEMBERSHIP_KEY);
        if (accessToken || refreshToken || membershipType) {
          return {
            accessToken,
            refreshToken,
            membershipType,
            dbPath,
            dbExists: true,
            dbSizeMb,
            error: null,
          };
        }
      } finally {
        db.close();
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  const fallbackPath = candidates[0] ?? defaultCursorStateDbPath();
  if (!fs.existsSync(firstExistingPath)) {
    return {
      accessToken: null,
      refreshToken: null,
      membershipType: null,
      dbPath: fallbackPath,
      dbExists: false,
      dbSizeMb: null,
      error: lastError,
    };
  }

  const dbSizeMb = Math.round((fs.statSync(firstExistingPath).size / (1024 * 1024)) * 10) / 10;
  return {
    accessToken: null,
    refreshToken: null,
    membershipType: null,
    dbPath: firstExistingPath,
    dbExists: true,
    dbSizeMb,
    error: lastError,
  };
}

type KeytarModule = {
  getPassword: (service: string, account: string) => Promise<string | null>;
  findPassword: (service: string) => Promise<string | null>;
};

async function loadKeytar(): Promise<KeytarModule | null> {
  try {
    const keytarMod = await import('keytar');
    const keytar = (keytarMod as { default?: KeytarModule }).default ?? (keytarMod as KeytarModule);
    if (typeof keytar.getPassword !== 'function') {
      return null;
    }
    return keytar;
  } catch {
    return null;
  }
}

async function readKeychainPassword(service: string): Promise<string | null> {
  const keytar = await loadKeytar();
  if (!keytar) {
    return null;
  }

  const attempts: Array<[string, string]> = [
    [service, 'cursor'],
    [service, 'Cursor'],
    ['cursor', service],
  ];
  for (const [svc, account] of attempts) {
    try {
      const value = await keytar.getPassword(svc, account);
      const normalized = normalizeStoredToken(value);
      if (normalized) {
        return normalized;
      }
    } catch {
      // keytar throws when service/account are invalid for this host
    }
  }

  if (typeof keytar.findPassword === 'function') {
    for (const svc of [service, 'cursor']) {
      try {
        const value = await keytar.findPassword(svc);
        const normalized = normalizeStoredToken(value);
        if (normalized) {
          return normalized;
        }
      } catch {
        // ignore missing credentials for this service name
      }
    }
  }

  return null;
}

async function readKeychainAuth(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
}> {
  try {
    const [accessToken, refreshToken] = await Promise.all([
      readKeychainPassword(KEYCHAIN_ACCESS_SERVICE),
      readKeychainPassword(KEYCHAIN_REFRESH_SERVICE),
    ]);
    return { accessToken, refreshToken, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { accessToken: null, refreshToken: null, error: message };
  }
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tokenSubject(token: string | null): string | null {
  if (!token) {
    return null;
  }
  const payload = decodeJwtPayload(token);
  return typeof payload?.sub === 'string' ? payload.sub : null;
}

function isTokenExpired(token: string, skewSeconds = 60): boolean {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== 'number') {
    return false;
  }
  return Date.now() >= (exp - skewSeconds) * 1000;
}

interface RefreshResponse {
  access_token?: string;
  shouldLogout?: boolean;
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const response = await fetch(`${API_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB',
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) {
    return null;
  }
  const json = (await response.json()) as RefreshResponse;
  if (json.shouldLogout || !json.access_token) {
    return null;
  }
  return json.access_token;
}

export function buildWorkosSessionCookie(accessToken: string): { userId: string; cookie: string } | null {
  const payload = decodeJwtPayload(accessToken);
  const sub = payload?.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    return null;
  }
  const parts = sub.split('|');
  const userId = parts.length > 1 ? parts[1] : parts[0];
  if (!userId) {
    return null;
  }
  return { userId, cookie: `${userId}%3A%3A${accessToken}` };
}

function chooseAuthCandidate(
  sqlite: Awaited<ReturnType<typeof readSqliteAuth>>,
  keychain: { accessToken: string | null; refreshToken: string | null },
): { accessToken: string | null; refreshToken: string | null; source: AuthTokenSource | null } {
  const sqliteSubject = tokenSubject(sqlite.accessToken);
  const keychainSubject = tokenSubject(keychain.accessToken);
  const membership = sqlite.membershipType?.trim().toLowerCase() ?? null;
  const sqliteLooksFree = membership === 'free';

  if (keychain.accessToken) {
    const preferKeychain =
      !sqlite.accessToken ||
      (sqliteLooksFree && !!keychainSubject && !!sqliteSubject && keychainSubject !== sqliteSubject);
    if (preferKeychain) {
      return {
        accessToken: keychain.accessToken,
        refreshToken: keychain.refreshToken ?? sqlite.refreshToken,
        source: 'keychain',
      };
    }
  }

  if (sqlite.accessToken) {
    return {
      accessToken: sqlite.accessToken,
      refreshToken: sqlite.refreshToken,
      source: 'sqlite',
    };
  }

  if (keychain.accessToken) {
    return {
      accessToken: keychain.accessToken,
      refreshToken: keychain.refreshToken,
      source: 'keychain',
    };
  }

  return { accessToken: null, refreshToken: null, source: null };
}

export function formatAuthFailureMessage(diagnostic: AuthDiagnostic): string {
  const hasToken =
    diagnostic.sqliteAccessToken || diagnostic.keychainAccessToken || diagnostic.secretStorageToken;
  if (diagnostic.extensionHost === 'remote' && !hasToken) {
    return 'Extension is running remotely (WSL/SSH) and could not read Cursor auth. Run "Set Access Token", or force this extension to run locally (see README).';
  }
  if (!diagnostic.stateDbExists && !diagnostic.keychainAccessToken && !diagnostic.secretStorageToken) {
    return 'Cursor auth not found. Sign in to Cursor on this machine, or run "Set Access Token".';
  }
  if (diagnostic.stateDbExists && !diagnostic.sqliteAccessToken && diagnostic.stateDbSizeMb !== null && diagnostic.stateDbSizeMb > 256) {
    return 'Cursor state database is very large and could not be read. Set cursorUsageMeter.stateDbPath to a trimmed copy, or use "Set Access Token".';
  }
  if (diagnostic.notes.some((note) => note.includes('sql.js'))) {
    return 'Could not open Cursor local database. Use "Set Access Token" or point cursorUsageMeter.stateDbPath at a smaller copy.';
  }
  return 'Not signed in to Cursor (no access token found). Try "Set Access Token" for corporate/team accounts.';
}

export async function diagnoseAuth(
  context: vscode.ExtensionContext,
  extensionPath: string,
): Promise<AuthDiagnostic> {
  const [sqlite, keychain, secretToken] = await Promise.all([
    readSqliteAuth(extensionPath),
    readKeychainAuth(),
    context.secrets.get(SECRET_STORAGE_KEY),
  ]);
  const notes: string[] = [];
  if (sqlite.error) {
    notes.push(`sqlite: ${sqlite.error}`);
  }
  if (keychain.error) {
    notes.push(`keychain: ${keychain.error}`);
  }
  if (vscode.env.remoteName) {
    notes.push(`remote: ${vscode.env.remoteName}`);
  }
  const selected = chooseAuthCandidate(sqlite, keychain);
  if (secretToken) {
    selected.source = 'secret';
  } else if (cachedAccessToken && cachedTokenSource) {
    selected.source = cachedTokenSource;
  }

  return {
    stateDbPath: sqlite.dbPath,
    stateDbExists: sqlite.dbExists,
    stateDbSizeMb: sqlite.dbSizeMb,
    candidateDbPaths: enumerateStateDbPaths(),
    extensionHost: vscode.env.remoteName ? 'remote' : 'local',
    remoteName: vscode.env.remoteName,
    sqliteAccessToken: !!sqlite.accessToken,
    sqliteRefreshToken: !!sqlite.refreshToken,
    sqliteMembershipType: sqlite.membershipType,
    keychainAccessToken: !!keychain.accessToken,
    keychainRefreshToken: !!keychain.refreshToken,
    secretStorageToken: !!secretToken,
    wasmAvailable: fs.existsSync(resolveSqlJsWasmPath(extensionPath)),
    selectedSource: selected.source,
    notes,
  };
}

export async function getAccessToken(
  context: vscode.ExtensionContext,
  extensionPath: string,
): Promise<string | null> {
  if (cachedAccessToken && !isTokenExpired(cachedAccessToken)) {
    return cachedAccessToken;
  }

  const secretToken = normalizeStoredToken(await context.secrets.get(SECRET_STORAGE_KEY));
  if (secretToken && !isTokenExpired(secretToken)) {
    cachedAccessToken = secretToken;
    cachedTokenSource = 'secret';
    return secretToken;
  }

  const [sqlite, keychain] = await Promise.all([readSqliteAuth(extensionPath), readKeychainAuth()]);
  const chosen = chooseAuthCandidate(sqlite, keychain);
  cachedRefreshToken = chosen.refreshToken ?? cachedRefreshToken;

  let token = chosen.accessToken;
  if (token && isTokenExpired(token) && cachedRefreshToken) {
    const refreshed = await refreshAccessToken(cachedRefreshToken);
    if (refreshed) {
      token = refreshed;
      cachedAccessToken = refreshed;
      cachedTokenSource = chosen.source ?? 'sqlite';
      return refreshed;
    }
  }

  if (token) {
    cachedAccessToken = token;
    cachedTokenSource = chosen.source ?? 'sqlite';
    return token;
  }

  if (secretToken) {
    cachedAccessToken = secretToken;
    cachedTokenSource = 'secret';
    return secretToken;
  }

  return null;
}

export async function getAuthFailureMessage(
  context: vscode.ExtensionContext,
  extensionPath: string,
): Promise<string> {
  const diagnostic = await diagnoseAuth(context, extensionPath);
  return formatAuthFailureMessage(diagnostic);
}

export async function setSecretAccessToken(context: vscode.ExtensionContext, token: string): Promise<void> {
  const normalized = normalizeStoredToken(token);
  if (!normalized) {
    throw new Error('Access token is empty.');
  }
  await context.secrets.store(SECRET_STORAGE_KEY, normalized);
  cachedAccessToken = normalized;
  cachedTokenSource = 'secret';
}

export function clearTokenCache(): void {
  cachedAccessToken = undefined;
  cachedRefreshToken = undefined;
  cachedTokenSource = undefined;
}
