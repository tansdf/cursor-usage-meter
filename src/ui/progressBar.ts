export const DEFAULT_BAR_FILL_COLOR = '#3b82f6';

const TOOLTIP_BACKGROUND = '#1e1e1e';

export interface BarStyle {
  segments: number;
  fillGlyph: string;
  useSubscript: boolean;
  fillColor: string;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHexColor(hex: string): Rgb {
  const normalized = hex.trim().toLowerCase();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(normalized);
  if (!match) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const raw = match[1];
  const expanded =
    raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) => value.toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** 50% blend of fill on the dark tooltip background (VS Code strips rgba/opacity). */
export function deriveTrackColor(fillColor: string, background = TOOLTIP_BACKGROUND): string {
  const fill = parseHexColor(fillColor);
  const bg = parseHexColor(background);
  const blend = (a: number, b: number) => Math.floor((a + b) / 2);
  return rgbToHex({
    r: blend(fill.r, bg.r),
    g: blend(fill.g, bg.g),
    b: blend(fill.b, bg.b),
  });
}

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

  const fillColor = style.fillColor;
  const trackColor = deriveTrackColor(fillColor);
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
