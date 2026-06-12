export interface BarStyle {
  segments: number;
  fillGlyph: string;
  useSubscript: boolean;
  fillColor?: string;
  trackColor?: string;
}

// VS Code tooltip HTML allows `color` but strips `rgba()` and `opacity`.
const DEFAULT_FILL_COLOR = '#3b82f6';
// ~50% blend of fill blue on a dark tooltip background (#1e1e1e).
const DEFAULT_TRACK_COLOR = '#2c508a';

const ROW_STYLE = 'margin-bottom:5px;';
const LABEL_STYLE = 'line-height:1.25;';
const BAR_ROW_STYLE = 'line-height:1;margin-top:1px;';
const PRE_STYLE = 'margin:0;padding:0;line-height:1;border:0;background:transparent;';

export function renderSmallBar(percent: number, style: BarStyle): string {
  const segments = style.segments;
  const clamped = Math.min(100, Math.max(0, percent));
  const fillCount = Math.round((clamped / 100) * segments);
  const trackCount = segments - fillCount;
  const glyph = style.fillGlyph;
  const fill = glyph.repeat(fillCount);
  const track = glyph.repeat(trackCount);

  const fillColor = style.fillColor ?? DEFAULT_FILL_COLOR;
  const trackColor = style.trackColor ?? DEFAULT_TRACK_COLOR;
  const colored =
    `<pre style="${PRE_STYLE}">` +
    `<span style="color:${fillColor};">${fill}</span>` +
    `<span style="color:${trackColor};">${track}</span>` +
    `</pre>`;

  if (style.useSubscript) {
    return `<div style="${BAR_ROW_STYLE}"><sub style="line-height:1;">${colored}</sub></div>`;
  }
  return `<div style="${BAR_ROW_STYLE}">${colored}</div>`;
}

export function renderMetricRow(label: string, percent: number, style: BarStyle): string {
  return (
    `<div style="${ROW_STYLE}">` +
    `<div style="${LABEL_STYLE}">${label}</div>` +
    renderSmallBar(percent, style) +
    `</div>`
  );
}
