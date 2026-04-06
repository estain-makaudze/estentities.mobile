"""
Generate all app icons for family_expenses.
Design: deep-blue gradient background · white house · gold coin with $
"""
from PIL import Image, ImageDraw, ImageFont
import os, math

ASSETS = os.path.join(os.path.dirname(__file__), "assets", "images")

# ── colour palette ────────────────────────────────────────────────────────────
BG_TOP    = (18,  80, 160)   # deep navy-blue
BG_BOT    = (66, 148, 222)   # sky blue
WHITE     = (255, 255, 255, 255)
WIN_BLUE  = (160, 210, 255, 255)   # window glass
DOOR_COL  = (180, 230, 255, 255)
COIN_RING = (210, 150,   5, 255)
COIN_FACE = (255, 195,  25, 255)
COIN_SYM  = (140,  90,   0, 255)

# ── helpers ───────────────────────────────────────────────────────────────────

def lerp(a, b, t):
    return int(a + (b - a) * t)

def make_gradient(size, c1=BG_TOP, c2=BG_BOT):
    """Diagonal (top-left → bottom-right) gradient, fast via 2×2 scale."""
    tiny = Image.new("RGBA", (2, 2))
    mid  = (lerp(c1[0],c2[0],.5), lerp(c1[1],c2[1],.5), lerp(c1[2],c2[2],.5), 255)
    tiny.putdata([(*c1,255), mid, mid, (*c2,255)])
    return tiny.resize((size, size), Image.BILINEAR)

def apply_rounded_corners(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, img.width-1, img.height-1], radius=radius, fill=255
    )
    out = img.copy().convert("RGBA")
    out.putalpha(mask)
    return out

def find_bold_font(size):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

# ── core drawing ──────────────────────────────────────────────────────────────

def draw_house_layer(size, house_col=WHITE, win_col=WIN_BLUE, door_col=DOOR_COL):
    """
    Returns an RGBA canvas (transparent background) with:
      - a house (roof + body + chimney + windows + door)
      - a gold coin bottom-right
    All coordinates are proportional so it scales to any square size.
    """
    s  = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)

    cx = s // 2
    # ── house geometry ────────────────────────────────────────────────────────
    body_w      = int(s * 0.52)
    body_h      = int(s * 0.30)
    house_bot   = int(s * 0.74)
    body_top    = house_bot - body_h
    body_left   = cx - body_w // 2
    body_right  = cx + body_w // 2

    roof_half_w = int(s * 0.36)
    roof_top_y  = int(s * 0.20)

    # body
    d.rectangle([body_left, body_top, body_right, house_bot], fill=house_col)

    # roof triangle
    d.polygon([
        (cx, roof_top_y),
        (cx - roof_half_w, body_top),
        (cx + roof_half_w, body_top),
    ], fill=house_col)

    # chimney
    ch_w  = int(s * 0.06)
    ch_x  = cx + int(s * 0.14)
    ch_y1 = roof_top_y + int(s * 0.07)
    ch_y2 = body_top + 2
    d.rectangle([ch_x, ch_y1, ch_x + ch_w, ch_y2], fill=house_col)

    # ── door ─────────────────────────────────────────────────────────────────
    door_w = int(s * 0.11)
    door_h = int(s * 0.17)
    door_x = cx - door_w // 2
    door_y = house_bot - door_h
    # rounded top
    d.rectangle([door_x, door_y + door_w//2, door_x + door_w, house_bot], fill=door_col)
    d.ellipse([door_x, door_y, door_x + door_w, door_y + door_w], fill=door_col)

    # ── windows ──────────────────────────────────────────────────────────────
    win_s  = int(s * 0.09)
    win_y  = body_top + int(s * 0.05)
    gap    = int(s * 0.06)
    for wx in [body_left + gap, body_right - gap - win_s]:
        # window frame (house colour)
        frame = 3
        d.rectangle([wx-frame, win_y-frame, wx+win_s+frame, win_y+win_s+frame], fill=house_col)
        # glass
        d.rectangle([wx, win_y, wx+win_s, win_y+win_s], fill=win_col)
        # cross bars
        mid_x = wx + win_s // 2
        mid_y = win_y + win_s // 2
        d.rectangle([mid_x-1, win_y, mid_x+1, win_y+win_s], fill=house_col)
        d.rectangle([wx, mid_y-1, wx+win_s, mid_y+1],       fill=house_col)

    # ── gold coin ────────────────────────────────────────────────────────────
    coin_cx = cx + int(s * 0.22)
    coin_cy = house_bot - int(s * 0.10)
    coin_r  = int(s * 0.13)

    # ring shadow
    shadow_off = max(2, coin_r // 12)
    d.ellipse([
        coin_cx - coin_r + shadow_off, coin_cy - coin_r + shadow_off,
        coin_cx + coin_r + shadow_off, coin_cy + coin_r + shadow_off,
    ], fill=(0, 0, 0, 60))

    # outer ring
    d.ellipse([coin_cx-coin_r, coin_cy-coin_r, coin_cx+coin_r, coin_cy+coin_r],
              fill=COIN_RING)
    # inner face
    ir = int(coin_r * 0.80)
    d.ellipse([coin_cx-ir, coin_cy-ir, coin_cx+ir, coin_cy+ir], fill=COIN_FACE)

    # "$" symbol
    font_size = int(ir * 1.15)
    font = find_bold_font(font_size)
    bb   = d.textbbox((0, 0), "$", font=font)
    tw, th = bb[2]-bb[0], bb[3]-bb[1]
    d.text(
        (coin_cx - tw//2 - bb[0], coin_cy - th//2 - bb[1]),
        "$", font=font, fill=COIN_SYM
    )

    return img


def build_icon(size, rounded=False):
    bg    = make_gradient(size)
    house = draw_house_layer(size)
    out   = bg.copy()
    out.paste(house, (0, 0), house)
    if rounded:
        out = apply_rounded_corners(out, radius=int(size * 0.22))
    return out


# ── generate every asset ─────────────────────────────────────────────────────

def save(img, name):
    path = os.path.join(ASSETS, name)
    img.save(path)
    print(f"  ✓  {name}  ({img.width}×{img.height})")

print("\n🎨  Generating icons …\n")

# 1. icon.png  (1024 × 1024)  — flat square; iOS/Android round the corners
save(build_icon(1024), "icon.png")

# 2. Android adaptive foreground (transparent bg, content inside central 66%)
save(draw_house_layer(1024), "android-icon-foreground.png")

# 3. Android adaptive background (gradient only)
save(make_gradient(1024), "android-icon-background.png")

# 4. Android monochrome (white silhouette on transparent)
save(draw_house_layer(1024,
     house_col=(255,255,255,255),
     win_col=(255,255,255,180),
     door_col=(255,255,255,180)),
     "android-icon-monochrome.png")

# 5. Splash icon  (512 × 512  — Expo expects a centred icon on white)
splash = Image.new("RGBA", (512, 512), (255, 255, 255, 255))
icon_sm = build_icon(300)
offset  = (512 - 300) // 2
splash.paste(icon_sm, (offset, offset), icon_sm)
save(splash, "splash-icon.png")

# 6. Favicon  (64 × 64  — rounded for web)
save(build_icon(64, rounded=True), "favicon.png")

print("\n✅  All icons saved to", ASSETS, "\n")

