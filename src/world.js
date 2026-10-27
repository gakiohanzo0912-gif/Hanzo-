// ゲームの動き(絵に関係しない部分)。ブラウザでも Node でも動く。
//  - マップの通れる/通れない判定
//  - 姪っ子の1マス移動
//  - 犬が「姪っ子が通ったマス」を順番にたどってついてくる動き
(function (g) {
  "use strict";
  var H = (g.Hanzo = g.Hanzo || {});

  var TILE = 64;                 // 1マスの大きさ(ドット)
  var MOVE_TIME = 0.26;          // 1マス進むのにかかる秒数
  var STEP = 1 / 120;            // 内部の時間刻み(秒)。固定刻みにして犬との同期を安定させる
  var SOLID = { T: 1, "~": 1, F: 1, R: 1, H: 1, D: 1 };
  var DIRS = { down: [0, 1], left: [-1, 0], right: [1, 0], up: [0, -1] };
  var OPPOSITE = { down: "up", up: "down", left: "right", right: "left" };

  function dirFromDelta(dx, dy, fallback) {
    if (dx > 0) return "right";
    if (dx < 0) return "left";
    if (dy > 0) return "down";
    if (dy < 0) return "up";
    return fallback;
  }

  function Walker(tx, ty, dir) {
    this.tx = tx; this.ty = ty;      // いるマス
    this.fx = tx; this.fy = ty;      // 出発したマス
    this.nx = tx; this.ny = ty;      // 向かっているマス
    this.dir = dir;
    this.moving = false;
    this.t = 0;                      // 0..1 の進み具合
    this.steps = 0;                  // 歩いたマス数(歩きアニメの左右切り替え用)
  }
  Walker.prototype.start = function (nx, ny, carry) {
    this.fx = this.tx; this.fy = this.ty;
    this.nx = nx; this.ny = ny;
    this.moving = true;
    this.t = carry || 0;
  };
  // 描画用の位置(マス単位の小数)
  Walker.prototype.pos = function () {
    if (!this.moving) return { x: this.tx, y: this.ty };
    var t = Math.min(1, this.t);
    return { x: this.fx + (this.nx - this.fx) * t, y: this.fy + (this.ny - this.fy) * t };
  };

  function World(map) {
    this.map = map;
    this.w = map.rows[0].length;
    this.h = map.rows.length;
    var s = map.spawn;
    this.player = new Walker(s.x, s.y, s.dir);
    // 犬は姪っ子の「後ろ」(向きの反対側)に置く
    var back = DIRS[OPPOSITE[s.dir]];
    var dx = s.x + back[0], dy = s.y + back[1];
    if (this.solid(dx, dy)) { dx = s.x; dy = s.y + 1; }
    this.dog = new Walker(dx, dy, s.dir);
    this.queue = [];                 // 犬がこれから向かうマス(姪っ子が通ったあと)
    this.acc = 0;
  }
  World.prototype.tileAt = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return "T";
    return this.map.rows[y].charAt(x);
  };
  World.prototype.solid = function (x, y) {
    return !!SOLID[this.tileAt(x, y)];
  };

  // want: "down" | "left" | "right" | "up" | null(押しているキー)
  World.prototype.update = function (dt, want) {
    this.acc += Math.min(dt, 0.1);   // タブを切り替えたあとなどの大きな dt は丸める
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.tick(STEP, want);
    }
  };

  World.prototype.tick = function (h, want) {
    var p = this.player, d = this.dog;

    // --- 姪っ子 ---
    var carry = 0;
    if (p.moving) {
      p.t += h / MOVE_TIME;
      if (p.t >= 1) {
        carry = p.t - 1;
        p.tx = p.nx; p.ty = p.ny; p.moving = false; p.t = 0; p.steps++;
      }
    }
    if (!p.moving && want) {
      p.dir = want;
      var v = DIRS[want], nx = p.tx + v[0], ny = p.ty + v[1];
      var dogBusyThere = d.moving && ((d.tx === nx && d.ty === ny) || (d.nx === nx && d.ny === ny));
      if (!this.solid(nx, ny) && !dogBusyThere) {
        this.queue.push({ x: p.tx, y: p.ty });   // 犬が次に向かうのは、いま立っているマス
        p.start(nx, ny, carry);
      }
    }

    // --- 犬 ---
    var speed = this.queue.length > 2 ? 1.5 : 1;   // 遅れすぎたら少し急ぐ
    var dcarry = 0;
    if (d.moving) {
      d.t += (h * speed) / MOVE_TIME;
      if (d.t >= 1) {
        dcarry = d.t - 1;
        d.tx = d.nx; d.ty = d.ny; d.moving = false; d.t = 0; d.steps++;
      }
    }
    if (!d.moving && this.queue.length) {
      var target = this.queue.shift();
      d.dir = dirFromDelta(target.x - d.tx, target.y - d.ty, d.dir);
      d.start(target.x, target.y, dcarry);
    }
  };

  H.TILE = TILE;
  H.MOVE_TIME = MOVE_TIME;
  H.World = World;
  H.DIRS = DIRS;
  H.SOLID = SOLID;
  if (typeof module !== "undefined" && module.exports) module.exports = H;
})(typeof window !== "undefined" ? window : globalThis);
