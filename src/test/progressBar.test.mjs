import assert from 'assert';

const DEFAULT_FILL_COLOR = '#3b82f6';
const DEFAULT_TRACK_COLOR = '#2c508a';

function deriveTrackColor(fillColor, background = '#1e1e1e') {
  const parse = (hex) => {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(hex.trim().toLowerCase());
    const raw = match[1];
    const expanded = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
    };
  };
  const fill = parse(fillColor);
  const bg = parse(background);
  const blend = (a, b) => Math.floor((a + b) / 2);
  const channel = (value) => value.toString(16).padStart(2, '0');
  return `#${channel(blend(fill.r, bg.r))}${channel(blend(fill.g, bg.g))}${channel(blend(fill.b, bg.b))}`;
}

function renderSmallBar(percent, style) {
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
    `<pre style="margin:0;padding:0;line-height:1;border:0;background:transparent;">` +
    `<span style="color:${fillColor};">${fill}</span>` +
    `<span style="color:${trackColor};">${track}</span>` +
    `</pre>`;
  return `<div style="line-height:1;margin-top:1px;"><sub style="line-height:1;">${colored}</sub></div>`;
}

function renderMetricRow(label, percent, style) {
  return `<div style="margin-bottom:5px;"><div style="line-height:1.25;">${label}</div>${renderSmallBar(percent, style)}</div>`;
}

assert.equal(deriveTrackColor(DEFAULT_FILL_COLOR), DEFAULT_TRACK_COLOR, 'default track color');
assert.equal(deriveTrackColor('#ff0000'), '#8e0f0f', 'custom fill derives track');

const style = { segments: 34, fillGlyph: '▓', fillColor: DEFAULT_FILL_COLOR };
const row = renderMetricRow('Total 18%', 18, style);
const apiRow = renderMetricRow('API 67%', 67, style);
const customRow = renderSmallBar(50, { segments: 10, fillGlyph: '▓', fillColor: '#00ff00' });

assert.ok(row.includes('▓'.repeat(6)), 'expected 6 fill glyphs at 18% of 34');
assert.ok(row.includes('▓'.repeat(28)), 'track uses same glyph as fill');
assert.ok(row.includes(`color:${DEFAULT_FILL_COLOR}`), 'fill should be full blue');
assert.ok(row.includes(`color:${DEFAULT_TRACK_COLOR}`), 'track should use derived muted blue');
assert.ok(!row.includes('opacity'), 'opacity is stripped by tooltip renderer');
assert.ok(row.match(/▓/g).length === 34, 'total bar is 34 glyphs');
assert.ok(apiRow.match(/▓/g).length === 34, 'api bar is also 34 glyphs');
assert.ok(customRow.includes('color:#00ff00'), 'custom fill color');
assert.ok(customRow.includes(`color:${deriveTrackColor('#00ff00')}`), 'custom track color');

console.log('progressBar tests passed');
