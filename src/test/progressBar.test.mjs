import assert from 'assert';

const FILL_COLOR = '#3b82f6';
const TRACK_COLOR = '#2c508a';

function renderSmallBar(percent, style) {
  const segments = style.segments;
  const clamped = Math.min(100, Math.max(0, percent));
  const fillCount = Math.round((clamped / 100) * segments);
  const trackCount = segments - fillCount;
  const glyph = style.fillGlyph;
  const fill = glyph.repeat(fillCount);
  const track = glyph.repeat(trackCount);
  const colored =
    `<pre style="margin:0;padding:0;line-height:1;border:0;background:transparent;">` +
    `<span style="color:${FILL_COLOR};">${fill}</span>` +
    `<span style="color:${TRACK_COLOR};">${track}</span>` +
    `</pre>`;
  return `<div style="line-height:1;margin-top:1px;"><sub style="line-height:1;">${colored}</sub></div>`;
}

function renderMetricRow(label, percent, style) {
  return `<div style="margin-bottom:5px;"><div style="line-height:1.25;">${label}</div>${renderSmallBar(percent, style)}</div>`;
}

const style = { segments: 34, fillGlyph: '▓' };
const row = renderMetricRow('Total 18%', 18, style);
const apiRow = renderMetricRow('API 67%', 67, style);

assert.ok(row.includes('▓'.repeat(6)), 'expected 6 fill glyphs at 18% of 34');
assert.ok(row.includes('▓'.repeat(28)), 'track uses same glyph as fill');
assert.ok(row.includes(`color:${FILL_COLOR}`), 'fill should be full blue');
assert.ok(row.includes(`color:${TRACK_COLOR}`), 'track should use solid muted blue');
assert.ok(!row.includes('opacity'), 'opacity is stripped by tooltip renderer');
assert.ok(row.match(/▓/g).length === 34, 'total bar is 34 glyphs');
assert.ok(apiRow.match(/▓/g).length === 34, 'api bar is also 34 glyphs');

console.log('progressBar tests passed');
