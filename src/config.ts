import * as vscode from 'vscode';
import { DEFAULT_BAR_FILL_COLOR } from './ui/progressBar';

export const API_BASE_URL = 'https://api2.cursor.sh';

export const SECRET_STORAGE_KEY = 'cursorUsageMeter.accessToken';

export interface ExtensionConfig {
  pollIntervalSeconds: number;
  warningPercent: number;
  criticalPercent: number;
  showDecimals: boolean;
  barSegments: number;
  barFillGlyph: string;
  barFillColor: string;
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

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function parseHexColor(raw: unknown, fallback: string): string {
  const value = String(raw ?? '').trim();
  if (!HEX_COLOR.test(value)) {
    return fallback;
  }
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
  }
  return value.toLowerCase();
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
    barFillColor: parseHexColor(cfg.get('barFillColor'), DEFAULT_BAR_FILL_COLOR),
    useSubscript: cfg.get('useSubscript') !== false,
  };
}
