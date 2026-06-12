import * as vscode from 'vscode';

export const API_BASE_URL = 'https://api2.cursor.sh';

export const SECRET_STORAGE_KEY = 'cursorUsageMeter.accessToken';

export interface ExtensionConfig {
  pollIntervalSeconds: number;
  warningPercent: number;
  criticalPercent: number;
  showDecimals: boolean;
  barSegments: number;
  barFillGlyph: string;
  useSubscript: boolean;
}

function clampPollSeconds(raw: number): number {
  if (!Number.isFinite(raw)) {
    return 300;
  }
  return Math.max(60, Math.floor(raw));
}

function clampPercent(raw: number, fallback: number): number {
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, raw));
}

function clampSegments(raw: number): number {
  if (!Number.isFinite(raw)) {
    return 34;
  }
  return Math.min(48, Math.max(8, Math.floor(raw)));
}

function singleGlyph(raw: unknown, fallback: string): string {
  const value = String(raw ?? fallback);
  return value.length > 0 ? value[0] : fallback;
}

export function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('cursorUsageMeter');
  return {
    pollIntervalSeconds: clampPollSeconds(Number(cfg.get('pollIntervalSeconds'))),
    warningPercent: clampPercent(Number(cfg.get('warningPercent')), 80),
    criticalPercent: clampPercent(Number(cfg.get('criticalPercent')), 95),
    showDecimals: Boolean(cfg.get('showDecimals')),
    barSegments: clampSegments(Number(cfg.get('barSegments'))),
    barFillGlyph: singleGlyph(cfg.get('barFillGlyph'), '▓'),
    useSubscript: cfg.get('useSubscript') !== false,
  };
}
