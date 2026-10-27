// 仮マップの絵を、プログラムで描く(画像ファイルなしで動くようにするため)。
// 1ドット=2×2ピクセルの粗さで描いて、姪っ子と犬のドット絵になじませる。
// あとで本物のタイル画像に置き換えるときは、このファイルの makeArt() を差し替えればOK。
(function (g) {
  "use strict";
  var H = (g.Hanzo = g.Hanzo || {});
  var TILE = 64;
  var Q = 2;                       // 1ドットの拡大率
  var T = TILE / Q;                // 1マス = 32ドット

  // ---- 小さなドット絵キャンバス ----
  function hex(c) {
    if (typeof c !== "string") return c;
    var n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  }
  function Pix(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  Pix.prototype.set = function (x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    c = hex(c);
    var i = (y * this.w + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c[3];
  };
  Pix.prototype.get = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  };
  Pix.prototype.rect = function (x, y, w, h, c) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c);
  };
  Pix.prototype.ellipse = function (cx, cy, rx, ry, c) {
    for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
  };
  // 透明なところのうち、絵に接しているドットを outline 色にする
  Pix.prototype.outline = function (c) {
    var add = [];
    for (var y = 0; y < this.h; y++)
      for (var x = 0; x < this.w; x++)
        if (!this.get(x, y) && (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)))
          add.push([x, y]);
    for (var i = 0; i < add.length; i++) this.set(add[i][0], add[i][1], c);
  };
  Pix.prototype.toCanvas = function (mk) {
    var c = mk(this.w * Q, this.h * Q), ctx = c.getContext("2d");
    var small = mk(this.w, this.h), sctx = small.getContext("2d");
    var img = sctx.createImageData(this.w, this.h);
    img.data.set(this.d);
    sctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, this.w * Q, this.h * Q);
    return c;
  };

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- 色 ----
  var C = {
    grass: "#68a857", grassD: "#5a9a4a", grassL: "#79b863", tuft: "#4a853d",
    path: "#d8b87e", pathD: "#c7a368", pathL: "#e6cb98", pathEdge: "#b48e58", pebble: "#b08c5a",
    water: "#4a86d4", waterL: "#7db4ee", waterD: "#3d74bd", foam: "#dcefff", bank: "#8a6f45",
    plank: "#b98a4f", plankD: "#8f6535", rail: "#6b4a2a",
    out: "#2b2227",
  };

  function grassTile(r, withTufts) {
    var p = new Pix(T, T);
    p.rect(0, 0, T, T, C.grass);
    var i, x, y;
    for (i = 0; i < 26; i++) p.rect((r() * T) | 0, (r() * T) | 0, 2, 1, r() < 0.5 ? C.grassD : C.grassL);
    if (withTufts) {
      for (i = 0; i < 2; i++) {
        x = 3 + ((r() * (T - 8)) | 0); y = 5 + ((r() * (T - 9)) | 0);
        p.set(x, y, C.tuft); p.set(x + 2, y, C.tuft); p.set(x + 1, y - 1, C.tuft); p.set(x + 1, y, C.tuft);
      }
    }
    return p;
  }

  function flowerTile(r) {
    var p = grassTile(r, true);
    var cols = ["#f6f1e8", "#f08fa8", "#f4d35e", "#b79ae6"];
    for (var i = 0; i < 4; i++) {
      var x = 3 + ((r() * (T - 8)) | 0), y = 6 + ((r() * (T - 10)) | 0);
      var c = cols[(r() * cols.length) | 0];
      p.rect(x + 1, y + 2, 1, 3, "#3f7d35");
      p.set(x + 1, y + 1, "#f4d35e");
      p.set(x, y + 1, c); p.set(x + 2, y + 1, c); p.set(x + 1, y, c); p.set(x + 1, y + 2, c);
    }
    return p;
  }

  function pathTile(r, n) {   // n: {up,down,left,right} がとなりも道か
    var p = new Pix(T, T);
    p.rect(0, 0, T, T, C.path);
    var i;
    for (i = 0; i < 22; i++) p.rect((r() * T) | 0, (r() * T) | 0, 2, 1, r() < 0.5 ? C.pathD : C.pathL);
    for (i = 0; i < 3; i++) {
      var x = 3 + ((r() * (T - 8)) | 0), y = 3 + ((r() * (T - 8)) | 0);
      p.rect(x, y, 3, 2, C.pebble); p.set(x, y, C.pathL);
    }
    var e = 3;
    if (!n.up) { p.rect(0, 0, T, e, C.pathEdge); p.rect(0, e, T, 1, C.pathD); }
    if (!n.down) { p.rect(0, T - e, T, e, C.pathEdge); p.rect(0, T - e - 1, T, 1, C.pathD); }
    if (!n.left) { p.rect(0, 0, e, T, C.pathEdge); p.rect(e, 0, 1, T, C.pathD); }
    if (!n.right) { p.rect(T - e, 0, e, T, C.pathEdge); p.rect(T - e - 1, 0, 1, T, C.pathD); }
    return p;
  }

  function waterTile(r, n, frame) {   // n: となりが水(または橋)か
    var p = new Pix(T, T);
    p.rect(0, 0, T, T, C.water);
    var i, k;
    for (i = 0; i < 5; i++) p.rect((r() * T) | 0, (r() * T) | 0, 5, 2, C.waterD);
    for (k = 0; k < 4; k++) {
      var y = 4 + k * 8 + (frame ? 2 : 0), x = (r() * 16 + (frame ? 4 : 0)) | 0;
      p.rect(x, y, 8, 1, C.waterL); p.rect(x + 12, y + 3, 6, 1, C.waterL);
    }
    var b = 3;
    if (!n.up) { p.rect(0, 0, T, b, C.bank); p.rect(0, b, T, 1, C.foam); }
    if (!n.down) { p.rect(0, T - b, T, b, C.bank); p.rect(0, T - b - 1, T, 1, C.foam); }
    if (!n.left) { p.rect(0, 0, b, T, C.bank); p.rect(b, 0, 1, T, C.foam); }
    if (!n.right) { p.rect(T - b, 0, b, T, C.bank); p.rect(T - b - 1, 0, 1, T, C.foam); }
    return p;
  }

  function bridgeTile(r, vertical, frame) {
    var p = waterTile(r, { up: true, down: true, left: true, right: true }, frame);
    var i;
    if (vertical) {
      p.rect(3, 0, T - 6, T, C.plank);
      for (i = 0; i < T; i += 8) p.rect(3, i, T - 6, 1, C.plankD);
      p.rect(3, 0, 2, T, C.rail); p.rect(T - 5, 0, 2, T, C.rail);
      p.rect(1, 0, 2, T, "#2f2a24"); p.rect(T - 3, 0, 2, T, "#2f2a24");
    } else {
      p.rect(0, 3, T, T - 6, C.plank);
      for (i = 0; i < T; i += 8) p.rect(i, 3, 1, T - 6, C.plankD);
      p.rect(0, 3, T, 2, C.rail); p.rect(0, T - 5, T, 2, C.rail);
    }
    return p;
  }

  // ---- 木・岩・柵(草の上に置く、透明な背景の絵) ----
  function treeSprite(r) {
    var p = new Pix(T, T + 8);
    var cx = 16, cy = 15;
    p.rect(13, 28, 6, 12, "#7a4e2d"); p.rect(17, 28, 2, 12, "#5e3a22");
    p.rect(11, 38, 3, 2, "#5e3a22"); p.rect(18, 38, 3, 2, "#5e3a22");
    p.ellipse(cx, cy + 2, 14, 13, "#25683b");
    p.ellipse(cx - 1, cy, 13, 12, "#2f7d46");
    p.ellipse(cx - 4, cy - 3, 8 + ((r() * 2) | 0), 7, "#3f9656");
    p.ellipse(cx - 6, cy - 6, 4, 3, "#58b36c");
    for (var i = 0; i < 4; i++) p.set(8 + ((r() * 18) | 0), 8 + ((r() * 16) | 0), "#25683b");
    p.outline("#1c3d29");
    return p;
  }

  function rockSprite() {
    var p = new Pix(T, T);
    p.ellipse(16, 20, 11, 8, "#7d7d88");
    p.ellipse(15, 18, 10, 7, "#8d8d97");
    p.ellipse(12, 15, 5, 3, "#b3b3bd");
    p.rect(20, 22, 7, 2, "#6b6b76");
    p.outline("#2b2b33");
    return p;
  }

  function fenceSprite(n) {   // n: となりも柵か
    var p = new Pix(T, T);
    var c = "#b5834f", d = "#8a5e35";
    if (n.left) { p.rect(0, 14, 16, 2, c); p.rect(0, 20, 16, 2, c); }
    if (n.right) { p.rect(16, 14, 16, 2, c); p.rect(16, 20, 16, 2, c); }
    if (n.up) { p.rect(15, 0, 3, 14, c); }
    if (n.down) { p.rect(15, 22, 3, 10, c); }
    p.rect(13, 10, 6, 18, c); p.rect(17, 10, 2, 18, d);
    p.rect(13, 10, 6, 1, "#d2a06a");
    p.outline("#3a271a");
    return p;
  }

  // ---- 家(5×3マス) ----
  function houseSprite() {
    var w = T * 5, h = T * 3, p = new Pix(w, h), i, x, y;
    // 壁
    p.rect(8, 40, w - 16, h - 40, "#efe0bf");
    p.rect(8, h - 8, w - 16, 8, "#c9ab78");
    for (x = 8; x < w - 8; x += 40) p.rect(x, 40, 2, h - 48, "#d8c49a");
    // 屋根
    for (y = 6; y < 42; y++) {
      var inset = Math.floor((42 - y) * 0.7);
      p.rect(2 + inset, y, w - 4 - inset * 2, 1, ((y / 6) | 0) % 2 ? "#b5483a" : "#c25444");
    }
    for (y = 6; y < 42; y += 6) {
      var ins = Math.floor((42 - y) * 0.7);
      for (x = 2 + ins; x < w - 2 - ins; x += 8) p.set(x, y, "#8f362b");
    }
    p.rect(4, 38, w - 8, 4, "#8f362b");
    // 煙突
    p.rect(112, 0, 14, 16, "#8a8a94"); p.rect(112, 0, 14, 3, "#6d6d78"); p.rect(122, 3, 4, 13, "#70707a");
    // 窓
    var wins = [26, 108];
    for (i = 0; i < wins.length; i++) {
      var wx = wins[i];
      p.rect(wx, 52, 26, 24, "#7b4a2b");
      p.rect(wx + 2, 54, 22, 20, "#9fd3f0");
      p.rect(wx + 12, 54, 2, 20, "#7b4a2b"); p.rect(wx + 2, 63, 22, 2, "#7b4a2b");
      p.rect(wx + 3, 55, 6, 3, "#cdeafa");
      p.rect(wx - 2, 76, 30, 5, "#7b4a2b");
      for (x = wx; x < wx + 26; x += 5) { p.rect(x, 74, 3, 2, "#e86a7a"); p.rect(x + 1, 73, 1, 1, "#f4d35e"); }
    }
    // ドア(3マス目)
    p.rect(66, 58, 28, 38, "#5a3720");
    p.rect(68, 60, 24, 36, "#7b4a2b");
    p.rect(80, 60, 1, 36, "#5a3720");
    p.rect(71, 63, 7, 12, "#8d5a38"); p.rect(83, 63, 7, 12, "#8d5a38");
    p.rect(86, 80, 3, 3, "#f0c040");
    p.rect(62, 92, 36, 4, "#bdb7a6"); p.rect(62, 92, 36, 1, "#d6d1c2");
    p.outline("#3b2a22");
    return p;
  }

  // ---- まとめ ----
  function makeArt(mk, map) {
    var cols = map.rows[0].length, rows = map.rows.length;
    var tileAt = function (x, y) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return "T";
      return map.rows[y].charAt(x);
    };
    var isPath = function (x, y) { var t = tileAt(x, y); return t === "=" || t === "B"; };
    var isWater = function (x, y) { var t = tileAt(x, y); return t === "~" || t === "B"; };
    var ground = [mk(cols * TILE, rows * TILE), mk(cols * TILE, rows * TILE)];
    var gctx = [ground[0].getContext("2d"), ground[1].getContext("2d")];
    var seed = 20261027;
    var objects = [];   // 前後の重なりを決めるための物体(木・岩・柵・家)

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var ch = tileAt(x, y), r = rng(seed + x * 977 + y * 131);
        var frames = [null, null];
        if (ch === "=") {
          var np = { up: isPath(x, y - 1), down: isPath(x, y + 1), left: isPath(x - 1, y), right: isPath(x + 1, y) };
          // 家の入り口に続く道は、上をふさがない
          if (tileAt(x, y - 1) === "D") np.up = true;
          frames[0] = frames[1] = pathTile(r, np).toCanvas(mk);
        } else if (ch === "~" || ch === "B") {
          var nw = { up: isWater(x, y - 1), down: isWater(x, y + 1), left: isWater(x - 1, y), right: isWater(x + 1, y) };
          var rr = [rng(seed + x * 31 + y * 7), rng(seed + x * 31 + y * 7)];
          if (ch === "B") {
            var vert = isPath(x, y - 1) || isPath(x, y + 1);
            frames = [bridgeTile(rr[0], vert, 0).toCanvas(mk), bridgeTile(rr[1], vert, 1).toCanvas(mk)];
          } else {
            frames = [waterTile(rr[0], nw, 0).toCanvas(mk), waterTile(rr[1], nw, 1).toCanvas(mk)];
          }
        } else if (ch === ",") {
          frames[0] = frames[1] = flowerTile(r).toCanvas(mk);
        } else {
          frames[0] = frames[1] = grassTile(r, ch === ".").toCanvas(mk);
        }
        gctx[0].drawImage(frames[0], x * TILE, y * TILE);
        gctx[1].drawImage(frames[1], x * TILE, y * TILE);
      }
    }

    var treeVariants = [];
    for (var v = 0; v < 4; v++) treeVariants.push(treeSprite(rng(seed + v * 55)).toCanvas(mk));
    var rock = rockSprite().toCanvas(mk);
    var isFence = function (x, y) { return tileAt(x, y) === "F"; };
    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        var c2 = tileAt(x, y);
        if (c2 === "T") {
          // 外周のとなりあう木は、重なりが目立つので上の段だけ描く(見た目の簡略化)
          objects.push({ img: treeVariants[(x * 7 + y * 13) % 4], x: x * TILE, y: y * TILE - 16, sortY: (y + 1) * TILE });
        } else if (c2 === "R") {
          objects.push({ img: rock, x: x * TILE, y: y * TILE, sortY: (y + 1) * TILE });
        } else if (c2 === "F") {
          var fimg = fenceSprite({ left: isFence(x - 1, y), right: isFence(x + 1, y), up: isFence(x, y - 1), down: isFence(x, y + 1) }).toCanvas(mk);
          objects.push({ img: fimg, x: x * TILE, y: y * TILE, sortY: (y + 1) * TILE - 10 });
        }
      }
    }
    var house = houseSprite().toCanvas(mk);
    map.objects.forEach(function (o) {
      if (o.type === "house") objects.push({ img: house, x: o.x * TILE, y: o.y * TILE, sortY: (o.y + o.h) * TILE - 4 });
    });
    objects.sort(function (a, b) { return a.sortY - b.sortY; });
    return { ground: ground, objects: objects, width: cols * TILE, height: rows * TILE };
  }

  H.makeArt = makeArt;
  H.Pix = Pix;
})(typeof window !== "undefined" ? window : globalThis);
