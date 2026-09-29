"""
Generate all app icons for family_expenses.

Design (matches the in-app design system): royal-blue gradient tile, a white
rounded roof chevron sheltering three rising bars — home + money + statistics —
with the tallest bar in warm gold as the accent.

Vector-drawn with pycairo (crisp anti-aliasing), composited with Pillow.
Run:  python3 generate_icons.py
"""
import math
import os

import cairo
from PIL import Image, ImageFilter

ASSETS = os.path.join(os.path.dirname(__file__), "assets", "images")

BG_A = (0x55, 0x60, 0xFF)   # top-left
BG_B = (0x1C, 0x24, 0xB0)   # bottom-right
WHITE = (1, 1, 1)
GOLD_TOP = (0xFF, 0xD5, 0x6B)
GOLD_BOT = (0xFF, 0xA9, 0x2E)


def rgb(c, a=1.0):
    return (c[0] / 255, c[1] / 255, c[2] / 255, a)


def to_pil(surface):
    """cairo ARGB32 (premultiplied BGRA) → PIL RGBA."""
    w, h = surface.get_width(), surface.get_height()
    img = Image.frombuffer("RGBA", (w, h), bytes(surface.get_data()), "raw", "BGRa", 0, 1)
    return img.copy()


def rounded_rect(ctx, x, y, w, h, r):
    ctx.new_sub_path()
    ctx.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    ctx.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    ctx.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    ctx.arc(x + r, y + r, r, math.pi, 3 * math.pi / 2)
    ctx.close_path()


# ── layers ────────────────────────────────────────────────────────────────────

def background(size, radius=0.0):
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)
    ctx = cairo.Context(surf)
    if radius:
        rounded_rect(ctx, 0, 0, size, size, size * radius)
        ctx.clip()
    grad = cairo.LinearGradient(0, 0, size, size)
    grad.add_color_stop_rgba(0, *rgb(BG_A))
    grad.add_color_stop_rgba(1, *rgb(BG_B))
    ctx.set_source(grad)
    ctx.paint()
    # soft light from the top-left
    glow = cairo.RadialGradient(size * 0.22, size * 0.12, 0, size * 0.22, size * 0.12, size * 0.85)
    glow.add_color_stop_rgba(0, 1, 1, 1, 0.22)
    glow.add_color_stop_rgba(1, 1, 1, 1, 0)
    ctx.set_source(glow)
    ctx.paint()
    # faint decorative ring, bottom-right
    ctx.set_source_rgba(1, 1, 1, 0.07)
    ctx.set_line_width(size * 0.05)
    ctx.arc(size * 0.98, size * 1.02, size * 0.42, 0, 2 * math.pi)
    ctx.stroke()
    return to_pil(surf)


def mark(size, scale=1.0, mono=False):
    """Roof + three bars, on a transparent canvas. Geometry is on a 1024 grid."""
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)
    ctx = cairo.Context(surf)
    k = size / 1024
    ctx.scale(k, k)
    # centre the mark (its visual centre is ~ (512, 505) on the grid)
    ctx.translate(512, 512)
    ctx.scale(scale, scale)
    ctx.translate(-512, -505)

    # roof chevron
    ctx.set_source_rgba(*WHITE, 1)
    ctx.set_line_width(74)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    ctx.move_to(262, 478)
    ctx.line_to(512, 268)
    ctx.line_to(762, 478)
    ctx.stroke()

    # rising bars
    bw, base = 86, 772
    bars = [(392, 150), (512, 225), (632, 300)]
    for i, (cx, h) in enumerate(bars):
        x, y = cx - bw / 2, base - h
        rounded_rect(ctx, x, y, bw, h, bw / 2)
        if i == 2 and not mono:
            g = cairo.LinearGradient(0, y, 0, base)
            g.add_color_stop_rgba(0, *rgb(GOLD_TOP))
            g.add_color_stop_rgba(1, *rgb(GOLD_BOT))
            ctx.set_source(g)
        else:
            ctx.set_source_rgba(*WHITE, 1 if (mono or i == 1) else 0.92)
        ctx.fill()
    return to_pil(surf)


def with_shadow(layer, size, strength=0.28):
    """Soft drop shadow under the mark for depth."""
    alpha = layer.split()[3]
    shadow = Image.new("RGBA", layer.size, (10, 14, 90, 0))
    shadow.putalpha(alpha.point(lambda a: int(a * strength)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.025))
    out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    out.alpha_composite(shadow, (0, int(size * 0.02)))
    out.alpha_composite(layer)
    return out


def full_icon(size, radius=0.0, scale=1.0):
    bg = background(size, radius)
    m = with_shadow(mark(size, scale), size)
    if radius:  # keep shadow inside rounded tile
        m.putalpha(Image.composite(m.split()[3], Image.new("L", m.size, 0), bg.split()[3]))
    bg.alpha_composite(m)
    return bg


# ── write assets ──────────────────────────────────────────────────────────────

def save(img, name, out_dir=ASSETS):
    path = os.path.join(out_dir, name)
    img.save(path, optimize=True)
    print(f"  ✓  {name}  ({img.width}×{img.height})")


def generate(out_dir=ASSETS):
    os.makedirs(out_dir, exist_ok=True)
    print("\n🎨  Generating icons …\n")
    # iOS / store icon: full-bleed square (the OS applies the corner mask)
    save(full_icon(1024), "icon.png", out_dir)
    # Android adaptive: mark must sit inside the central 66% safe zone
    save(with_shadow(mark(1024, scale=0.84), 1024), "android-icon-foreground.png", out_dir)
    save(background(1024), "android-icon-background.png", out_dir)
    save(mark(1024, scale=0.84, mono=True), "android-icon-monochrome.png", out_dir)
    # Splash: rounded tile on transparent (app.json sets the background colour)
    splash = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    splash.alpha_composite(full_icon(320, radius=0.23), (96, 96))
    save(splash, "splash-icon.png", out_dir)
    # Web favicon
    save(full_icon(64, radius=0.23).resize((64, 64)), "favicon.png", out_dir)
    print("\n✅  Icons saved to", out_dir, "\n")


if __name__ == "__main__":
    import sys
    generate(sys.argv[1] if len(sys.argv) > 1 else ASSETS)
