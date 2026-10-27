#!/usr/bin/env python3
"""敵キャラのシート(assets/source/enemies-sheet.jpg)から、1体ずつ背景を抜いた画像を作る。

出力: assets/enemies/*.png (透明背景)
使い方: pip install numpy pillow scipy  →  python3 tools/build_enemies.py
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "source", "enemies-sheet.jpg")
OUT = os.path.join(ROOT, "assets", "enemies")

# シート上の枠線のあいだ(x0, y0, x1, y1)。行ごと・列ごと
XS = [(0, 322), (331, 658), (667, 942), (951, 1255)]
YS = [(0, 322), (331, 650), (659, 977)]
# (名前, 行, 列)  ※ スライムは使わない
CELLS = [
    ("shizuyo", 0, 0),        # 静代: ふつう(ビンを持っている)
    ("shizuyo_grin", 0, 1),   # 静代: にやり(攻撃)
    ("shizuyo_pot", 1, 0),    # 静代: なべをかきまぜる(薬)
    ("shizuyo_cast", 2, 0),   # 静代: 魔法をとなえる
    ("shizuyo_rage", 2, 3),   # 静代: 魔法陣(本気)
    ("bat", 1, 1),           # コウモリ
    ("soot", 1, 2),          # まっくろ
    ("babybat", 2, 1),       # ちびコウモリ
    ("potions", 2, 2),       # どくびん
]
BG = np.array([135, 201, 162], float)


def cut(im, r, c, greenish=False):
    x0, x1 = XS[c]; y0, y1 = YS[r]
    a = np.asarray(im.crop((x0 + 4, y0 + 4, x1 - 4, y1 - 4))).astype(float)
    d = np.sqrt(((a - BG) ** 2).sum(axis=2))
    m = d > 34
    if greenish:   # 魔法陣のうすい緑は、キャラの一部ではないので抜く
        m &= ~((a[:, :, 1] > a[:, :, 0] + 14) & (a[:, :, 1] > a[:, :, 2] + 6) & (d < 120))
    m = ndi.binary_opening(m, iterations=1)
    lab, n = ndi.label(ndi.binary_dilation(m, iterations=3))
    if n:
        sizes = ndi.sum(m, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s > 0.04 * sizes.max()]
        m = m & np.isin(lab, keep)
    m = ndi.binary_fill_holes(m) | m
    alpha = (m * 255).astype(np.uint8)
    rgba = np.dstack([a.astype(np.uint8), alpha])
    ys, xs = np.where(m)
    img = Image.fromarray(rgba, "RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    im = Image.open(SRC).convert("RGB")
    for name, r, c in CELLS:
        t = cut(im, r, c, name == "shizuyo_rage")
        t.save(os.path.join(OUT, name + ".png"))
        print(name, t.size)


if __name__ == "__main__":
    main()
