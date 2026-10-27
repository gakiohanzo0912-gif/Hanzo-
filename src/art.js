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


  // ---- お店(5×3マス。入り口は3マス目、ひさしと看板つき) ----
  function shopSprite() {
    var w = T * 5, h = T * 3, p = new Pix(w, h), i, x, y;
    // 壁
    p.rect(8, 40, w - 16, h - 40, "#d9efe3");
    p.rect(8, h - 8, w - 16, 8, "#8fb8a3");
    for (x = 8; x < w - 8; x += 40) p.rect(x, 40, 2, h - 48, "#bcdccb");
    // 屋根(青緑)
    for (y = 6; y < 42; y++) {
      var inset = Math.floor((42 - y) * 0.7);
      p.rect(2 + inset, y, w - 4 - inset * 2, 1, ((y / 6) | 0) % 2 ? "#2f7f8f" : "#3a93a4");
    }
    p.rect(4, 38, w - 8, 4, "#22616e");
    // 看板(チョコレートの絵)
    p.rect(52, 10, 56, 20, "#6b4529");
    p.rect(54, 12, 52, 16, "#f3e3bd");
    p.rect(62, 15, 36, 10, "#5a3320");
    for (x = 62; x < 98; x += 9) p.rect(x, 15, 1, 10, "#7a4a30");
    p.rect(62, 19, 36, 1, "#7a4a30");
    p.rect(64, 16, 3, 2, "#8d5a3d");
    // ウィンドウ(商品がならぶ)
    var wins = [20, 112];
    for (i = 0; i < wins.length; i++) {
      var wx = wins[i];
      p.rect(wx, 52, 28, 28, "#6b4529");
      p.rect(wx + 2, 54, 24, 24, "#a8dcf0");
      p.rect(wx + 2, 70, 24, 8, "#c79a62");
      var cols = ["#e86a7a", "#f4d35e", "#7b5cc8", "#5aa8e0"];
      for (x = 0; x < 4; x++) { p.rect(wx + 4 + x * 6, 64, 4, 6, cols[x]); p.rect(wx + 4 + x * 6, 64, 4, 1, "#ffffff"); }
      p.rect(wx + 3, 55, 6, 3, "#d7f0fa");
    }
    // ひさし(赤と白のしま)
    for (x = 58; x < 102; x += 8) {
      p.rect(x, 52, 4, 8, "#d94a4a"); p.rect(x + 4, 52, 4, 8, "#fff3e0");
    }
    p.rect(58, 60, 44, 2, "#a53030");
    // ドア
    p.rect(66, 64, 28, 32, "#5a3720");
    p.rect(68, 66, 24, 30, "#7b4a2b");
    p.rect(71, 69, 18, 11, "#a8dcf0");
    p.rect(79, 69, 2, 11, "#5a3720");
    p.rect(86, 84, 3, 3, "#f0c040");
    p.rect(62, 92, 36, 4, "#bdb7a6"); p.rect(62, 92, 36, 1, "#d6d1c2");
    p.outline("#2a3b3d");
    return p;
  }

  // ---- 家の中・お店の中 ----
  function floorTile(r, theme) {
    var p = new Pix(T, T), i, base = theme.floor;
    p.rect(0, 0, T, T, base);
    for (i = 0; i < 4; i++) {
      p.rect(0, i * 8 + 7, T, 1, "#a7794a");
      p.rect(0, i * 8, T, 1, "#e0b97e");
      var off = ((r() * 24) | 0) + 4;
      p.rect(off, i * 8 + 1, 1, 6, "#b88a58");
    }
    return p;
  }
  function wallTrimTile(theme) {   // 外周のかべ(暗い木)
    var p = new Pix(T, T);
    p.rect(0, 0, T, T, theme.trim);
    p.rect(0, 0, T, 2, "#7c6450");
    for (var x = 0; x < T; x += 8) p.rect(x, 2, 1, T - 2, "#4b3a2d");
    return p;
  }
  function wallFaceTile(theme) {   // 奥のかべ(かべ紙+腰板)
    var p = new Pix(T, T);
    p.rect(0, 0, T, T, theme.wall);
    for (var x = 0; x < T; x += 8) p.rect(x, 0, 1, 18, "#dccaa0");
    p.rect(0, 18, T, 2, "#f6ecd2");
    p.rect(0, 20, T, T - 20, theme.wains);
    for (x = 0; x < T; x += 10) p.rect(x, 22, 1, T - 22, "#8a5e38");
    p.rect(0, T - 2, T, 2, "#5a3e24");
    return p;
  }
  function rugTile() {
    var p = new Pix(T, T);
    p.rect(0, 0, T, T, "#b8453f");
    p.rect(2, 2, T - 4, T - 4, "#d86a5a");
    p.rect(6, 6, T - 12, T - 12, "#b8453f");
    p.rect(9, 9, T - 18, T - 18, "#f1d58a");
    return p;
  }
  function matTile() {
    var p = new Pix(T, T);
    p.rect(4, 8, T - 8, T - 12, "#5e4a3b");
    for (var x = 6; x < T - 6; x += 4) p.rect(x, 10, 2, T - 16, "#7a6350");
    p.outline("#3b2d22");
    return p;
  }
  function tableSprite() {
    var p = new Pix(T, T + 8);
    p.rect(5, 30, 3, 10, "#6d4526"); p.rect(24, 30, 3, 10, "#6d4526");
    p.ellipse(16, 24, 14, 8, "#7d5230");
    p.ellipse(16, 22, 14, 8, "#a4713f");
    p.ellipse(16, 21, 11, 5, "#c28850");
    p.rect(13, 14, 7, 5, "#f4efe3"); p.rect(20, 15, 3, 1, "#f4efe3"); p.rect(14, 12, 5, 2, "#e86a7a");
    p.outline("#3a271a");
    return p;
  }
  function shelfSprite() {
    var p = new Pix(T, T + 12), i, cols = ["#c04a4a", "#4a7ac0", "#d9a93a", "#4aa070", "#8b5cc0", "#e07a3c"];
    p.rect(1, 0, 30, 44, "#7a4e2d");
    p.rect(3, 2, 26, 40, "#4d321d");
    for (var row = 0; row < 3; row++) {
      var y = 4 + row * 13;
      p.rect(3, y + 11, 26, 2, "#8d5a38");
      var x = 4;
      for (i = 0; i < 7; i++) {
        var bw = 2 + ((i * 3 + row) % 3), bh = 8 - ((i + row) % 3);
        p.rect(x, y + 11 - bh, bw, bh, cols[(i + row * 2) % cols.length]);
        x += bw + 1;
        if (x > 26) break;
      }
    }
    p.outline("#2a1b10");
    return p;
  }
  function kitchenSprite() {
    var p = new Pix(T, T + 8);
    p.rect(1, 6, 30, 38, "#d8d6d0");
    p.rect(1, 6, 30, 3, "#f1efe9");
    p.rect(1, 22, 30, 3, "#9a988f");
    p.rect(3, 26, 12, 16, "#c9c7bf"); p.rect(17, 26, 12, 16, "#c9c7bf");
    p.rect(13, 32, 2, 4, "#6b6a64"); p.rect(17, 32, 2, 4, "#6b6a64");
    p.ellipse(9, 15, 5, 3, "#4a4a4f"); p.ellipse(23, 15, 5, 3, "#4a4a4f");
    p.rect(5, 8, 8, 6, "#8a8f98"); p.rect(5, 7, 8, 1, "#b7bcc4");
    p.rect(19, 10, 8, 3, "#c0402f");
    p.outline("#2a2a2e");
    return p;
  }
  function plantSprite() {
    var p = new Pix(T, T + 8);
    p.rect(9, 26, 14, 12, "#b5653a"); p.rect(8, 24, 16, 3, "#cc7a48"); p.rect(9, 36, 14, 2, "#8a4a28");
    p.ellipse(10, 16, 6, 9, "#2f8a46"); p.ellipse(22, 16, 6, 9, "#2f8a46"); p.ellipse(16, 10, 6, 10, "#3fa65a");
    p.ellipse(14, 8, 2, 4, "#6cc880");
    p.outline("#1c3d29");
    return p;
  }
  function counterSprite(bell) {
    var p = new Pix(T, T + 4);
    p.rect(0, 12, T, 8, "#c8956a"); p.rect(0, 12, T, 2, "#e6bb8b");
    p.rect(0, 20, T, 22, "#8d5a38");
    p.rect(2, 24, T - 4, 14, "#a06a42"); p.rect(2, 24, T - 4, 1, "#c08a5a");
    p.rect(0, 40, T, 2, "#5a3a22");
    if (bell) {
      p.ellipse(16, 10, 5, 4, "#f0c040"); p.rect(11, 12, 10, 2, "#c49a20"); p.rect(15, 5, 2, 2, "#8a6a10");
      p.rect(22, 8, 6, 4, "#f4efe3");
    }
    p.outline("#3a2415");
    return p;
  }
  function goodsSprite() {
    var p = new Pix(T, T + 12), i;
    p.rect(1, 0, 30, 44, "#6b4529");
    p.rect(3, 2, 26, 40, "#3f2a1a");
    var cols = ["#e86a7a", "#f4d35e", "#5aa8e0", "#7b5cc8", "#7a4a30", "#4aa070"];
    for (var row = 0; row < 3; row++) {
      var y = 4 + row * 13;
      p.rect(3, y + 11, 26, 2, "#8d5a38");
      for (i = 0; i < 5; i++) {
        var c = cols[(i + row * 2) % cols.length];
        p.rect(4 + i * 5, y + 4, 4, 7, c); p.rect(4 + i * 5, y + 4, 4, 1, "#ffffff");
      }
    }
    p.outline("#2a1b10");
    return p;
  }

  function bedSprite(right) {
    var p = new Pix(T, T + 8);
    var x0 = right ? 0 : 2, w = right ? 30 : 30;
    // 木のわく
    p.rect(x0, 18, w, 20, "#7a4e2d"); p.rect(x0, 18, w, 2, "#a06a42");
    // しきぶとん・かけぶとん
    p.rect(x0 + (right ? 0 : 3), 16, w - 3, 18, "#f2efe6");
    p.rect(x0 + (right ? 0 : 12), 20, w - (right ? 0 : 12), 16, "#5aa0d8");
    p.rect(x0 + (right ? 0 : 12), 20, w - (right ? 0 : 12), 2, "#8cc4ee");
    for (var i = 0; i < 4; i++) p.rect(x0 + (right ? 4 : 16) + i * 6, 26, 3, 3, "#8cc4ee");
    if (!right) {   // まくら+ヘッドボード
      p.rect(2, 6, 4, 32, "#6a4226"); p.rect(2, 6, 4, 2, "#a06a42");
      p.rect(7, 16, 11, 8, "#ffffff"); p.rect(7, 22, 11, 2, "#d9dde8");
    } else {        // フットボード
      p.rect(27, 12, 4, 26, "#6a4226"); p.rect(27, 12, 4, 2, "#a06a42");
    }
    p.rect(right ? 24 : 4, 36, 4, 4, "#4d321d");
    p.outline("#2a1b10");
    return p;
  }
  function deskSprite(lamp) {
    var p = new Pix(T, T + 8);
    p.rect(0, 14, T, 8, "#b57c46"); p.rect(0, 14, T, 2, "#d9a068");
    p.rect(0, 22, T, 16, "#8d5a38");
    p.rect(3, 25, 12, 11, "#a06a42"); p.rect(17, 25, 12, 11, "#a06a42");
    p.rect(8, 29, 3, 2, "#e6c070"); p.rect(22, 29, 3, 2, "#e6c070");
    if (lamp) {
      p.rect(22, 8, 2, 6, "#4a4a55"); p.rect(19, 4, 8, 4, "#f4d35e"); p.rect(18, 12, 10, 2, "#4a4a55");
      p.rect(4, 11, 10, 4, "#f6f0e0"); p.rect(4, 11, 10, 1, "#8aa0c8");
    } else {
      p.rect(6, 10, 3, 5, "#e86a7a"); p.rect(5, 9, 5, 1, "#e86a7a");   // 鉛筆立て
      p.rect(14, 12, 12, 3, "#4aa070");
    }
    p.outline("#3a2415");
    return p;
  }
  function stairsUpTile() {   // 2かいへ(奥にのぼる)
    var p = new Pix(T, T), i;
    p.rect(2, 0, T - 4, T, "#8a5a36");
    for (i = 0; i < 6; i++) {
      p.rect(2, i * 6, T - 4, 5, i % 2 ? "#a06a42" : "#b57c46");
      p.rect(2, i * 6 + 5, T - 4, 1, "#4d321d");
    }
    p.rect(0, 0, 3, T, "#5a3a22"); p.rect(T - 3, 0, 3, T, "#5a3a22");
    return p;
  }
  function stairsDownTile() { // 1かいへ(した向きにおりる)
    var p = new Pix(T, T), i;
    p.rect(2, 0, T - 4, T, "#3a2a22");
    for (i = 0; i < 6; i++) {
      p.rect(2, i * 6 + 2, T - 4, 4, i % 2 ? "#7a5030" : "#8d5a38");
      p.rect(2, i * 6 + 6, T - 4, 2, "#2a1b14");
    }
    p.rect(0, 0, 3, T, "#5a3a22"); p.rect(T - 3, 0, 3, T, "#5a3a22");
    return p;
  }

  function makeIndoorArt(mk, scene) {
    var rows = scene.rows, cols = rows[0].length, nrows = rows.length, theme = scene.theme;
    var ground = mk(cols * TILE, nrows * TILE), gctx = ground.getContext("2d");
    var seed = 77 + scene.id.length * 1000;
    var floorVariants = [];
    for (var v = 0; v < 3; v++) floorVariants.push(floorTile(rng(seed + v), theme).toCanvas(mk));
    var trim = wallTrimTile(theme).toCanvas(mk), face = wallFaceTile(theme).toCanvas(mk);
    var rug = rugTile().toCanvas(mk), mat = matTile().toCanvas(mk);
    var spr = {
      T: [tableSprite().toCanvas(mk), -16], S: [shelfSprite().toCanvas(mk), -24], K: [kitchenSprite().toCanvas(mk), -16],
      P: [plantSprite().toCanvas(mk), -16], C: [counterSprite(false).toCanvas(mk), -8], B: [counterSprite(true).toCanvas(mk), -8],
      G: [goodsSprite().toCanvas(mk), -24],
      L: [bedSprite(false).toCanvas(mk), -16], l: [bedSprite(true).toCanvas(mk), -16],
      D: [deskSprite(true).toCanvas(mk), -16], d: [deskSprite(false).toCanvas(mk), -16],
    };
    var stairUp = stairsUpTile().toCanvas(mk), stairDown = stairsDownTile().toCanvas(mk);
    var objects = [];
    for (var y = 0; y < nrows; y++) {
      for (var x = 0; x < cols; x++) {
        var ch = rows[y].charAt(x), px = x * TILE, py = y * TILE;
        if (ch === "W") {
          gctx.drawImage(y === 1 && x > 0 && x < cols - 1 ? face : trim, px, py);
          if (y === 0) gctx.drawImage(trim, px, py);
          continue;
        }
        gctx.drawImage(floorVariants[(x * 5 + y * 3) % 3], px, py);
        if (ch === "r") gctx.drawImage(rug, px, py);
        else if (ch === "M") gctx.drawImage(mat, px, py);
        else if (ch === "U") gctx.drawImage(stairUp, px, py);
        else if (ch === "N") gctx.drawImage(stairDown, px, py);
        else if (ch === "D" && x % 2 === 1) objects.push({ img: spr.d[0], x: px, y: py + spr.d[1], sortY: py + TILE - 6 });
        else if (spr[ch]) objects.push({ img: spr[ch][0], x: px, y: py + spr[ch][1], sortY: py + TILE - 6 });
      }
    }
    // 奥のかべの前にある家具(本だな・台所など)は、かべの上に立つので、かべの顔を足もとまでのばす
    return { ground: [ground, ground], objects: objects.sort(function (a, b) { return a.sortY - b.sortY; }), width: cols * TILE, height: nrows * TILE };
  }

  // ---- まとめ ----
  function makeArt(mk, map) {
    if (map.kind === "indoor") return makeIndoorArt(mk, map);
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
          if (tileAt(x, y - 1) === "D" || tileAt(x, y - 1) === "E") np.up = true;
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
    var house = houseSprite().toCanvas(mk), shop = shopSprite().toCanvas(mk);
    map.objects.forEach(function (o) {
      var img = o.type === "shop" ? shop : house;
      objects.push({ img: img, x: o.x * TILE, y: o.y * TILE, sortY: (o.y + o.h) * TILE - 4 });
    });
    objects.sort(function (a, b) { return a.sortY - b.sortY; });
    return { ground: ground, objects: objects, width: cols * TILE, height: rows * TILE };
  }

  H.makeArt = makeArt;
  H.Pix = Pix;
})(typeof window !== "undefined" ? window : globalThis);
