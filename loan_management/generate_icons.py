#!/usr/bin/env python3
"""
Generate all required icons for Loan Manager app.

Design concept
──────────────
A clean "payment-schedule document" with an overlapping gold coin badge.
• Document: white rounded rect with a gold header stripe and four payment
  rows (2 green-dot "paid", 2 amber-dot "pending").
• Coin: amber/gold circle in the bottom-right corner with a white upward
  arrow (representing loan repayment progress).

Requires: pip install Pillow
Run from the loan_management/ directory:
    python generate_icons.py
"""

import os
from PIL import Image, ImageDraw

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "assets", "images")

# ── Brand palette ──────────────────────────────────────────────────────────────
NAVY       = ( 10,  24,  72)   # #0A1848  deep navy
BLUE       = ( 29,  78, 216)   # #1D4ED8  royal blue
GOLD       = (245, 158,  11)   # #F59E0B  amber gold
GOLD_RIM   = (200, 120,   0)   # darker gold for coin rim
GREEN      = ( 16, 185, 129)   # #10B981  emerald (paid)
WHITE      = (255, 255, 255)


# ══════════════════════════════════════════════════════════════════════════════
#  Helpers
# ══════════════════════════════════════════════════════════════════════════════

def vertical_gradient(img: Image.Image, top: tuple, bottom: tuple) -> None:
    """Fill *img* in-place with a top→bottom linear gradient."""
    w, h = img.size
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))


def draw_symbol(
    draw: ImageDraw.ImageDraw,
    cx: int, cy: int,
    size: int,
    on_light_bg: bool = False,
) -> None:
    """
    Draw the Loan Manager symbol centred at (cx, cy) in a bounding box of
    *size* × *size* pixels.

    on_light_bg=True: use a navy document body (for splash/white background).
    on_light_bg=False (default): use a white document body (for dark background).
    """
    s = size

    doc_body   = NAVY  if on_light_bg else WHITE
    bar_fill   = (50, 80, 140) if on_light_bg else (215, 228, 248)
    footer_bg  = (20, 40, 90)  if on_light_bg else (238, 244, 254)
    footer_bar = (60, 100, 170) if on_light_bg else (186, 210, 240)
    shadow_col = (180, 195, 220) if on_light_bg else (5, 15, 50)
    coin_arrow = NAVY if on_light_bg else WHITE

    # ── Document geometry ──────────────────────────────────────────────────────
    doc_w  = int(s * 0.56)
    doc_h  = int(s * 0.68)
    doc_x0 = cx - doc_w // 2 - int(s * 0.04)
    doc_y0 = cy - doc_h // 2
    doc_x1 = doc_x0 + doc_w
    doc_y1 = doc_y0 + doc_h
    rad    = int(s * 0.055)

    # Drop-shadow
    sh = int(s * 0.026)
    draw.rounded_rectangle(
        [doc_x0 + sh, doc_y0 + sh, doc_x1 + sh, doc_y1 + sh],
        radius=rad, fill=shadow_col,
    )

    # Document body
    draw.rounded_rectangle([doc_x0, doc_y0, doc_x1, doc_y1], radius=rad, fill=doc_body)

    # Gold header stripe
    hh = int(doc_h * 0.195)
    draw.rounded_rectangle([doc_x0, doc_y0, doc_x1, doc_y0 + hh], radius=rad, fill=GOLD)
    draw.rectangle([doc_x0, doc_y0 + hh - rad, doc_x1, doc_y0 + hh], fill=GOLD)

    # ── Payment rows ──────────────────────────────────────────────────────────
    ix0    = doc_x0 + int(doc_w * 0.10)
    ix1    = doc_x1 - int(doc_w * 0.10)
    n_rows = 4
    ry0    = doc_y0 + hh + int(doc_h * 0.08)
    ry1    = doc_y1 - int(doc_h * 0.19)
    rh     = (ry1 - ry0) / n_rows
    paid   = [True, True, False, False]

    for i in range(n_rows):
        row_cy = int(ry0 + i * rh + rh * 0.50)
        bh     = max(4, int(rh * 0.26))
        dr     = int(rh * 0.22)
        dot_cx = ix1 - dr
        bar_x1 = dot_cx - dr * 2 - int(doc_w * 0.04)
        draw.rounded_rectangle(
            [ix0, row_cy - bh, bar_x1, row_cy + bh],
            radius=bh, fill=bar_fill,
        )
        dot_col = GREEN if paid[i] else GOLD
        draw.ellipse(
            [dot_cx - dr, row_cy - dr, dot_cx + dr, row_cy + dr],
            fill=dot_col,
        )

    # Footer summary stripe
    fy  = doc_y1 - int(doc_h * 0.095)
    fh  = int(doc_h * 0.075)
    draw.rectangle(
        [doc_x0 + rad // 2, fy - fh // 2, doc_x1 - rad // 2, fy + fh // 2],
        fill=footer_bg,
    )
    tbh = max(3, int(fh * 0.40))
    draw.rounded_rectangle(
        [ix0, fy - tbh, ix0 + int(doc_w * 0.44), fy + tbh],
        radius=tbh, fill=footer_bar,
    )

    # ── Gold coin badge ────────────────────────────────────────────────────────
    cr  = int(s * 0.215)
    ccx = doc_x1 + int(cr * 0.16)
    ccy = doc_y1 - int(cr * 0.22)

    # Coin shadow
    cs = int(cr * 0.12)
    draw.ellipse(
        [ccx - cr + cs, ccy - cr + cs, ccx + cr + cs, ccy + cr + cs],
        fill=shadow_col,
    )
    # Rim
    draw.ellipse([ccx - cr, ccy - cr, ccx + cr, ccy + cr], fill=GOLD_RIM)
    # Face
    fr = int(cr * 0.87)
    draw.ellipse([ccx - fr, ccy - fr, ccx + fr, ccy + fr], fill=GOLD)
    # Inner detail ring
    ir = int(cr * 0.71)
    draw.ellipse(
        [ccx - ir, ccy - ir, ccx + ir, ccy + ir],
        outline=(215, 142, 0), width=max(2, int(cr * 0.062)),
    )

    # Upward arrow (white / navy depending on background)
    aw    = int(cr * 0.40)   # arrowhead half-width
    ah    = int(cr * 0.52)   # full arrow height
    sw    = int(aw * 0.42)   # shaft half-width
    tip_y = ccy - int(ah * 0.50)
    hb_y  = ccy - int(ah * 0.05)   # head base
    sb_y  = ccy + int(ah * 0.44)   # shaft bottom

    draw.rectangle([ccx - sw, hb_y, ccx + sw, sb_y], fill=coin_arrow)
    draw.polygon([(ccx, tip_y), (ccx - aw, hb_y), (ccx + aw, hb_y)], fill=coin_arrow)


# ══════════════════════════════════════════════════════════════════════════════
#  Icon generators
# ══════════════════════════════════════════════════════════════════════════════

def make_app_icon(size: int = 1024) -> Image.Image:
    """1024 × 1024 main icon — navy-to-blue gradient + white symbol."""
    img = Image.new("RGB", (size, size))
    vertical_gradient(img, NAVY, BLUE)
    draw = ImageDraw.Draw(img)
    draw_symbol(draw, size // 2, size // 2, int(size * 0.72))
    return img


def make_splash_icon(size: int = 1024) -> Image.Image:
    """Splash-screen icon — symbol in navy on a clean white background."""
    img = Image.new("RGB", (size, size), WHITE)
    draw = ImageDraw.Draw(img)
    draw_symbol(draw, size // 2, size // 2, int(size * 0.62), on_light_bg=True)
    return img


def make_adaptive_foreground(size: int = 512) -> Image.Image:
    """
    Android adaptive icon foreground — transparent background.
    Symbol stays within the inner 66 % safe zone.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_symbol(draw, size // 2, size // 2, int(size * 0.58))
    return img


def make_adaptive_background(size: int = 512) -> Image.Image:
    """Android adaptive icon background — navy gradient, no transparency."""
    img = Image.new("RGB", (size, size))
    vertical_gradient(img, NAVY, BLUE)
    return img.convert("RGBA")


def make_monochrome(size: int = 432) -> Image.Image:
    """
    Android monochrome adaptive icon — white symbol on transparent black.
    Used for themed / tinted icons on Android 13+.
    """
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s    = int(size * 0.72)
    cx, cy = size // 2, size // 2

    W  = (255, 255, 255, 255)
    G1 = (200, 200, 200, 255)
    G2 = (140, 140, 140, 255)

    doc_w  = int(s * 0.56)
    doc_h  = int(s * 0.68)
    doc_x0 = cx - doc_w // 2 - int(s * 0.04)
    doc_y0 = cy - doc_h // 2
    doc_x1 = doc_x0 + doc_w
    doc_y1 = doc_y0 + doc_h
    rad    = int(s * 0.055)
    hh     = int(doc_h * 0.195)

    draw.rounded_rectangle([doc_x0, doc_y0, doc_x1, doc_y1], radius=rad, fill=W)
    draw.rounded_rectangle([doc_x0, doc_y0, doc_x1, doc_y0 + hh], radius=rad, fill=G1)
    draw.rectangle([doc_x0, doc_y0 + hh - rad, doc_x1, doc_y0 + hh], fill=G1)

    ix0 = doc_x0 + int(doc_w * 0.10)
    ix1 = doc_x1 - int(doc_w * 0.10)
    ry0 = doc_y0 + hh + int(doc_h * 0.08)
    ry1 = doc_y1 - int(doc_h * 0.19)
    rh  = (ry1 - ry0) / 4

    for i in range(4):
        row_cy = int(ry0 + i * rh + rh * 0.50)
        bh     = max(4, int(rh * 0.26))
        dr     = int(rh * 0.22)
        dot_cx = ix1 - dr
        bar_x1 = dot_cx - dr * 2 - int(doc_w * 0.04)
        draw.rounded_rectangle([ix0, row_cy - bh, bar_x1, row_cy + bh], radius=bh, fill=G2)
        draw.ellipse([dot_cx - dr, row_cy - dr, dot_cx + dr, row_cy + dr], fill=G1)

    fy  = doc_y1 - int(doc_h * 0.095)
    tbh = max(3, int(doc_h * 0.075 * 0.40))
    draw.rounded_rectangle([ix0, fy - tbh, ix0 + int(doc_w * 0.44), fy + tbh],
                            radius=tbh, fill=G2)

    cr  = int(s * 0.215)
    ccx = doc_x1 + int(cr * 0.16)
    ccy = doc_y1 - int(cr * 0.22)
    draw.ellipse([ccx - cr, ccy - cr, ccx + cr, ccy + cr], fill=G1)
    fr  = int(cr * 0.87)
    draw.ellipse([ccx - fr, ccy - fr, ccx + fr, ccy + fr], fill=G2)
    ir  = int(cr * 0.71)
    draw.ellipse([ccx - ir, ccy - ir, ccx + ir, ccy + ir],
                 outline=W, width=max(2, int(cr * 0.062)))

    aw    = int(cr * 0.40)
    ah    = int(cr * 0.52)
    sw    = int(aw * 0.42)
    tip_y = ccy - int(ah * 0.50)
    hb_y  = ccy - int(ah * 0.05)
    sb_y  = ccy + int(ah * 0.44)
    draw.rectangle([ccx - sw, hb_y, ccx + sw, sb_y], fill=W)
    draw.polygon([(ccx, tip_y), (ccx - aw, hb_y), (ccx + aw, hb_y)], fill=W)

    return img


def make_favicon(size: int = 48) -> Image.Image:
    """32-/48-px favicon for the web build."""
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Navy rounded square background
    draw.rounded_rectangle([0, 0, size - 1, size - 1],
                            radius=int(size * 0.22), fill=(*NAVY, 255))
    s  = int(size * 0.76)
    cx, cy = size // 2, size // 2
    dw = int(s * 0.46)
    dh = int(s * 0.56)
    dx0 = cx - dw // 2 - int(s * 0.03)
    dy0 = cy - dh // 2
    dx1 = dx0 + dw
    dy1 = dy0 + dh
    r2  = max(2, int(s * 0.06))
    draw.rounded_rectangle([dx0, dy0, dx1, dy1], radius=r2, fill=(255, 255, 255, 255))
    hh2 = int(dh * 0.22)
    draw.rounded_rectangle([dx0, dy0, dx1, dy0 + hh2], radius=r2, fill=(*GOLD, 255))
    draw.rectangle([dx0, dy0 + hh2 - r2, dx1, dy0 + hh2], fill=(*GOLD, 255))
    # Minimal coin dot
    cr2  = int(s * 0.18)
    ccx2 = dx1 + int(cr2 * 0.10)
    ccy2 = dy1 - int(cr2 * 0.18)
    draw.ellipse([ccx2 - cr2, ccy2 - cr2, ccx2 + cr2, ccy2 + cr2], fill=(*GOLD, 255))
    return img


# ══════════════════════════════════════════════════════════════════════════════
#  Entry point
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    tasks = [
        ("icon.png",                     make_app_icon,           {"size": 1024}),
        ("splash-icon.png",              make_splash_icon,        {"size": 1024}),
        ("favicon.png",                  make_favicon,            {"size": 48}),
        ("android-icon-foreground.png",  make_adaptive_foreground,{"size": 512}),
        ("android-icon-background.png",  make_adaptive_background,{"size": 512}),
        ("android-icon-monochrome.png",  make_monochrome,         {"size": 432}),
    ]

    for filename, fn, kwargs in tasks:
        path = os.path.join(OUTPUT_DIR, filename)
        img  = fn(**kwargs)
        img.save(path, "PNG", optimize=True)
        print(f"✓  {filename:40s}  {img.size}  {img.mode}")

    # Remove leftover default Expo sample images if present
    for obsolete in ("react-logo.png", "react-logo@2x.png",
                     "react-logo@3x.png", "partial-react-logo.png"):
        p = os.path.join(OUTPUT_DIR, obsolete)
        if os.path.exists(p):
            os.remove(p)
            print(f"✗  removed {obsolete}")

    print("\nAll icons generated successfully!")


if __name__ == "__main__":
    main()

