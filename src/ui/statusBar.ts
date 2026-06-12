import * as vscode from 'vscode';
import { UsageSnapshot } from '../api/usageClient';
import { ExtensionConfig } from '../config';
import { buildErrorTooltip, buildUsageTooltip } from './tooltipBuilder';

const ICON_ID = 'speedometer';

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
};

function formatUpdatedTime(date: Date): string {
  return date.toLocaleTimeString(undefined, TIME_FORMAT);
}

function formatCollapsedPercent(snapshot: UsageSnapshot, showDecimals: boolean): string {
  if (snapshot.accountKind === 'request-based' && snapshot.requestsUsed !== null && snapshot.requestsLimit !== null) {
    return `${snapshot.requestsUsed}/${snapshot.requestsLimit}`;
  }
  if (snapshot.isTeam && snapshot.totalUsedDollars !== null) {
    return formatDollars(snapshot.totalUsedDollars);
  }
  if (showDecimals) {
    const rounded = Math.round(snapshot.totalPercentUsed * 10) / 10;
    return `${rounded}%`;
  }
  return `${Math.round(snapshot.totalPercentUsed)}%`;
}

function formatDollars(value: number): string {
  if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 0.005) {
    return `$${Math.round(value)}`;
  }
  return `$${value.toFixed(2)}`;
}

function backgroundForPercent(percent: number, config: ExtensionConfig): vscode.ThemeColor | undefined {
  if (percent >= config.criticalPercent) {
    return new vscode.ThemeColor('statusBarItem.errorBackground');
  }
  if (percent >= config.warningPercent) {
    return new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  return undefined;
}

export class UsageStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private isErrorState = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1);
    this.item.command = 'cursorUsageMeter.refresh';
    this.item.name = 'Cursor Usage Meter';
    this.item.text = `$(${ICON_ID}) …`;
    this.item.tooltip = 'Cursor Usage Meter — loading…';
  }

  show(): void {
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }

  setLoading(): void {
    this.item.text = '$(sync~spin)';
    this.item.tooltip = 'Fetching Cursor usage…';
    this.item.backgroundColor = undefined;
  }

  updateReady(snapshot: UsageSnapshot, config: ExtensionConfig, lastUpdated: Date): void {
    this.isErrorState = false;
    this.item.command = 'cursorUsageMeter.refresh';
    const label = formatCollapsedPercent(snapshot, config.showDecimals);
    this.item.text = `$(${ICON_ID}) ${label}`;
    this.item.tooltip = buildUsageTooltip(snapshot, config);
    this.item.backgroundColor = backgroundForPercent(snapshot.totalPercentUsed, config);

    const updated = formatUpdatedTime(lastUpdated);
    const base = this.item.tooltip as vscode.MarkdownString;
    base.appendMarkdown(`\n\n---\n*Updated ${updated} · click to refresh*`);
  }

  updateError(message: string, lastUpdated?: Date): void {
    this.isErrorState = true;
    this.item.command = 'cursorUsageMeter.statusBarClick';
    this.item.text = `$(${ICON_ID}) !`;
    const md = buildErrorTooltip(message);
    if (lastUpdated) {
      md.appendMarkdown(`\n\n*Last attempt: ${formatUpdatedTime(lastUpdated)} · click for options*`);
    } else {
      md.appendMarkdown('\n\n*Click for options*');
    }
    this.item.tooltip = md;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }

  get hasError(): boolean {
    return this.isErrorState;
  }
}
