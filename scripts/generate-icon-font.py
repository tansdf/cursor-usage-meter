"""Build speedometer.woff for VS Code icon contribution from resources/speedometer.svg."""

from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import SVGPath
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SVG_PATH = ROOT / "resources" / "speedometer.svg"
OUT_DIR = ROOT / "resources"
TTF_PATH = OUT_DIR / "speedometer.ttf"
WOFF_PATH = OUT_DIR / "speedometer.woff"

UNITS = 1024
GLYPH_NAME = "speedometer"


def build_glyph(svg_text: str) -> object:
    base_pen = TTGlyphPen(None)
    pen = Cu2QuPen(base_pen, 1.0)
    transform = TransformPen(pen, (UNITS / 16, 0, 0, -UNITS / 16, 0, UNITS))
    SVGPath.fromstring(svg_text).draw(transform)
    return base_pen.glyph()


def main() -> None:
    svg_text = SVG_PATH.read_text(encoding="utf-8")
    glyph = build_glyph(svg_text)

    fb = FontBuilder(UNITS, isTTF=True)
    fb.setupGlyphOrder([".notdef", GLYPH_NAME])
    fb.setupCharacterMap({0xE000: GLYPH_NAME})
    fb.setupGlyf({".notdef": TTGlyphPen(None).glyph(), GLYPH_NAME: glyph})
    fb.setupHorizontalMetrics({".notdef": (0, 0), GLYPH_NAME: (UNITS, 0)})
    fb.setupHorizontalHeader(ascent=UNITS, descent=0)
    fb.setupNameTable({"familyName": "Cursor Usage Meter Icons", "styleName": "Regular"})
    fb.setupPost()
    fb.save(TTF_PATH)

    font = TTFont(TTF_PATH)
    font.flavor = "woff"
    font.save(WOFF_PATH)
    TTF_PATH.unlink()


if __name__ == "__main__":
    main()
