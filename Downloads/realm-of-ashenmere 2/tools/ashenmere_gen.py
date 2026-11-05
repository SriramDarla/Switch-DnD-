#!/usr/bin/env python3
"""
Realm map generator: procedural pixel-art fantasy battle maps
(terrain, roads, forests, castle/villages/tower/camp/ruins, labels, 5ft grid, fog edges).

    pip install numpy pillow          (tkinter ships with Python; on Debian/Ubuntu: sudo apt install python3-tk)

    python ashenmere_gen.py                          # opens the GUI with a "Generate New Map" button
    python ashenmere_gen.py --out map.png            # headless: random map straight to a PNG
    python ashenmere_gen.py --out map.png --seed 7   # reproducible
"""
import argparse
import math
import queue
import random
import threading
import zlib

import numpy as np
from PIL import Image, ImageDraw, ImageFont

TILE = 16          # world pixels per grid square (1 square = 5 ft)
SEA = 0.445        # water / shore threshold
FOG_CELL = 8       # fog cell size in world pixels
FOG_THICK = 26     # fog thickness in cells
LABEL_DY = {"castle": -68, "tower": -66, "village": -26, "camp": -22, "ruins": -30}
SIZES = {"Small": 64, "Medium": 96, "Large": 128}   # tiles per side


# --------------------------------------------------------------------------- noise
def make_noise(rng, n=128):
    """Tileable value noise; accepts numpy arrays of coordinates."""
    g = rng.random((n, n), dtype=np.float32)

    def f(x, y):
        xi = np.floor(x).astype(np.int32)
        yi = np.floor(y).astype(np.int32)
        u = x - xi
        w = y - yi
        u = u * u * (3 - 2 * u)
        w = w * w * (3 - 2 * w)
        x0, x1, y0, y1 = xi % n, (xi + 1) % n, yi % n, (yi + 1) % n
        return (g[y0, x0] * (1 - u) + g[y0, x1] * u) * (1 - w) + (g[y1, x0] * (1 - u) + g[y1, x1] * u) * w

    return f


def hash2(x, y, seed):
    """Fast integer hash -> float in [0, 1). Vectorised."""
    x = np.asarray(x).astype(np.uint32)
    y = np.asarray(y).astype(np.uint32)
    h = (x * np.uint32(374761393) + y * np.uint32(668265263)) ^ np.uint32(seed & 0xFFFFFFFF)
    h = (h ^ (h >> np.uint32(13))) * np.uint32(1274126177)
    h = h ^ (h >> np.uint32(16))
    return h.astype(np.float32) / np.float32(4294967296.0)


def pick(pal, v):
    pal = np.asarray(pal, np.uint8)
    idx = np.clip(np.floor(v * len(pal)).astype(np.int32), 0, len(pal) - 1)
    return pal[idx]


# --------------------------------------------------------------------------- palettes
DEEP = [(22, 52, 94), (26, 62, 110)]
MID = [(36, 90, 154), (44, 104, 171), (56, 118, 184)]
SHAL = [(76, 143, 192), (94, 160, 205)]
WAVE, FOAM, FOAM2 = (120, 180, 220), (205, 230, 245), (240, 250, 255)
WET = [(168, 148, 98), (182, 162, 110)]
SAND = [(201, 179, 120), (216, 196, 138), (228, 211, 157)]
GRASS = [(48, 98, 42), (60, 118, 48), (74, 138, 56), (90, 156, 66)]
FOREST = [(34, 76, 36), (44, 92, 42), (56, 108, 50)]
TUFT = (130, 190, 90)
HILL = [(100, 102, 64), (112, 120, 70), (128, 126, 82), (146, 138, 96)]
ROCK = [(70, 70, 82), (88, 88, 100), (108, 108, 120), (132, 132, 144), (152, 152, 164)]
SNOW = [(190, 202, 222), (222, 232, 244), (246, 250, 253)]

# --------------------------------------------------------------------------- names
PREFIX = ["Oak", "Ash", "Brin", "Mar", "Raven", "Stone", "Iron", "Wolf", "Elder", "Thorn", "Frost", "Gloom",
          "Black", "Silver", "Amber", "Crow", "Mist", "Dun", "Wyr", "Hazel", "Cinder", "Grey", "Willow", "Ember"]
VILLAGE_SUFFIX = ["hollow", "wick", "fen", "ford", "brook", "stead", "haven", "mere", "combe", "wood", "dale", "bury"]
REALM_SUFFIX = ["mere", "mark", "reach", "vale", "moor", "fall", "gard", "land", "shire"]
TOWER_NAMES = ["Aldric", "Morwen", "Veyra", "Orlan", "Kestrel", "Thessaly", "Dorian", "Isolde", "Caedmon", "Elowen"]
CAMPS = ["Smugglers Camp", "Bandit Camp", "Outlaw Camp", "Ranger Camp", "Raiders' Camp", "Poachers Camp"]
RUINS = ["The Old Ruins", "The Fallen Hold", "The Sunken Keep", "The Broken Spire", "The Hollow Abbey", "The Forgotten Fort"]


class MapData:
    def __init__(self, seed, tiles, title, base, pois):
        self.seed, self.tiles, self.title, self.base, self.pois = seed, tiles, title, base, pois
        self.size = base.width


# --------------------------------------------------------------------------- generation
def generate_map(seed, tiles=96):
    S = tiles * TILE
    rnd = random.Random(seed)
    nprng = np.random.default_rng(seed)
    n1, n2, n3 = make_noise(nprng), make_noise(nprng), make_noise(nprng)

    # per-map variety: how much land, how forested
    land_bias = rnd.uniform(0.03, 0.09)
    forest_thr = rnd.uniform(0.50, 0.62)

    yy, xx = np.mgrid[0:S, 0:S]
    x = xx.astype(np.float32)
    y = yy.astype(np.float32)

    # ---- height map
    h = (.5 * n1(x / 380, y / 380) + .3 * n1(x / 150 + 20, y / 150 + 20)
         + .15 * n1(x / 50 + 50, y / 50 + 50) + .05 * n3(x / 16, y / 16))
    h = (h - .5) * 2.2 + .5
    h = h + land_bias * np.clip((.62 - h) * 10, 0, 1)                      # more land, without inflating mountains
    ridge = 1 - np.abs(2 * n2(x / 45, y / 45) - 1)
    h = np.where(h > .6, h + (h - .6) * .35 * ridge, h)                      # ridged mountains
    e = np.minimum(np.minimum(xx, yy), np.minimum(S - 1 - xx, S - 1 - yy)) / (S * .2)
    h = np.where(e < 1, h - .3 * (1 - e) ** 2, h).astype(np.float32)        # sea toward the edges

    # ---- terrain colouring
    d = hash2(xx, yy, seed)
    hp = np.pad(h, 1, mode="edge")
    sl = hp[1:-1, :-2] - hp[1:-1, 2:] + hp[:-2, 1:-1] - hp[2:, 1:-1]        # NW light
    sh = np.clip(np.round(sl * 110), -2, 2)
    q = h + (d - .5) * .016
    mo = n3(x / 9, y / 9)
    forest_noise = n2(x / 120 + 5, y / 120 + 5)

    out = np.zeros((S, S, 3), np.uint8)

    def paint(mask, pal, v):
        out[mask] = pick(pal, v[mask])

    v = mo * .6 + d * .4
    water = q < SEA
    paint(q < .30, DEEP, v)
    paint((q >= .30) & (q < .40), MID, v)
    paint((q >= .40) & water, SHAL, v)
    wave = water & (((yy + (n3(x / 25, y / 25) * 8).astype(np.int32)) % 9) == 0) & (hash2(xx >> 1, yy, seed) > .5)
    out[wave] = WAVE
    out[water & (q > .432) & (d > .5)] = FOAM
    out[water & (q > .44)] = FOAM2

    shore = (q >= SEA) & (q < .475)
    paint(shore & (q < .455), WET, v)
    paint(shore & (q >= .455), SAND, v)

    grass = (q >= .475) & (q < .64)
    fo = forest_noise > forest_thr
    vg = np.clip(mo * .6 + d * .3 + sh * .06 + .05, 0, .99)
    paint(grass & fo, FOREST, vg)
    paint(grass & ~fo, GRASS, vg)
    out[grass & (d > .99)] = TUFT

    hill = (q >= .64) & (q < .74)
    paint(hill, HILL, mo * .6 + d * .3 + (sh + 2) * .05)
    rock = (q >= .74) & (q < .84)
    paint(rock, ROCK, np.clip((sh + 2) / 4 * .8 + d * .2, 0, .99))
    snow = q >= .84
    paint(snow, SNOW, np.where(sh < 0, .1, np.where(sh > 0, .9, .5)).astype(np.float32))

    # ---- points of interest
    def find_land(tx, ty):
        for rad in range(0, 500, 8):
            for k in range(14):
                a = k / 14 * 6.283
                px, py = int(tx + math.cos(a) * rad), int(ty + math.sin(a) * rad)
                if 60 <= px < S - 60 and 60 <= py < S - 60 and .5 < h[py, px] < .6:
                    return px, py
        return int(tx), int(ty)

    used_names = set()

    def village_name():
        for _ in range(50):
            nm = rnd.choice(PREFIX) + rnd.choice(VILLAGE_SUFFIX)
            if nm not in used_names:
                used_names.add(nm)
                return nm
        return nm

    realm = rnd.choice(PREFIX) + rnd.choice(REALM_SUFFIX)
    used_names.add(realm)
    cx, cy = find_land(S * .5 + rnd.uniform(-.06, .06) * S, S * .5 + rnd.uniform(-.06, .06) * S)
    pois = [{"k": "castle", "n": "Castle " + realm, "x": cx, "y": cy}]

    kinds = ["village"] * 3 + ["tower", "camp", "ruins"]
    rnd.shuffle(kinds)
    base_ang = rnd.uniform(0, math.tau)
    for i, kind in enumerate(kinds):
        for attempt in range(12):
            ang = base_ang + i * math.tau / 6 + rnd.uniform(-.35, .35)
            rad = S * rnd.uniform(.18, .31)
            px, py = find_land(S * .5 + math.cos(ang) * rad, S * .5 + math.sin(ang) * rad)
            if all(math.hypot(px - o["x"], py - o["y"]) > 110 for o in pois):
                break
        name = {"village": village_name,
                "tower": lambda: "Spire of " + rnd.choice(TOWER_NAMES),
                "camp": lambda: rnd.choice(CAMPS),
                "ruins": lambda: rnd.choice(RUINS)}[kind]()
        pois.append({"k": kind, "n": name, "x": px, "y": py})

    # ---- roads (planks where they cross water)
    mask = np.zeros((S, S), bool)

    def stamp(px, py, rad):
        x0, x1, y0, y1 = max(0, px - rad), min(S, px + rad + 1), max(0, py - rad), min(S, py + rad + 1)
        gy, gx = np.ogrid[y0:y1, x0:x1]
        mask[y0:y1, x0:x1] |= (gx - px) ** 2 + (gy - py) ** 2 <= rad * rad

    def road(a, b):
        m = ((a["x"] + b["x"]) / 2 + rnd.uniform(-40, 40), (a["y"] + b["y"]) / 2 + rnd.uniform(-40, 40))
        pts = []
        for (px, py), (qx, qy) in [((a["x"], a["y"]), m), (m, (b["x"], b["y"]))]:
            n = math.hypot(qx - px, qy - py)
            for s in np.arange(0, n + 1e-6, 2):
                pts.append((px + (qx - px) * s / n + math.sin(s / 9) * 2, py + (qy - py) * s / n + math.cos(s / 11) * 2))
        P = np.array(pts)
        for w, rad in ((0, 3.6), (1, 2.5)):
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    if dx * dx + dy * dy > rad * rad:
                        continue
                    px = np.clip((P[:, 0] + dx).astype(np.int32), 0, S - 1)
                    py = np.clip((P[:, 1] + dy).astype(np.int32), 0, S - 1)
                    wat = (h[py, px] < SEA)[:, None]
                    if w == 0:
                        col = np.where(wat, (58, 38, 20), (124, 98, 62))
                    else:
                        plank = np.where((((px + py) >> 2) & 1)[:, None] == 1, (138, 106, 60), (122, 90, 48))
                        dirt = np.where((hash2(px, py, seed) > .8)[:, None], (176, 150, 106), (160, 133, 96))
                        col = np.where(wat, plank, dirt)
                    out[py, px] = col
        for px, py in P:
            stamp(int(px), int(py), 6)

    castle = pois[0]
    villages = [p for p in pois if p["k"] == "village"]
    for v_ in villages:
        road(castle, v_)
    for p in pois:
        if p["k"] == "ruins":
            road(castle, p)
        elif p["k"] in ("tower", "camp"):
            road(min(villages, key=lambda o: math.hypot(o["x"] - p["x"], o["y"] - p["y"])), p)
    for p in pois:
        stamp(p["x"], p["y"], 46 if p["k"] == "castle" else 30)

    # ---- trees, boulders, flowers (placement)
    objs = []   # (y, kind, x)   kind: 0 tree, 1 pine, 2 boulder
    for gy in range(8, S - 8, 13):
        for gx in range(8, S - 8, 13):
            px, py = gx + rnd.randrange(11), gy + rnd.randrange(11)
            hv = h[py, px]
            if hv < .485 or hv > .70 or mask[py, px]:
                continue
            f = forest_noise[py, px]
            p = .9 if f > forest_thr else .08 + .25 * n3(px / 30, py / 30)
            if rnd.random() < p:
                objs.append((py, 1 if (hv > .6 or (f > forest_thr and rnd.random() < .35)) else 0, px))
    for gy in range(12, S - 12, 24):
        for gx in range(12, S - 12, 24):
            px, py = gx + rnd.randrange(20), gy + rnd.randrange(20)
            if .6 < h[py, px] < .8 and not mask[py, px] and rnd.random() < .25:
                objs.append((py, 2, px))
    flower_cols = [(244, 211, 94), (238, 108, 77), (255, 255, 255), (199, 125, 255)]
    n_flowers = int(1000 * (S / 1536) ** 2)
    for k in range(n_flowers):
        px, py = rnd.randrange(S), rnd.randrange(S - 1)
        if .5 < h[py, px] < .62 and not mask[py, px]:
            out[py, px] = flower_cols[k & 3]
            out[py + 1, px] = (47, 107, 45)

    # ---- sprites (drawn y-sorted onto the terrain)
    img = Image.fromarray(out, "RGB")
    dr = ImageDraw.Draw(img, "RGBA")

    def rect(x, y, w, hh, c):
        dr.rectangle([int(x), int(y), int(x) + int(w) - 1, int(y) + int(hh) - 1], fill=c)

    def disc(x, y, r, c):
        for dy in range(-r, r + 1):
            w = int(math.sqrt(r * r - dy * dy + .5))
            rect(x - w, y + dy, 2 * w + 1, 1, c)

    def shadow(x, y, w):
        rect(x - w / 2, y - 1, w, 3, (0, 0, 0, 71))

    def tree(x, y):
        shadow(x, y, 12); rect(x - 1, y - 6, 3, 6, "#4a2f1a")
        disc(x, y - 10, 6, "#1f4a22"); disc(x, y - 10, 5, "#2f6b2d"); disc(x - 1, y - 11, 3, "#3f8a39")
        rect(x - 3, y - 13, 2, 1, "#7bc25a"); rect(x + 2, y - 8, 2, 1, "#255a27")

    def pine(x, y):
        shadow(x, y, 10); rect(x, y - 3, 1, 3, "#4a2f1a")
        for k in range(3):
            for rr in range(6):
                w, yy_ = rr + 1 + k, y - 17 + k * 4 + rr
                rect(x - w, yy_, w + 1, 1, "#2d6a3a"); rect(x + 1, yy_, w, 1, "#1f4d2b")

    def boulder(x, y):
        shadow(x, y, 9); disc(x, y - 3, 3, "#55555f"); disc(x - 1, y - 4, 2, "#8a8a96"); rect(x - 2, y - 6, 2, 1, "#b4b4c0")

    def house(x, y, roof):
        shadow(x + 10, y + 9, 24); rect(x, y, 18, 10, "#d9c9a0"); rect(x + 11, y, 7, 10, "#bfae84")
        for rr in range(8):
            hw = int(math.floor(rr * 1.4 + 3 + .5))
            rect(x + 9 - hw, y - 8 + rr, 2 * hw, 1, roof[0] if rr % 2 else roof[1])
        rect(x + 7, y + 4, 4, 6, "#5a3a1e"); rect(x + 2, y + 3, 3, 3, "#f4d35e"); rect(x + 13, y + 3, 3, 3, "#e0b84a")

    def tower(x, y, ht):
        shadow(x, y + 1, 22); rect(x - 7, y - ht, 14, ht, "#9a9aa8"); rect(x, y - ht, 7, ht, "#83838f")
        for rr in range(0, ht, 4):
            rect(x - 7, y - ht + rr, 14, 1, (0, 0, 0, 31))
        for k in range(3):
            rect(x - 7 + k * 5, y - ht - 3, 4, 3, "#9a9aa8")
        for rr in range(10):
            hw = rr + 1
            rect(x - hw, y - ht - 13 + rr, 2 * hw + 1, 1, "#3b5a9a" if rr % 2 else "#4a6fb5")
        rect(x - 1, y - ht + 8, 3, 5, "#f4d35e")

    def castle_(x, y):
        shadow(x, y + 1, 76)
        rect(x - 30, y - 16, 60, 16, "#8d8d99"); rect(x - 30, y - 16, 60, 2, "#a9a9b6")
        for i in range(10):
            rect(x - 30 + i * 6, y - 20, 4, 4, "#8d8d99")
        rect(x - 16, y - 34, 32, 34, "#9d9dab"); rect(x, y - 34, 16, 34, "#878795")
        for rr in range(0, 34, 4):
            rect(x - 16, y - 34 + rr, 32, 1, (0, 0, 0, 31))
        for i in range(6):
            rect(x - 16 + i * 6, y - 39, 4, 5, "#9d9dab")
        rect(x - 5, y - 16, 10, 16, "#2a2420"); disc(x, y - 16, 5, "#2a2420")
        rect(x - 9, y - 28, 3, 5, "#f4d35e"); rect(x + 6, y - 28, 3, 5, "#f4d35e")
        rect(x, y - 60, 1, 22, "#3a3a3a"); rect(x + 1, y - 60, 11, 6, "#c0392b"); rect(x + 1, y - 56, 11, 1, "#8e2a1f")
        tower(x - 32, y + 2, 34); tower(x + 32, y + 2, 34)

    def tent(x, y, c):
        for rr in range(10):
            rect(x - rr, y - 10 + rr, 2 * rr + 1, 1, c if rr % 2 else "#c76a52")
        rect(x - 1, y - 3, 3, 3, "#2a1a10")

    def camp(x, y):
        shadow(x, y + 2, 40); tent(x - 14, y, "#b5523b"); tent(x + 14, y + 2, "#7a8a4a")
        for k in range(6):
            disc(x + int(math.cos(k) * 4), y + 3 + int(math.sin(k) * 2), 1, "#6a6a72")
        rect(x - 1, y - 2, 3, 4, "#e8742a"); rect(x, y - 4, 1, 3, "#f4d35e")

    def ruins(x, y):
        shadow(x, y + 2, 50)
        for dx, ht in [(-14, 18), (-4, 10), (6, 24), (16, 8)]:
            rect(x + dx - 3, y - ht, 6, ht, "#9a9aa8"); rect(x + dx, y - ht, 3, ht, "#83838f"); rect(x + dx - 3, y - ht - 2, 6, 2, "#b4b4c0")
        rect(x - 18, y - 3, 36, 3, "#7c7c88"); boulder(x + 22, y + 2); boulder(x - 24, y + 3)

    sprite_fns = [tree, pine, boulder]
    items = [(py, (lambda kk=kk, px=px, py=py: sprite_fns[kk](px, py))) for py, kk, px in objs]
    for p in pois:
        fn = {"castle": lambda p=p: castle_(p["x"], p["y"]),
              "village": lambda p=p: (house(p["x"] - 24, p["y"] - 6, ["#a8452f", "#bf5a3f"]),
                                      house(p["x"] + 4, p["y"] - 10, ["#3b5a9a", "#4a6fb5"]),
                                      house(p["x"] - 8, p["y"] + 10, ["#a8452f", "#bf5a3f"])),
              "tower": lambda p=p: tower(p["x"], p["y"], 44),
              "camp": lambda p=p: camp(p["x"], p["y"]),
              "ruins": lambda p=p: ruins(p["x"], p["y"])}[p["k"]]
        items.append((p["y"], fn))
    for _, fn in sorted(items, key=lambda t: t[0]):
        fn()

    return MapData(seed, tiles, realm, img, pois)


# --------------------------------------------------------------------------- presentation
def load_font(size):
    for name in ("georgiai.ttf", "Georgia Italic.ttf", "/System/Library/Fonts/Supplemental/Georgia Italic.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf", "DejaVuSerif-Italic.ttf", "DejaVuSerif.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()


def fog_overlay(S, zoom, seed):
    FN = S // FOG_CELL
    gy, gx = np.mgrid[0:FN, 0:FN]
    m = np.minimum(np.minimum(gy, FN - 1 - gx), np.minimum(FN - 1 - gy, gx))
    a = np.clip((FOG_THICK - m) / 9 + (hash2(gx + 99, gy, seed) - .5) * .3, 0, 1)
    a = np.where(m < FOG_THICK, np.round(a * 5) / 5, 0)
    var = hash2(gx, gy, seed) > .88
    rgba = np.zeros((FN, FN, 4), np.uint8)
    rgba[..., :3] = np.where(var[..., None], (58, 42, 28), (24, 17, 12))
    rgba[..., 3] = (a * .96 * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA").resize((S * zoom, S * zoom), Image.NEAREST)


def compose(data, zoom=2, grid=True, fog=True, labels=True):
    """Upscale the base map and add grid, labels and fog at display resolution."""
    S = data.size
    W = S * zoom
    img = data.base.resize((W, W), Image.NEAREST).convert("RGBA")
    layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if grid:
        step = TILE * zoom
        for v in range(0, W, step):
            d.line([(v, 0), (v, W)], fill=(30, 20, 10, 56), width=1)
            d.line([(0, v), (W, v)], fill=(30, 20, 10, 56), width=1)
    if labels:
        font = load_font(7 * zoom + 2)
        for p in data.pois:
            d.text((p["x"] * zoom, (p["y"] + LABEL_DY[p["k"]]) * zoom), p["n"], font=font, anchor="mm",
                   fill=(43, 26, 14, 255), stroke_width=2, stroke_fill=(240, 226, 184, 235))
    img = Image.alpha_composite(img, layer)
    if fog:
        img = Image.alpha_composite(img, fog_overlay(S, zoom, data.seed))
    return img


# --------------------------------------------------------------------------- GUI
def seed_from_text(text):
    text = text.strip()
    if not text:
        return random.randrange(1, 10_000_000)
    return int(text) if text.isdigit() else zlib.crc32(text.encode())


def run_gui(zoom=2):
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    from PIL import ImageTk

    root = tk.Tk()
    root.title("Realm Map Generator")
    root.geometry("1200x800")

    st = {"data": None, "photo": None, "img": None, "busy": False, "q": queue.Queue()}
    seed_var, size_var = tk.StringVar(), tk.StringVar(value="Medium")
    grid_var, fog_var, label_var = tk.BooleanVar(value=True), tk.BooleanVar(value=True), tk.BooleanVar(value=True)
    status = tk.StringVar(value="Click “Generate New Map”")

    bar = ttk.Frame(root, padding=6)
    bar.pack(fill="x")
    gen_btn = ttk.Button(bar, text="Generate New Map")
    gen_btn.pack(side="left")
    ttk.Label(bar, text="  Seed:").pack(side="left")
    ttk.Entry(bar, textvariable=seed_var, width=12).pack(side="left")
    ttk.Label(bar, text="  Size:").pack(side="left")
    ttk.OptionMenu(bar, size_var, "Medium", *SIZES).pack(side="left")
    for text, var in (("Grid", grid_var), ("Fog", fog_var), ("Labels", label_var)):
        ttk.Checkbutton(bar, text=text, variable=var, command=lambda: refresh(keep_view=True)).pack(side="left", padx=4)
    save_btn = ttk.Button(bar, text="Save PNG…")
    save_btn.pack(side="left", padx=6)
    ttk.Label(bar, textvariable=status).pack(side="left", padx=8)

    cv = tk.Canvas(root, bg="#1b110a", highlightthickness=0, cursor="fleur")
    cv.pack(fill="both", expand=True)
    cv.bind("<ButtonPress-1>", lambda e: cv.scan_mark(e.x, e.y))
    cv.bind("<B1-Motion>", lambda e: cv.scan_dragto(e.x, e.y, gain=1))

    def refresh(keep_view=False, center=False):
        data = st["data"]
        if not data:
            return
        xv, yv = cv.xview()[0], cv.yview()[0]
        img = compose(data, zoom, grid_var.get(), fog_var.get(), label_var.get())
        st["img"] = img
        st["photo"] = ImageTk.PhotoImage(img)
        cv.delete("all")
        cv.create_image(0, 0, image=st["photo"], anchor="nw")
        cv.config(scrollregion=(0, 0, img.width, img.height))
        root.update_idletasks()
        if center:
            c = data.pois[0]
            cv.xview_moveto(max(0, (c["x"] * zoom - cv.winfo_width() / 2) / img.width))
            cv.yview_moveto(max(0, (c["y"] * zoom - cv.winfo_height() / 2) / img.height))
        elif keep_view:
            cv.xview_moveto(xv)
            cv.yview_moveto(yv)

    def poll():
        try:
            kind, payload = st["q"].get_nowait()
        except queue.Empty:
            root.after(80, poll)
            return
        st["busy"] = False
        gen_btn.state(["!disabled"])
        if kind == "err":
            status.set("Generation failed")
            messagebox.showerror("Error", payload)
            return
        st["data"] = payload
        root.title(f"{payload.title} - Realm Map Generator")
        status.set(f"{payload.title}  |  seed {payload.seed}")
        refresh(center=True)

    def generate(_=None):
        if st["busy"]:
            return
        seed, tiles = seed_from_text(seed_var.get()), SIZES[size_var.get()]
        st["busy"] = True
        gen_btn.state(["disabled"])
        status.set("Forging the realm…")

        def work():
            try:
                st["q"].put(("ok", generate_map(seed, tiles)))
            except Exception as ex:  # noqa: BLE001
                st["q"].put(("err", repr(ex)))

        threading.Thread(target=work, daemon=True).start()
        root.after(80, poll)

    def save():
        if not st["img"]:
            return
        path = filedialog.asksaveasfilename(defaultextension=".png", filetypes=[("PNG image", "*.png")],
                                            initialfile=f"{st['data'].title.lower()}_{st['data'].seed}.png")
        if path:
            st["img"].convert("RGB").save(path)
            status.set(f"Saved {path}")

    gen_btn.config(command=generate)
    save_btn.config(command=save)
    root.bind("<Control-g>", generate)
    root.bind("<Control-s>", lambda e: save())
    root.after(200, generate)       # generate one on startup
    root.mainloop()


# --------------------------------------------------------------------------- entry point
def main():
    ap = argparse.ArgumentParser(description="Random pixel-art fantasy map generator")
    ap.add_argument("--out", help="write a PNG instead of opening the GUI")
    ap.add_argument("--seed", help="integer or any text; random if omitted")
    ap.add_argument("--size", choices=[k.lower() for k in SIZES], default="medium")
    ap.add_argument("--zoom", type=int, default=2, help="integer pixel scale (default 2)")
    ap.add_argument("--no-grid", action="store_true")
    ap.add_argument("--no-fog", action="store_true")
    ap.add_argument("--no-labels", action="store_true")
    a = ap.parse_args()

    if a.out:
        seed = seed_from_text(a.seed or "")
        data = generate_map(seed, SIZES[a.size.capitalize()])
        compose(data, a.zoom, not a.no_grid, not a.no_fog, not a.no_labels).convert("RGB").save(a.out)
        print(f"{data.title} (seed {seed}) -> {a.out}")
        for p in data.pois:
            print(f"  {p['k']:8} {p['n']}  @ ({p['x']}, {p['y']})")
    else:
        run_gui(a.zoom)


if __name__ == "__main__":
    main()
