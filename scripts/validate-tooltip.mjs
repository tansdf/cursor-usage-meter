const FILL_COLOR = '#3b82f6';
const TRACK_COLOR = '#555555';

function renderSmallBar(percent, style) {
  const segments = style.segments;
  const clamped = Math.min(100, Math.max(0, percent));
  const fillCount = Math.round((clamped / 100) * segments);
  const trackCount = segments - fillCount;
  const fill = style.fillGlyph.repeat(fillCount);
  const track = style.trackGlyph.repeat(trackCount);
  const colored = `<span style="color:${FILL_COLOR};">${fill}</span><span style="color:${TRACK_COLOR};">${track}</span>`;
  return style.useSubscript ? `<sub>${colored}</sub>` : colored;
}

function formatPercent(value, showDecimals) {
  if (showDecimals) {
    return `${Math.round(value * 10) / 10}%`;
  }
  return `${Math.round(value)}%`;
}

function barStyle(config) {
  return {
    segments: config.barSegments,
    fillGlyph: config.barFillGlyph,
    trackGlyph: config.barTrackGlyph,
    useSubscript: config.useSubscript,
  };
}

function buildTooltip(snapshot, config) {
  const style = barStyle(config);
  const lines = [];
  lines.push(`**Included in ${snapshot.planName}**`);
  lines.push('');
  lines.push(`Total ${formatPercent(snapshot.totalPercentUsed, config.showDecimals)}<br>${renderSmallBar(snapshot.totalPercentUsed, style)}`);
  lines.push('');
  const auto = snapshot.autoPercentUsed ?? 0;
  const api = snapshot.apiPercentUsed ?? 0;
  lines.push(`${formatPercent(auto, config.showDecimals)} Auto and ${formatPercent(api, config.showDecimals)} API used`);
  lines.push('');
  lines.push(`Auto + Composer ${formatPercent(snapshot.autoPercentUsed, config.showDecimals)}<br>${renderSmallBar(snapshot.autoPercentUsed, style)}`);
  lines.push('');
  lines.push(`API ${formatPercent(snapshot.apiPercentUsed, config.showDecimals)}<br>${renderSmallBar(snapshot.apiPercentUsed, style)}`);
  lines.push('');
  const used = `$${Math.round(snapshot.onDemandUsedDollars)}`;
  const limit = `$${Math.round(snapshot.onDemandLimitDollars)}`;
  const onDemandPercent = (snapshot.onDemandUsedDollars / snapshot.onDemandLimitDollars) * 100;
  lines.push(`On-Demand ${used} / ${limit}<br>${renderSmallBar(onDemandPercent, style)}`);
  return lines.join('\n');
}

const snapshot = {
  planName: 'Pro+',
  totalPercentUsed: 17.58235294117647,
  autoPercentUsed: 4.0525,
  apiPercentUsed: 66.78181818181818,
  onDemandUsedDollars: 0,
  onDemandLimitDollars: 10,
};

const config = {
  showDecimals: false,
  barSegments: 34,
  barFillGlyph: '_',
  barTrackGlyph: '_',
  useSubscript: true,
};

console.log(buildTooltip(snapshot, config));
