// ゲームの動き(絵に関係しない部分)。ブラウザでも Node でも動く。
//  - シーン(外・家の中・お店の中)と、ドアでの移動
//  - 姪っ子の1マス移動
//  - 犬やおじさんが「前の人が通ったマス」を順番にたどってついてくる動き(なかま)
//  - 立っているNPC(ママ・パパ・釣りのおじさん)
(function (g) {
  "use strict";
  var H = (g.Hanzo = g.Hanzo || {});

  var TILE = 64;                 // 1マスの大きさ(ドット)
  var MOVE_TIME = 0.26;          // 1マス進むのにかかる秒数
  var STEP = 1 / 120;            // 内部の時間刻み(秒)。固定刻みにして同期を安定させる
  var SOLID = {
    outdoor: { T: 1, "~": 1, F: 1, R: 1, H: 1, S: 1 },
    indoor: { W: 1, T: 1, S: 1, K: 1, P: 1, C: 1, B: 1, G: 1, L: 1, l: 1, D: 1 },
  };
  var DIRS = { down: [0, 1], left: [-1, 0], right: [1, 0], up: [0, -1] };
  var OPPOSITE = { down: "up", up: "down", left: "right", right: "left" };

  function dirFromDelta(dx, dy, fallback) {
    if (dx > 0) return "right";
    if (dx < 0) return "left";
    if (dy > 0) return "down";
    if (dy < 0) return "up";
    return fallback;
  }

  function Walker(tx, ty, dir, kind) {
    this.kind = kind;
    this.tx = tx; this.ty = ty;      // いるマス
    this.fx = tx; this.fy = ty;      // 出発したマス
    this.nx = tx; this.ny = ty;      // 向かっているマス
    this.dir = dir;
    this.moving = false;
    this.t = 0;                      // 0..1 の進み具合
    this.steps = 0;                  // 歩いたマス数(歩きアニメの左右切り替え用)
    this.queue = [];                 // これから向かうマス(なかま用)
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

  function World(scenes, startId) {
    this.scenes = scenes;
    this.npcLists = {};              // シーンごとのNPC(なかまになった人は消える)
    for (var id in scenes) {
      this.npcLists[id] = scenes[id].npcs.map(function (n) { var c = {}; for (var k in n) c[k] = n[k]; c.dir0 = c.dir; return c; });
    }
    this.followers = [];
    this.acc = 0;
    this.pendingWarp = null;
    var s = scenes[startId].spawn;
    this.enter(startId, s.x, s.y, s.dir, true);
    // 犬は最初からいっしょ
    this.addFollower(new Walker(this.player.tx, this.player.ty, s.dir, "dog"));
    this.placeFollowers();
  }

  World.prototype.tileAt = function (x, y) {
    var s = this.scene;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return s.kind === "indoor" ? "W" : "T";
    return s.rows[y].charAt(x);
  };
  World.prototype.npcAt = function (x, y) {
    var l = this.npcs;
    for (var i = 0; i < l.length; i++) if (l[i].x === x && l[i].y === y) return l[i];
    return null;
  };
  World.prototype.tileSolid = function (x, y) {
    return !!SOLID[this.scene.kind][this.tileAt(x, y)];
  };
  World.prototype.solid = function (x, y) {
    return this.tileSolid(x, y) || !!this.npcAt(x, y);
  };
  World.prototype.followerAt = function (x, y) {
    for (var i = 0; i < this.followers.length; i++) {
      var f = this.followers[i];
      if (f.tx === x && f.ty === y && !f.moving) return f;
    }
    return null;
  };

  // シーンに入る。followersがいたら、姪っ子のうしろに並べる
  World.prototype.enter = function (id, x, y, dir, keepFollowers) {
    this.sceneId = id;
    this.scene = this.scenes[id];
    this.npcs = this.npcLists[id];
    this.w = this.scene.rows[0].length;
    this.h = this.scene.rows.length;
    this.player = new Walker(x, y, dir, "niece");
    this.pendingWarp = null;
    if (!keepFollowers) this.placeFollowers();
  };

  World.prototype.placeFollowers = function () {
    var p = this.player, back = DIRS[OPPOSITE[p.dir]];
    var cx = p.tx, cy = p.ty;
    for (var i = 0; i < this.followers.length; i++) {
      var nx = cx + back[0], ny = cy + back[1];
      if (!this.solid(nx, ny)) { cx = nx; cy = ny; }
      var f = this.followers[i];
      f.tx = f.fx = f.nx = cx; f.ty = f.fy = f.ny = cy;
      f.moving = false; f.t = 0; f.queue = []; f.dir = p.dir;
    }
  };

  World.prototype.addFollower = function (w) {
    w.queue = w.queue || [];
    this.followers.push(w);
    return w;
  };

  // NPCをなかまにする。いまの最後尾のなかまの、となりまで歩いて合流する
  World.prototype.joinFollower = function (npcId) {
    var list = this.npcs, npc = null, i;
    for (i = 0; i < list.length; i++) if (list[i].id === npcId) { npc = list[i]; list.splice(i, 1); break; }
    if (!npc) return null;
    var f = new Walker(npc.x, npc.y, npc.dir, npc.kind);
    var lead = this.followers.length ? this.followers[this.followers.length - 1] : this.player;
    var path = this.pathTo(npc.x, npc.y, lead.tx, lead.ty);
    if (path === null) {                      // 道が見つからないときは、すぐ後ろにワープ
      f.tx = f.fx = f.nx = lead.tx; f.ty = f.fy = f.ny = lead.ty;
      path = [];
    } else {
      path.pop();                             // 先頭の人のマスの手前までで止まる
      if (lead.moving) path.push({ x: lead.tx, y: lead.ty });
    }
    f.queue = path;
    this.followers.push(f);
    return f;
  };

  // 幅優先探索(姪っ子のいるマスは通らない)。見つからなければ null
  World.prototype.pathTo = function (sx, sy, gx, gy) {
    var W = this.w, Hh = this.h, p = this.player, self = this;
    var seen = {}, q = [{ x: sx, y: sy, prev: null }];
    seen[sx + "," + sy] = true;
    for (var qi = 0; qi < q.length; qi++) {
      var c = q[qi];
      if (c.x === gx && c.y === gy) {
        var out = [];
        for (var n = c; n.prev; n = n.prev) out.unshift({ x: n.x, y: n.y });
        return out;
      }
      for (var d in DIRS) {
        var nx = c.x + DIRS[d][0], ny = c.y + DIRS[d][1], key = nx + "," + ny;
        if (nx < 0 || ny < 0 || nx >= W || ny >= Hh || seen[key]) continue;
        var goal = nx === gx && ny === gy;
        if (!goal && (self.solid(nx, ny) || (nx === p.tx && ny === p.ty))) continue;
        seen[key] = true;
        q.push({ x: nx, y: ny, prev: c });
      }
    }
    return null;
  };

  // 姪っ子が向いているマス
  World.prototype.facing = function () {
    var v = DIRS[this.player.dir];
    return { x: this.player.tx + v[0], y: this.player.ty + v[1] };
  };

  // 「はなす・しらべる」の相手。止まっているときだけ
  World.prototype.interactTarget = function () {
    if (this.player.moving) return null;
    var f = this.facing();
    var npc = this.npcAt(f.x, f.y);
    if (npc) return { type: "npc", npc: npc };
    var fol = this.followerAt(f.x, f.y);
    if (fol) return { type: "follower", follower: fol };
    var ch = this.tileAt(f.x, f.y);
    if (this.scene.kind === "indoor" && ch === "l") ch = "L";   // ベッドの右半分
    if (this.scene.talk && this.scene.talk[ch] || (this.scene.kind === "indoor" && "CB".indexOf(ch) >= 0)) {

      return { type: "tile", ch: ch, x: f.x, y: f.y };
    }
    return null;
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
    var p = this.player, fs = this.followers, i;

    // --- 姪っ子 ---
    var carry = 0;
    if (p.moving) {
      p.t += h / MOVE_TIME;
      if (p.t >= 1) {
        carry = p.t - 1;
        p.tx = p.nx; p.ty = p.ny; p.moving = false; p.t = 0; p.steps++;
        var warp = this.scene.warps && this.scene.warps[p.tx + "," + p.ty];
        if (warp) this.pendingWarp = warp;
      }
    }
    if (!p.moving && want && !this.pendingWarp) {
      p.dir = want;
      var v = DIRS[want], nx = p.tx + v[0], ny = p.ty + v[1];
      var busy = false;
      for (i = 0; i < fs.length; i++) {
        var f = fs[i];
        if (f.moving && ((f.tx === nx && f.ty === ny) || (f.nx === nx && f.ny === ny))) busy = true;
      }
      if (!this.solid(nx, ny) && !busy) {
        if (fs[0]) fs[0].queue.push({ x: p.tx, y: p.ty });   // 次に向かうのは、いま立っているマス
        p.start(nx, ny, carry);
      }
    }

    // --- なかま(前の人のあとを順番にたどる) ---
    for (i = 0; i < fs.length; i++) {
      var d = fs[i], next = fs[i + 1];
      var speed = d.queue.length > 2 ? 1.5 : 1;   // 遅れすぎたら少し急ぐ
      var dcarry = 0;
      if (d.moving) {
        d.t += (h * speed) / MOVE_TIME;
        if (d.t >= 1) {
          dcarry = d.t - 1;
          d.tx = d.nx; d.ty = d.ny; d.moving = false; d.t = 0; d.steps++;
        }
      }
      while (!d.moving && d.queue.length && d.queue[0].x === d.tx && d.queue[0].y === d.ty) d.queue.shift();
      if (!d.moving && d.queue.length) {
        var target = d.queue.shift();
        d.dir = dirFromDelta(target.x - d.tx, target.y - d.ty, d.dir);
        if (next) next.queue.push({ x: d.tx, y: d.ty });
        d.start(target.x, target.y, dcarry);
      }
    }
  };

  H.TILE = TILE;
  H.MOVE_TIME = MOVE_TIME;
  H.World = World;
  H.DIRS = DIRS;
  H.OPPOSITE = OPPOSITE;
  H.SOLID = SOLID;
  if (typeof module !== "undefined" && module.exports) module.exports = H;
})(typeof window !== "undefined" ? window : globalThis);
