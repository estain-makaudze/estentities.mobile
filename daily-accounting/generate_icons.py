#!/usr/bin/env python3
"""
Generate all required icons for Daily Accounting app.
Requires: pip install Pillow
"""

import os
import math
from PIL import Image, ImageDraw, ImageFont

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "assets", "images")

# ── Brand colours ──────────────────────────────────────────────────────────────
BG_DARK   = (14,  40,  80)   # deep navy  #0E2850
BG_MID    = (22,  72, 140)   # mid blue   #16488C
ACCENT    = (52, 199, 137)   # mint-green #34C789
WHITE     = (255, 255, 255)
GOLD      = (255, 195,  50)  # #FFC332


# ══════════════════════════════════════════════════════════════════════════════
#  Helpers
# ══════════════════════════════════════════════════════════════════════════════

def round_rect(draw: ImageDraw.ImageDraw, xy, radius, fill):
    """Draw a rounded rectangle."""
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)


def vertical_gradient(img: Image.Image, top: tuple, bottom: tuple):
    """Fill *img* with a top→bottom linear gradient in-place."""
    w, h = img.size
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))


def draw_ledger_symbol(draw: ImageDraw.ImageDraw, cx: int, cy: int, size: int):
    """
    Draw a minimalist 'open ledger with check-mark' symbol centred at (cx, cy).
    *size* is the approximate bounding-box diameter.
    """
    s = size
    # --- book body (white rounded rect) ---
    bw, bh = int(s * 0.55), int(s * 0.65)
    bx0 = cx - bw // 2
    by0 = cy - bh // 2
    bx1 = cx + bw // 2
    by1 = cy + bh // 2
    r = int(s * 0.05)
    draw.rounded_rectangle([bx0, by0, bx1, by1], radius=r, fill=WHITE)

    # --- spine (left accent strip) ---
    sw = int(bw * 0.12)
    draw.rounded_rectangle([bx0, by0, bx0 + sw, by1],
                            radius=r, fill=(*ACCENT, 255))

    # --- ruled lines ---
    lx0 = bx0 + sw + int(bw * 0.08)
    lx1 = bx1 - int(bw * 0.08)
    line_color = (180, 200, 230)
    n_lines = 5
    pad = int(bh * 0.15)
    for i in range(n_lines):
        ly = by0 + pad + i * ((bh - 2 * pad) // (n_lines - 1))
        draw.line([(lx0, ly), (lx1, ly)], fill=line_color, width=max(1, int(s * 0.015)))

    # --- bold top line (header) ---
    draw.line([(lx0, by0 + pad - int(bh * 0.07)),
               (lx1, by0 + pad - int(bh * 0.07))],
              fill=(100, 140, 200), width=max(2, int(s * 0.022)))

    # --- green tick (bottom-right corner of book) ---
    tk = int(s * 0.20)
    # circle badge background
    tcx = bx1 - int(tk * 0.4)
    tcy = by1 - int(tk * 0.4)
    draw.ellipse([tcx - tk // 2, tcy - tk // 2,
                  tcx + tk // 2, tcy + tk // 2],
                 fill=(*ACCENT, 255))
    # tick stroke
    pts = [
        (tcx - int(tk * 0.28), tcy),
        (tcx - int(tk * 0.05), tcy + int(tk * 0.22)),
        (tcx + int(tk * 0.30), tcy - int(tk * 0.20)),
    ]
    draw.line(pts, fill=WHITE, width=max(2, int(s * 0.03)))


# ══════════════════════════════════════════════════════════════════════════════
#  Icon generators
# ══════════════════════════════════════════════════════════════════════════════

def make_app_icon(size: int = 1024) -> Image.Image:
    """
    Main 1024×1024 icon – no transparency, no rounded corners
    (the OS applies the mask).
    """
    img = Image.new("RGB", (size, size))
    vertical_gradient(img, BG_DARK, BG_MID)
    draw = ImageDraw.Draw(img)
    draw_ledger_symbol(draw, size // 2, size // 2, int(size * 0.72))
    return img


def make_splash_icon(size: int = 1024) -> Image.Image:
    """Splash-screen icon: centred ledger on white background."""
    img = Image.new("RGB", (size, size), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Draw the symbol in navy colours directly
    s = int(size * 0.55)
    cx, cy = size // 2, size // 2
    bw, bh = int(s * 0.55), int(s * 0.65)
    bx0 = cx - bw // 2
    by0 = cy - bh // 2
    bx1 = cx + bw // 2
    by1 = cy + bh // 2
    r = int(s * 0.05)
    draw.rounded_rectangle([bx0, by0, bx1, by1], radius=r, fill=(*BG_DARK, 255))
    sw = int(bw * 0.12)
    draw.rounded_rectangle([bx0, by0, bx0 + sw, by1], radius=r, fill=(*ACCENT, 255))
    lx0 = bx0 + sw + int(bw * 0.08)
    lx1 = bx1 - int(bw * 0.08)
    line_color = (180, 200, 230)
    n_lines = 5
    pad = int(bh * 0.15)
    for i in range(n_lines):
        ly = by0 + pad + i * ((bh - 2 * pad) // (n_lines - 1))
        draw.line([(lx0, ly), (lx1, ly)], fill=line_color, width=max(1, int(s * 0.015)))
    draw.line([(lx0, by0 + pad - int(bh * 0.07)),
               (lx1, by0 + pad - int(bh * 0.07))],
              fill=(100, 140, 200), width=max(2, int(s * 0.022)))
    tk = int(s * 0.20)
    tcx = bx1 - int(tk * 0.4)
    tcy = by1 - int(tk * 0.4)
    draw.ellipse([tcx - tk // 2, tcy - tk // 2, tcx + tk // 2, tcy + tk // 2],
                 fill=(*ACCENT, 255))
    pts = [
        (tcx - int(tk * 0.28), tcy),
        (tcx - int(tk * 0.05), tcy + int(tk * 0.22)),
        (tcx + int(tk * 0.30), tcy - int(tk * 0.20)),
    ]
    draw.line(pts, fill=WHITE, width=max(2, int(s * 0.03)))
    return img


def make_adaptive_foreground(size: int = 512) -> Image.Image:
    """
    Android adaptive icon foreground.
    Transparent background; symbol should stay within the inner 66 % safe zone.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # safe-zone diameter ≈ 66 % of size
    symbol_size = int(size * 0.56)
    draw_ledger_symbol(draw, size // 2, size // 2, symbol_size)
    return img


def make_adaptive_background(size: int = 512) -> Image.Image:
    """Android adaptive icon background – solid gradient, no transparency."""
    base = Image.new("RGB", (size, size))
    vertical_gradient(base, BG_DARK, BG_MID)
    return base.convert("RGBA")


def make_monochrome(size: int = 432) -> Image.Image:
    """
    Android monochrome adaptive icon – white symbol on black background.
    Android uses this for themed / tinted icons.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    symbol_size = int(size * 0.78)
    cx, cy = size // 2, size // 2
    s = symbol_size
    bw, bh = int(s * 0.55), int(s * 0.65)
    bx0, by0 = cx - bw // 2, cy - bh // 2
    bx1, by1 = cx + bw // 2, cy + bh // 2
    r = int(s * 0.05)
    draw.rounded_rectangle([bx0, by0, bx1, by1], radius=r, fill=(255, 255, 255, 255))
    # spine
    sw = int(bw * 0.12)
    draw.rounded_rectangle([bx0, by0, bx0 + sw, by1], radius=r, fill=(180, 180, 180, 255))
    # lines
    lx0 = bx0 + sw + int(bw * 0.08)
    lx1 = bx1 - int(bw * 0.08)
    for i in range(5):
        pad = int(bh * 0.15)
        ly = by0 + pad + i * ((bh - 2 * pad) // 4)
        draw.line([(lx0, ly), (lx1, ly)], fill=(120, 120, 120, 255),
                  width=max(1, int(s * 0.015)))
    # tick badge
    tk = int(s * 0.20)
    tcx = bx1 - int(tk * 0.4)
    tcy = by1 - int(tk * 0.4)
    draw.ellipse([tcx - tk // 2, tcy - tk // 2, tcx + tk // 2, tcy + tk // 2],
                 fill=(200, 200, 200, 255))
    pts = [
        (tcx - int(tk * 0.28), tcy),
        (tcx - int(tk * 0.05), tcy + int(tk * 0.22)),
        (tcx + int(tk * 0.30), tcy - int(tk * 0.20)),
    ]
    draw.line(pts, fill=(255, 255, 255, 255), width=max(2, int(s * 0.03)))
    return img


def make_favicon(size: int = 48) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # simple rounded square bg
    draw.rounded_rectangle([0, 0, size - 1, size - 1],
                            radius=int(size * 0.18), fill=(*BG_DARK, 255))
    # tiny ledger
    bw, bh = int(size * 0.50), int(size * 0.58)
    bx0 = (size - bw) // 2
    by0 = (size - bh) // 2
    bx1, by1 = bx0 + bw, by0 + bh
    draw.rounded_rectangle([bx0, by0, bx1, by1], radius=2, fill=(255, 255, 255, 255))
    sw = max(2, int(bw * 0.14))
    draw.rounded_rectangle([bx0, by0, bx0 + sw, by1], radius=2,
                            fill=(*ACCENT, 255))
    return img


# ══════════════════════════════════════════════════════════════════════════════
#  Main
# ══════════════════════════════════════════════════════════════════════════════

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    tasks = [
        ("icon.png",                     make_app_icon,          {"size": 1024}),
        ("splash-icon.png",              make_splash_icon,        {"size": 1024}),
        ("favicon.png",                  make_favicon,            {"size": 48}),
        ("android-icon-foreground.png",  make_adaptive_foreground,{"size": 512}),
        ("android-icon-background.png",  make_adaptive_background,{"size": 512}),
        ("android-icon-monochrome.png",  make_monochrome,         {"size": 432}),
    ]

    for filename, fn, kwargs in tasks:
        path = os.path.join(OUTPUT_DIR, filename)
        img = fn(**kwargs)
        img.save(path, "PNG", optimize=True)
        print(f"✓  {filename:40s}  {img.size}  {img.mode}")

    # Remove leftover default Expo sample images
    for obsolete in ("react-logo.png", "react-logo@2x.png",
                     "react-logo@3x.png", "partial-react-logo.png"):
        p = os.path.join(OUTPUT_DIR, obsolete)
        if os.path.exists(p):
            os.remove(p)
            print(f"✗  removed {obsolete}")

    print("\nAll icons generated successfully!")


if __name__ == "__main__":
    main()


