#!/usr/bin/env python3
"""Gemini などで作った 4行×3列 のキャラシートから、ゲーム用スプライトを作る。

入力:  assets/source/niece-sheet.jpg, assets/source/dog-sheet.jpg
出力:  assets/sprites/niece.png, assets/sprites/dog.png
       assets/sprites/sprites.js  (フレームの大きさ・向きごとの並びなどの設定)

やっていること
  1. 背景の緑を取り除き、12個のキャラ画像を切り出す
  2. 拡大されたドット絵の「1ドットの大きさ」を推定して、元のドット解像度に戻す
  3. 色を整理(JPEGのノイズ除去)して、足元をそろえた1枚のシートにまとめる

使い方:  pip install numpy pillow scipy  →  python3 tools/build_sprites.py
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "source")
OUT = os.path.join(ROOT, "assets", "sprites")

# シート上で1ドットが何pxに拡大されているか(測定値)。行ごとに違うことがある。
PITCH = {
    "dog": lambda row: 4.90,
    "niece": lambda row: 4.42 if row == 0 else 5.14,
}
FILES = {"dog": "dog-sheet.jpg", "niece": "niece-sheet.jpg"}


# ------------------------------------------------------------------ 切り出し

def load(name):
    im = Image.open(os.path.join(SRC, FILES[name])).convert("RGB")
    a = np.asarray(im).astype(float)
    c = np.concatenate([a[:6, :6].reshape(-1, 3), a[:6, -6:].reshape(-1, 3),
                        a[-6:, :6].reshape(-1, 3), a[-6:, -6:].reshape(-1, 3)])
    return im, a, np.median(c, axis=0)


def find_boxes(a, bg, thr=45, dil=2, min_area=1500):
    m = np.sqrt(((a - bg) ** 2).sum(axis=2)) > thr
    m = ndi.binary_opening(m, iterations=1)
    lab, _ = ndi.label(ndi.binary_dilation(m, iterations=dil))
    boxes = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        if (m[sl] & (lab[sl] == i + 1)).sum() >= min_area:
            boxes.append((sl[0].start, sl[0].stop, sl[1].start, sl[1].stop))
    # 4行×3列の順に並べる
    boxes.sort(key=lambda b: (round((b[0] + b[1]) / 2 / 120), b[2]))
    if len(boxes) != 12:
        raise SystemExit("12個のキャラが見つかりません(見つかった数: %d)" % len(boxes))
    return m, boxes


# ------------------------------------------------------------------ ドット解像度に戻す

def fit_axis(profile, p0, span=0.18, steps=37):
    n = len(profile) + 1
    best = None
    for p in np.linspace(p0 - span, p0 + span, steps):
        for ph in np.arange(0.0, p, 0.1):
            idx = np.round(np.arange(ph, n - 1, p)).astype(int) - 1
            idx = idx[(idx >= 0) & (idx < len(profile))]
            if len(idx) < 4:
                continue
            sc = profile[idx].mean()
            if best is None or sc > best[0]:
                best = (sc, p, ph)
    return best[1], best[2]


def to_native(a, m, gray, box, p0, pad=10):
    y0, y1, x0, x1 = box
    H, W = m.shape
    y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
    y1, x1 = min(H, y1 + pad), min(W, x1 + pad)
    g = gray[y0:y1, x0:x1]
    px, phx = fit_axis(np.abs(np.diff(g, axis=1)).mean(axis=0), p0)
    py, phy = fit_axis(np.abs(np.diff(g, axis=0)).mean(axis=1), p0)
    nx, ny = int((x1 - x0 - phx) // px), int((y1 - y0 - phy) // py)
    out = np.zeros((ny, nx, 4), np.uint8)
    sub, msub = a[y0:y1, x0:x1], m[y0:y1, x0:x1]
    for j in range(ny):
        cy = phy + (j + 0.5) * py
        ya, yb = int(round(cy - 0.3 * py)), int(round(cy + 0.3 * py)) + 1
        for i in range(nx):
            cx = phx + (i + 0.5) * px
            xa, xb = int(round(cx - 0.3 * px)), int(round(cx + 0.3 * px)) + 1
            mm = msub[ya:yb, xa:xb]
            if mm.size == 0 or mm.mean() < 0.5:
                continue
            out[j, i, :3] = np.clip(sub[ya:yb, xa:xb][mm].mean(axis=0), 0, 255)
            out[j, i, 3] = 255
    return out


def defringe(fr):
    """背景の緑がにじんだ縁のドットを消す(キャラに緑は使っていない前提)"""
    for _ in range(2):
        r, g, b = (fr[..., k].astype(int) for k in range(3))
        greenish = (fr[..., 3] > 0) & (g > r + 18) & (g > b + 8)
        transparent = fr[..., 3] == 0
        near = ndi.binary_dilation(transparent, structure=np.ones((3, 3)))
        fr[greenish & near] = 0
    return fr


def fix_green(fr):
    """輪郭の内側に残った緑っぽいドットを、まわりの色でぬりかえる"""
    r, g, b = (fr[..., k].astype(int) for k in range(3))
    bad = (fr[..., 3] > 0) & (g > r + 14) & (g > b + 10)
    H, W = bad.shape
    for y, x in zip(*np.where(bad)):
        ys, xs = slice(max(0, y - 1), y + 2), slice(max(0, x - 1), x + 2)
        nb = fr[ys, xs]
        ok = (nb[..., 3] > 0) & ~bad[ys, xs]
        if ok.any():
            fr[y, x, :3] = nb[ok][:, :3].mean(axis=0).astype("uint8")
        else:
            fr[y, x] = 0
    return fr


def trim(fr, min_size=6):
    al = fr[..., 3] > 0
    lab, n = ndi.label(al, structure=np.ones((3, 3)))
    for i, s in enumerate(ndi.sum(al, lab, range(1, n + 1))):
        if s < min_size:
            fr[lab == i + 1] = 0
    ys, xs = np.where(fr[..., 3] > 0)
    return fr[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def quantize_all(frames, colors=96):
    px = np.concatenate([f[f[..., 3] > 0][:, :3] for f in frames])
    q = Image.fromarray(px.reshape(-1, 1, 3).astype("uint8")).quantize(
        colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = np.array(q.getpalette()[:colors * 3]).reshape(-1, 3)
    out = []
    for f in frames:
        f = f.copy()
        m = f[..., 3] > 0
        rgb = f[m][:, :3].astype(int)
        d = ((rgb[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2)
        f[m, :3] = pal[d.argmin(axis=1)]
        out.append(f)
    return out


def mirror(f):
    return f[:, ::-1].copy()


# ------------------------------------------------------------------ シートにまとめる

def anchor_x(fr, upper_only):
    al = fr[..., 3] > 0
    if upper_only:
        al = al.copy()
        al[int(fr.shape[0] * 0.6):] = False
    xs = np.where(al)[1]
    return xs.mean()


def assemble(name, layout, upper_only, pad=(3, 3)):
    """layout: 向きごとに {"frames": [...], "walk": [...], "bob": [...]}"""
    frames_flat = [f for d in layout.values() for f in d["frames"]]
    cw = max(f.shape[1] for f in frames_flat) + 2 * pad[0] + 2
    ch = max(f.shape[0] for f in frames_flat) + 2 * pad[1]
    cols = max(len(d["frames"]) for d in layout.values())
    sheet = np.zeros((ch * 4, cw * cols, 4), np.uint8)
    meta = {"cellW": cw, "cellH": ch, "anchorX": cw // 2, "anchorY": ch - pad[1], "dirs": {}}
    for r, dname in enumerate(["down", "left", "right", "up"]):
        d = layout[dname]
        for c, fr in enumerate(d["frames"]):
            ax = anchor_x(fr, upper_only)
            x0 = int(round(cw / 2 - ax))
            x0 = max(0, min(cw - fr.shape[1], x0))
            y0 = ch - pad[1] - fr.shape[0]
            cell = sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
            region = cell[y0:y0 + fr.shape[0], x0:x0 + fr.shape[1]]
            region[fr[..., 3] > 0] = fr[fr[..., 3] > 0]
        meta["dirs"][dname] = {"row": r, "idle": 0, "walk": d["walk"], "bob": d["bob"]}
    return sheet, meta


def build(name):
    im, a, bg = load(name)
    m, boxes = find_boxes(a, bg)
    gray = np.asarray(im.convert("L")).astype(float)
    fr = []
    for i, b in enumerate(boxes):
        f = to_native(a, m, gray, b, PITCH[name](i // 3))
        fr.append(trim(fix_green(defringe(f))))
    fr = quantize_all(fr)
    F = lambda r, c: fr[r * 3 + c]

    cycle = [1, 0, 2, 0]      # 歩き1 → 立ち → 歩き2 → 立ち
    flip2 = [0, 1]            # 前後向きは左右反転を交互に
    if name == "niece":
        layout = {
            "down": {"frames": [F(0, 0), F(0, 2), mirror(F(0, 2))], "walk": cycle, "bob": [0, 0, 0, 0]},
            # 元シートの左向きの行は、3コマ目が右向きになっていたので、右向きの行を反転して使う
            "left": {"frames": [mirror(F(2, 0)), mirror(F(2, 1)), mirror(F(2, 2))], "walk": cycle, "bob": [0, 0, 0, 0]},
            "right": {"frames": [F(2, 0), F(2, 1), F(2, 2)], "walk": cycle, "bob": [0, 0, 0, 0]},
            "up": {"frames": [F(3, 0), F(3, 2)], "walk": flip2, "bob": [0, 1]},
        }
        upper_only = True
    else:
        layout = {
            "down": {"frames": [F(0, 0), F(0, 1), F(0, 2)], "walk": cycle, "bob": [0, 0, 0, 0]},
            "left": {"frames": [mirror(F(1, 0)), mirror(F(1, 1)), mirror(F(1, 2))], "walk": cycle, "bob": [0, 0, 0, 0]},
            "right": {"frames": [F(1, 0), F(1, 1), F(1, 2)], "walk": cycle, "bob": [0, 0, 0, 0]},
            "up": {"frames": [F(3, 0), mirror(F(3, 0))], "walk": flip2, "bob": [0, 1]},
        }
        upper_only = False
    sheet, meta = assemble(name, layout, upper_only)
    Image.fromarray(sheet, "RGBA").save(os.path.join(OUT, name + ".png"))
    print(name, "→ セル %dx%d" % (meta["cellW"], meta["cellH"]))
    return meta


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    metas = {n: build(n) for n in ("niece", "dog")}
    with open(os.path.join(OUT, "sprites.js"), "w", encoding="utf-8") as f:
        f.write("// tools/build_sprites.py で自動生成。手で直さないでください。\n")
        f.write("window.SPRITE_META = " + json.dumps(metas, ensure_ascii=False, indent=2) + ";\n")
