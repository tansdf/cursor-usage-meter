import * as vscode from 'vscode';
import { UsageSnapshot } from '../api/usageClient';
import { ExtensionConfig } from '../config';
import { renderMetricRow } from './progressBar';

function formatPercent(value: number, showDecimals: boolean): string {
  if (showDecimals) {
    const rounded = Math.round(value * 10) / 10;
    return `${rounded}%`;
  }
  return `${Math.round(value)}%`;
}

function formatDollars(value: number): string {
  if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 0.005) {
    return `$${Math.round(value)}`;
  }
  return `$${value.toFixed(2)}`;
}

function formatBillingRange(start: Date | null, end: Date | null): string | null {
  if (!start || !end) {
    return null;
  }
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

function barStyleFromConfig(config: ExtensionConfig) {
  return {
    segments: config.barSegments,
    fillGlyph: config.barFillGlyph,
    useSubscript: config.useSubscript,
  };
}

function formatTotalLabel(snapshot: UsageSnapshot, config: ExtensionConfig): string {
  if (snapshot.accountKind === 'request-based' && snapshot.requestsUsed !== null && snapshot.requestsLimit !== null) {
    return `Requests ${snapshot.requestsUsed} / ${snapshot.requestsLimit}`;
  }
  if (snapshot.isTeam && snapshot.totalUsedDollars !== null && snapshot.totalLimitDollars !== null) {
    return `Total ${formatDollars(snapshot.totalUsedDollars)} / ${formatDollars(snapshot.totalLimitDollars)}`;
  }
  return `Total ${formatPercent(snapshot.totalPercentUsed, config.showDecimals)}`;
}

function sectionHeader(snapshot: UsageSnapshot): string {
  if (snapshot.accountKind === 'request-based' || snapshot.isTeam) {
    return snapshot.planName;
  }
  return `Included in ${snapshot.planName}`;
}

export function buildUsageTooltip(snapshot: UsageSnapshot, config: ExtensionConfig): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportHtml = true;

  const barStyle = barStyleFromConfig(config);
  const lines: string[] = [];

  lines.push(`**${sectionHeader(snapshot)}**`);
  lines.push('');
  lines.push(renderMetricRow(formatTotalLabel(snapshot, config), snapshot.totalPercentUsed, barStyle));

  if (snapshot.accountKind !== 'request-based') {
    const auto = snapshot.autoPercentUsed;
    const api = snapshot.apiPercentUsed;
    if (auto !== null && api !== null) {
      lines.push('');
      lines.push(`${formatPercent(auto, config.showDecimals)} Auto and ${formatPercent(api, config.showDecimals)} API used`);
      lines.push('');
    }

    if (auto !== null) {
      lines.push(renderMetricRow(`Auto + Composer ${formatPercent(auto, config.showDecimals)}`, auto, barStyle));
      lines.push('');
    }

    if (api !== null) {
      lines.push(renderMetricRow(`API ${formatPercent(api, config.showDecimals)}`, api, barStyle));
      lines.push('');
    }
  }

  if (snapshot.onDemandLimitDollars !== null && snapshot.onDemandUsedDollars !== null) {
    const used = formatDollars(snapshot.onDemandUsedDollars);
    const limit = formatDollars(snapshot.onDemandLimitDollars);
    const onDemandPercent =
      snapshot.onDemandLimitDollars > 0
        ? (snapshot.onDemandUsedDollars / snapshot.onDemandLimitDollars) * 100
        : 0;
    lines.push(renderMetricRow(`On-Demand ${used} / ${limit}`, onDemandPercent, barStyle));
    lines.push('');
  }

  const billing = formatBillingRange(snapshot.billingCycleStart, snapshot.billingCycleEnd);
  if (billing) {
    lines.push(billing);
  }

  md.appendMarkdown(lines.join('\n'));
  return md;
}

export function buildErrorTooltip(message: string): vscode.MarkdownString {
  const md = new vscode.MarkdownString(message, true);
  md.isTrusted = true;
  return md;
}
