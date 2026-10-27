#!/usr/bin/env python3
"""Gemini などで作ったキャラ画像から、ゲーム用スプライトを作る。

入力(assets/source/):
    niece-sheet.jpg  dog-sheet.jpg   4行×3列のシート
    uncle-sheet.jpg                  5行×3列のシート(下・右・左・上・釣り)
    mama.jpg  papa.jpg               1枚絵(立ち姿)
出力(assets/sprites/):
    niece.png dog.png uncle.png mama.png papa.png
    sprites.js   (フレームの大きさ・向きごとの並びなどの設定)

やっていること
  1. 背景を取り除き、キャラを1コマずつ切り出す
  2. 拡大されたドット絵の「1ドットの大きさ」を推定して、元のドット解像度に戻す
  3. 色を整理(JPEGのノイズ除去)して、足元をそろえた1枚のシートにまとめる
  4. 絵ごとにバラバラだった大きさを、ゲーム内の身長差に合わせて拡大する(SCALE)

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

# シートごとの設定。pitch は「元の1ドットがシート上で何pxか」(測定値)。
SHEETS = {
    "niece": dict(file="niece-sheet.jpg", kind="grid", rows=4, cols=3, thr=45,
                  pitch=lambda r: (4.42 if r == 0 else 5.14), span=0.18, color="fg"),
    "dog": dict(file="dog-sheet.jpg", kind="grid", rows=4, cols=3, thr=45,
                pitch=lambda r: 4.90, span=0.18, color="fg"),
    "uncle": dict(file="uncle-sheet.jpg", kind="bands", rows=5, cols=3, thr=38, crop=(6, 6, None, None),
                  pitch=lambda r: 6.30, span=0.5, color="dark"),
    "mama": dict(file="mama2.jpg", kind="single", thr=38, pitch=lambda r: (8.5, 9.7), span=0.6, color="dark", holes=True),
    "papa": dict(file="papa2.jpg", kind="single", thr=38, pitch=lambda r: (10.9, 10.5), span=0.6, color="dark", holes=False),
}

# ゲーム内の身長差に合わせた拡大率(分子, 分母)。元の絵の大きさがバラバラだったので、ここでそろえる。
#   姪っ子(約79ドット)を基準に、パパ=大人、ママ=パパより少し低め、おじさん=ずんぐり。
# (横の分子, 横の分母, 縦の分子, 縦の分母)
SCALE = {"niece": (1, 1, 1, 1), "dog": (1, 1, 1, 1), "uncle": (2, 1, 2, 1), "mama": (9, 8, 9, 8), "papa": (4, 3, 4, 3)}


# ------------------------------------------------------------------ 読み込み・背景

def load(cfg):
    im = Image.open(os.path.join(SRC, cfg["file"])).convert("RGB")
    crop = cfg.get("crop")
    if crop:
        x0, y0, x1, y1 = crop
        im = im.crop((x0, y0, x1 or im.width, y1 or im.height))
    a = np.asarray(im).astype(float)
    # 背景色 = いちばん多い色(8段階にまるめて数える)→ その近くの色の中央値
    q = (a // 8).astype(int).reshape(-1, 3)
    key = q[:, 0] * 1024 + q[:, 1] * 32 + q[:, 2]
    mode = np.bincount(key).argmax()
    ref = np.array([(mode // 1024) * 8 + 4, ((mode // 32) % 32) * 8 + 4, (mode % 32) * 8 + 4], float)
    near = np.sqrt(((a - ref) ** 2).sum(axis=2)) < 24
    bg = np.median(a[near], axis=0)
    return im, a, bg


def fg_mask(a, bg, thr):
    m = np.sqrt(((a - bg) ** 2).sum(axis=2)) > thr
    return ndi.binary_opening(m, iterations=1)


# ------------------------------------------------------------------ 切り出し

def find_boxes_components(m, rows, cols, dil=2, min_area=1500):
    lab, _ = ndi.label(ndi.binary_dilation(m, iterations=dil))
    boxes = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        if (m[sl] & (lab[sl] == i + 1)).sum() >= min_area:
            boxes.append((sl[0].start, sl[0].stop, sl[1].start, sl[1].stop))
    boxes.sort(key=lambda b: (round((b[0] + b[1]) / 2 / 120), b[2]))
    if len(boxes) != rows * cols:
        raise SystemExit("キャラが %d 個のはずが、%d 個見つかりました" % (rows * cols, len(boxes)))
    return boxes


def _runs(profile, gap):
    idx = np.where(profile > 0)[0]
    out, s, p = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - p > gap:
            out.append([s, p + 1]); s = i
        p = i
    out.append([s, p + 1])
    return out


def _merge_to(runs, n):
    while len(runs) > n:
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        k = int(np.argmin(gaps))
        runs[k][1] = runs[k + 1][1]
        del runs[k + 1]
    if len(runs) < n:
        raise SystemExit("行・列の区切りが %d 個しか見つかりません(%d 個のはず)" % (len(runs), n))
    return runs


def find_boxes_bands(m, rows, cols):
    """行→列の順に、すき間で区切って切り出す(釣りざおなど細長いものがあるシート用)"""
    md = ndi.binary_dilation(m, iterations=3)
    boxes = []
    for y0, y1 in _merge_to(_runs(md.sum(axis=1), 3), rows):
        band = md[y0:y1]
        for x0, x1 in _merge_to(_runs(band.sum(axis=0), 10), cols):
            ys, xs = np.where(m[y0:y1, x0:x1])
            boxes.append((y0 + ys.min(), y0 + ys.max() + 1, x0 + xs.min(), x0 + xs.max() + 1))
    return boxes


def largest_box(m, dil=4):
    lab, _ = ndi.label(ndi.binary_dilation(m, iterations=dil))
    sl = max(ndi.find_objects(lab), key=lambda s: (s[0].stop - s[0].start) * (s[1].stop - s[1].start))
    return (sl[0].start, sl[0].stop, sl[1].start, sl[1].stop)


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


def body_mask(mm, pitch):
    """白い部分(シャツのしま模様など)は絵の一部、腕と体のすき間は背景、として穴を埋める"""
    closed = ndi.binary_closing(mm, iterations=2)
    holes = ndi.binary_fill_holes(closed) & ~closed
    lab, n = ndi.label(holes)
    if n:
        dist = ndi.distance_transform_edt(holes)
        keep = np.zeros_like(closed)
        for i in range(1, n + 1):
            comp = lab == i
            if dist[comp].max() < 2.2 * pitch:   # 細い=しま模様 → 絵の一部
                keep |= comp
        closed = closed | keep
    return closed


def to_native(a, m, gray, box, px0, py0, span, color="fg", holes=None, pad=10):
    y0, y1, x0, x1 = box
    H, W = m.shape
    y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
    y1, x1 = min(H, y1 + pad), min(W, x1 + pad)
    g = gray[y0:y1, x0:x1]
    px, phx = fit_axis(np.abs(np.diff(g, axis=1)).mean(axis=0), px0, span, 61 if span > 0.3 else 37)
    py, phy = fit_axis(np.abs(np.diff(g, axis=0)).mean(axis=1), py0, span, 61 if span > 0.3 else 37)
    mm = m[y0:y1, x0:x1]
    if holes is not None:
        mm = body_mask(mm, (px0 + py0) / 2) if holes else ndi.binary_closing(mm, iterations=1)
    sub = a[y0:y1, x0:x1]
    nx, ny = int((x1 - x0 - phx) // px), int((y1 - y0 - phy) // py)
    out = np.zeros((ny, nx, 4), np.uint8)
    for j in range(ny):
        cy = phy + (j + 0.5) * py
        ya, yb = int(round(cy - 0.3 * py)), int(round(cy + 0.3 * py)) + 1
        for i in range(nx):
            cx = phx + (i + 0.5) * px
            xa, xb = int(round(cx - 0.3 * px)), int(round(cx + 0.3 * px)) + 1
            k = mm[ya:yb, xa:xb]
            if k.size == 0 or k.mean() < 0.5:
                continue
            blk = sub[ya:yb, xa:xb]
            if color == "fg":
                col = blk[k].mean(axis=0)
            else:   # 輪郭と背景がまざったドットは、暗いほう(輪郭)の色にする
                px_ = blk.reshape(-1, 3)
                order = np.argsort(px_.sum(axis=1))
                col = px_[order[:max(1, len(order) // 2)]].mean(axis=0)
            out[j, i, :3] = np.clip(col, 0, 255)
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


def scale_nearest(f, xn, xd, yn, yd):
    if (xn, xd, yn, yd) == (1, 1, 1, 1):
        return f
    h, w = f.shape[:2]
    nh, nw = int(round(h * yn / yd)), int(round(w * xn / xd))
    ys = np.minimum(h - 1, (np.arange(nh) * yd) // yn)
    xs = np.minimum(w - 1, (np.arange(nw) * xd) // xn)
    return f[ys][:, xs]


# ------------------------------------------------------------------ シートにまとめる

DIRS = ("down", "left", "right", "up")


def anchor_x(fr, upper_only, erode):
    al = fr[..., 3] > 0
    if erode:   # 釣りざおなどの細いものをのぞいて、体の中心を求める
        e = ndi.binary_erosion(al, iterations=2)
        al = e if e.any() else al
    if upper_only:
        al = al.copy()
        al[int(fr.shape[0] * 0.6):] = False
    xs = np.where(al)[1]
    return xs.mean()


def assemble(layout, upper_only, erode=False, pad=3):
    """layout: 行の名前 -> {"frames":[...], "walk":[...], "bob":[...]}  (下左右上以外の名前は extra 扱い)"""
    anchors = {k: [round(anchor_x(f, upper_only, erode)) for f in d["frames"]] for k, d in layout.items()}
    left = max(ax for k in layout for ax in anchors[k])
    right = max(f.shape[1] - ax for k in layout for f, ax in zip(layout[k]["frames"], anchors[k]))
    half = max(left, right) + pad
    cw = half * 2 + 1
    ch = max(f.shape[0] for d in layout.values() for f in d["frames"]) + 2 * pad
    cols = max(len(d["frames"]) for d in layout.values())
    names = list(layout.keys())
    sheet = np.zeros((ch * len(names), cw * cols, 4), np.uint8)
    meta = {"cellW": cw, "cellH": ch, "anchorX": half, "anchorY": ch - pad, "dirs": {}, "extra": {}}
    for r, name in enumerate(names):
        d = layout[name]
        for c, fr in enumerate(d["frames"]):
            x0 = half - anchors[name][c]
            y0 = ch - pad - fr.shape[0]
            region = sheet[r * ch + y0:r * ch + y0 + fr.shape[0], c * cw + x0:c * cw + x0 + fr.shape[1]]
            region[fr[..., 3] > 0] = fr[fr[..., 3] > 0]
        if name in DIRS:
            meta["dirs"][name] = {"row": r, "idle": 0, "walk": d["walk"], "bob": d["bob"]}
        else:
            meta["extra"][name] = {"row": r, "frames": list(range(len(d["frames"])))}
    return sheet, meta


# ------------------------------------------------------------------ キャラごとの組み立て

CYCLE = [1, 0, 2, 0]      # 歩き1 → 立ち → 歩き2 → 立ち
FLIP2 = [0, 1]            # 前後向きで足の動きがないときは、左右反転を交互に出す


def extract(name):
    cfg = SHEETS[name]
    im, a, bg = load(cfg)
    m = fg_mask(a, bg, cfg["thr"])
    gray = np.asarray(im.convert("L")).astype(float)
    if cfg["kind"] == "single":
        boxes = [largest_box(m)]
    elif cfg["kind"] == "bands":
        boxes = find_boxes_bands(m, cfg["rows"], cfg["cols"])
    else:
        boxes = find_boxes_components(m, cfg["rows"], cfg["cols"])
    frames = []
    for i, b in enumerate(boxes):
        p = cfg["pitch"](i // 3 if cfg["kind"] != "single" else 0)
        px0, py0 = (p, p) if np.isscalar(p) else p
        f = to_native(a, m, gray, b, px0, py0, cfg["span"], cfg["color"], cfg.get("holes"))
        f = fix_green(defringe(f)) if cfg["color"] == "fg" else fix_green(f)
        frames.append(trim(f))
    return quantize_all(frames)


def build(name):
    fr = extract(name)
    F = lambda r, c: fr[r * 3 + c]
    if name == "niece":
        layout = {
            "down": {"frames": [F(0, 0), F(0, 2), mirror(F(0, 2))], "walk": CYCLE, "bob": [0, 0, 0, 0]},
            # 元シートの左向きの行は、3コマ目が右向きになっていたので、右向きの行を反転して使う
            "left": {"frames": [mirror(F(2, 0)), mirror(F(2, 1)), mirror(F(2, 2))], "walk": CYCLE, "bob": [0, 0, 0, 0]},
            "right": {"frames": [F(2, 0), F(2, 1), F(2, 2)], "walk": CYCLE, "bob": [0, 0, 0, 0]},
            "up": {"frames": [F(3, 0), F(3, 2)], "walk": FLIP2, "bob": [0, 1]},
        }
        upper, erode = True, False
    elif name == "dog":
        layout = {
            "down": {"frames": [F(0, 0), F(0, 1), F(0, 2)], "walk": CYCLE, "bob": [0, 0, 0, 0]},
            "left": {"frames": [mirror(F(1, 0)), mirror(F(1, 1)), mirror(F(1, 2))], "walk": CYCLE, "bob": [0, 0, 0, 0]},
            "right": {"frames": [F(1, 0), F(1, 1), F(1, 2)], "walk": CYCLE, "bob": [0, 0, 0, 0]},
            "up": {"frames": [F(3, 0), mirror(F(3, 0))], "walk": FLIP2, "bob": [0, 1]},
        }
        upper, erode = False, False
    elif name == "uncle":
        layout = {
            "down": {"frames": [F(0, 0), F(0, 1), F(0, 2)], "walk": CYCLE, "bob": [0, 0, 0, 0]},
            "left": {"frames": [F(2, 0), F(2, 1), F(2, 2)], "walk": CYCLE, "bob": [0, 0, 0, 0]},
            "right": {"frames": [F(1, 0), F(1, 1), F(1, 2)], "walk": CYCLE, "bob": [0, 0, 0, 0]},
            "up": {"frames": [F(3, 0), F(3, 1), F(3, 2)], "walk": CYCLE, "bob": [0, 0, 0, 0]},
            "fish": {"frames": [F(4, 0), F(4, 1), F(4, 2)], "walk": [0], "bob": [0]},
        }
        upper, erode = True, True
    else:   # mama / papa: 立ち姿の1枚だけ
        layout = {"down": {"frames": [fr[0]], "walk": [0], "bob": [0]}}
        upper, erode = True, False
    sx = SCALE[name]
    for d in layout.values():
        d["frames"] = [scale_nearest(f, *sx) for f in d["frames"]]
    sheet, meta = assemble(layout, upper, erode)
    Image.fromarray(sheet, "RGBA").save(os.path.join(OUT, name + ".png"))
    print("%-6s セル %3dx%-3d  1コマの高さ %d" % (name, meta["cellW"], meta["cellH"], max(f.shape[0] for d in layout.values() for f in d["frames"])))
    return meta


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    metas = {n: build(n) for n in ("niece", "dog", "uncle", "mama", "papa")}
    with open(os.path.join(OUT, "sprites.js"), "w", encoding="utf-8") as f:
        f.write("// tools/build_sprites.py で自動生成。手で直さないでください。\n")
        f.write("window.SPRITE_META = " + json.dumps(metas, ensure_ascii=False, separators=(",", ":")) + ";\n")
