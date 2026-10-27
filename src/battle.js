// せんとうの ルール(絵に関係しない部分)。ブラウザでも Node でも動く。
//
//   var b = new Hanzo.Battle(party, ["bat", "babybat"], { boss: false, rng: Math.random });
//   b.party    … なかま [{ id, name, hp, maxhp, mp, maxmp, alive }]
//   b.enemies  … てき   [{ kind, name, hp, maxhp, alive }]
//   var events = b.resolve(cmds)   … 1ターンぶん(なかまのこうどう → てきのこうどう)
//        cmds[i] = { type: "attack", target: てきの番号 } | { type: "skill", target: てきの番号 }
//                | { type: "defend" } | { type: "flee" }      (なかま i ばんめの命令)
//        events  = 画面に順番に出していくもの。それぞれ text と、そのときの HP などを持つ。
//   b.result   … null | "win" | "lose" | "flee"
//
// 数字(HP・こうげき力など)は、下の MEMBERS / ENEMIES / BOSS を書き換えると変わります。
(function (g) {
  "use strict";
  var H = (g.Hanzo = g.Hanzo || {});

  // ---- なかま ----
  var MEMBERS = {
    niece: { name: "姪っ子", hp: 32, mp: 8, atk: [5, 8], text: "ぽかぽか たたいた!", skill: { name: "いたいの とんでけ", mp: 3 } },
    dog:   { name: "豆柴",   hp: 26, mp: 6, atk: [6, 10], text: "ガブッと かみついた!", skill: { name: "ワンワン ほえる", mp: 2 } },
    uncle: { name: "おじさん", hp: 44, mp: 6, atk: [8, 12], text: "つりざおで ぶんなぐった!", skill: { name: "よっぱらいパンチ", mp: 3 } },
  };

  // ---- ふつうのてき(ここに足せば、てきが増えます) ----
  //  money: やっつけたときにもらえるおこづかい  size: 画面での高さ(ドット)
  var ENEMIES = {
    bat:     { name: "コウモリ",     hp: 14, atk: [3, 6], money: 20, size: 120, text: "ばさばさと ひっかいてきた!" },
    babybat: { name: "ちびコウモリ", hp: 8,  atk: [2, 4], money: 10, size: 76,  text: "ちょこちょこ かみついてきた!" },
    soot:    { name: "まっくろ",     hp: 11, atk: [2, 5], money: 15, size: 96,  text: "もふもふ ぶつかってきた!", idle: 0.25, idleText: "ふわふわ ただよっている…" },
    potions: { name: "どくびん",     hp: 18, atk: [4, 7], money: 30, size: 124, text: "ビンから どくの けむりを ふきだした!" },
  };

  // ---- ボス 静代 ----
  // HP は なかまの人数でかわる(hpBase + hpPerMember × 人数)。dmg は人数ごとの 力の つよさ(1 = ふつう)
var BOSS = { name: "静代", kind: "shizuyo", hpBase: 45, hpPerMember: 40, dmg: { 1: 0.6, 2: 0.75, 3: 1.1 }, money: 0, size: 290 };

  // 出てくるてきの組み合わせ(ランダム)
  var GROUPS = [
    ["bat"], ["babybat", "babybat"], ["soot", "soot"], ["bat", "babybat"],
    ["potions"], ["soot", "babybat", "babybat"], ["soot"], ["babybat"],
  ];

  function Battle(party, enemyKinds, opts) {
    opts = opts || {};
    this.rng = opts.rng || Math.random;
    this.boss = !!opts.boss;
    this.turn = 0;
    this.result = null;
    this.money = 0;
    this.enraged = false;
    var n = party.length;
    this.party = party.map(function (p) {
      var m = MEMBERS[p.id];
      return { id: p.id, name: m.name, hp: p.hp, maxhp: p.maxhp || m.hp, mp: p.mp, maxmp: p.maxmp || m.mp, alive: p.hp > 0, def: false };
    });
    var self = this;
    this.enemies = enemyKinds.map(function (k, i) {
      if (k === "shizuyo") {
        var hp = BOSS.hpBase + BOSS.hpPerMember * n;
        return { kind: k, name: BOSS.name, hp: hp, maxhp: hp, alive: true, scared: 0, boss: true, money: BOSS.money };
      }
      var d = ENEMIES[k];
      return { kind: k, name: d.name, hp: d.hp, maxhp: d.hp, alive: true, scared: 0, money: d.money };
    });
    // 同じ名前が2体いたら A・B をつける
    var count = {};
    this.enemies.forEach(function (e) { count[e.name] = (count[e.name] || 0) + 1; });
    var seen = {};
    this.enemies.forEach(function (e) {
      if (count[e.name] > 1) { seen[e.name] = (seen[e.name] || 0) + 1; e.name += String.fromCharCode(64 + seen[e.name]); }
    });
  }

  Battle.prototype.ri = function (a, b) { return a + Math.floor(this.rng() * (b - a + 1)); };
  Battle.prototype.roll = function (r) { return this.ri(r[0], r[1]); };
  Battle.prototype.livingEnemies = function () { return this.enemies.filter(function (e) { return e.alive; }); };
  Battle.prototype.livingParty = function () { return this.party.filter(function (p) { return p.alive; }); };
  Battle.prototype.skillOf = function (i) { return MEMBERS[this.party[i].id].skill; };
  Battle.prototype.canSkill = function (i) {
    var p = this.party[i];
    return p.alive && p.mp >= this.skillOf(i).mp;
  };

  Battle.prototype.snap = function (text, extra) {
    var e = { text: text, hp: [], mp: [], eh: [], hit: null, pose: null, enraged: this.enraged };
    this.party.forEach(function (p) { e.hp.push(p.hp); e.mp.push(p.mp); });
    this.enemies.forEach(function (x) { e.eh.push(x.hp); });
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  };

  Battle.prototype.firstAliveEnemy = function () {
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].alive) return i;
    return -1;
  };

  // てきにダメージ。倒れたときの文も events に入れる
  Battle.prototype.hurtEnemy = function (ev, ti, dmg, text) {
    var t = this.enemies[ti];
    t.hp = Math.max(0, t.hp - dmg);
    ev.push(this.snap(text, { hit: { side: "enemy", i: ti, dmg: dmg } }));
    if (t.hp <= 0) {
      t.alive = false;
      this.money += t.money || 0;
      ev.push(this.snap(t.name + (t.boss ? " を やっつけた!" : " を たおした!"), { down: { side: "enemy", i: ti } }));
    }
  };

  Battle.prototype.hurtParty = function (ev, pi, dmg, text, pose) {
    var p = this.party[pi];
    if (p.def) dmg = Math.max(1, Math.ceil(dmg / 2));
    p.hp = Math.max(0, p.hp - dmg);
    ev.push(this.snap(text + "\n" + p.name + "は " + dmg + " の ダメージを うけた!", { hit: { side: "party", i: pi, dmg: dmg }, pose: pose || null }));
    if (p.hp <= 0) {
      p.alive = false;
      ev.push(this.snap(p.name + "は たおれた!", { down: { side: "party", i: pi } }));
    }
  };

  Battle.prototype.partyActs = function (ev, i, cmd) {
    var p = this.party[i], m = MEMBERS[p.id];
    if (!p.alive || !cmd) return;
    if (cmd.type === "defend") {
      p.def = true;
      ev.push(this.snap(p.name + "は みを まもっている。"));
      return;
    }
    if (cmd.type === "attack" || (cmd.type === "skill" && p.id === "uncle")) {
      var ti = cmd.target;
      if (ti == null || !this.enemies[ti] || !this.enemies[ti].alive) ti = this.firstAliveEnemy();
      if (ti < 0) return;
      var t = this.enemies[ti];
      if (cmd.type === "skill") {   // よっぱらいパンチ
        p.mp -= m.skill.mp;
        if (this.rng() < 0.75) {
          var big = this.ri(18, 26);
          this.hurtEnemy(ev, ti, big, p.name + "の よっぱらいパンチ!\n" + t.name + "に " + big + " の ダメージ!");
        } else {
          ev.push(this.snap(p.name + "の よっぱらいパンチ!\nしかし ふらついて はずした!"));
        }
        return;
      }
      var dmg = this.roll(m.atk), crit = this.rng() < 0.1;
      if (crit) dmg = Math.ceil(dmg * 1.6);
      this.hurtEnemy(ev, ti, dmg, p.name + "の こうげき! " + m.text + (crit ? "\nかいしんの いちげき!" : "") + "\n" + t.name + "に " + dmg + " の ダメージ!");
      return;
    }
    if (cmd.type === "skill") {
      p.mp -= m.skill.mp;
      if (p.id === "niece") {   // いたいの とんでけ: いちばん弱っているなかまを回復
        var best = null;
        this.party.forEach(function (q) { if (q.alive && (!best || q.hp / q.maxhp < best.hp / best.maxhp)) best = q; });
        var heal = 16 + this.ri(0, 6), before = best.hp;
        best.hp = Math.min(best.maxhp, best.hp + heal);
        ev.push(this.snap(p.name + "は 「いたいの いたいの とんでけ〜!」\n" + best.name + "の HPが " + (best.hp - before) + " かいふくした!", { heal: { i: this.party.indexOf(best) } }));
      } else {                  // ワンワン ほえる: てきをおびえさせる
        var bossHere = this.enemies.some(function (e) { return e.alive && e.boss; });
        if (bossHere) {
          this.enemies.forEach(function (e) { if (e.alive) e.scared = 1; });
          ev.push(this.snap(p.name + "は 「ワンワン!!」と ほえた!\n" + BOSS.name + "は ちょっと ひるんだ!"));
        } else {
          this.enemies.forEach(function (e) { if (e.alive) e.scared = 2; });
          ev.push(this.snap(p.name + "は 「ワンワン!!」と ほえた!\nてきは おびえている!"));
        }
      }
    }
  };

  Battle.prototype.randomTarget = function () {
    var l = this.party.map(function (p, i) { return p.alive ? i : -1; }).filter(function (i) { return i >= 0; });
    return l.length ? l[this.ri(0, l.length - 1)] : -1;
  };

  Battle.prototype.enemyActs = function (ev, ei) {
    var e = this.enemies[ei];
    if (!e.alive || this.livingParty().length === 0) return;
    if (e.boss) { this.bossActs(ev, e); return; }
    var d = ENEMIES[e.kind];
    if (e.scared > 0 && this.rng() < 0.6) { ev.push(this.snap(e.name + "は おびえて うごけない!")); return; }
    if (d.idle && this.rng() < d.idle) { ev.push(this.snap(e.name + "は " + d.idleText)); return; }
    var pi = this.randomTarget();
    this.hurtParty(ev, pi, this.roll(d.atk), e.name + "の こうげき! " + d.text);
  };

  // 静代のこうどう
  Battle.prototype.bossActs = function (ev, e) {
    if (e.scared > 0 && this.rng() < 0.35) { ev.push(this.snap(BOSS.name + "は ワンワンに ひるんで うごけない!")); return; }
    var mul = (this.enraged ? 1.25 : 1) * (BOSS.dmg[this.party.length] || 1), r = this.rng() * 100;
    var broom = this.enraged ? 30 : 40, pot = this.enraged ? 55 : 65, smoke = this.enraged ? 95 : 85;
    var self = this, pi;
    if (r < broom) {
      pi = this.randomTarget();
      this.hurtParty(ev, pi, Math.round(this.ri(8, 12) * mul), BOSS.name + "は ほうきで ぶんぶん なぐってきた!", "grin");
    } else if (r < pot) {
      pi = this.randomTarget();
      this.hurtParty(ev, pi, Math.round(this.ri(9, 13) * mul), BOSS.name + "は あやしい くすりを なげつけた!", "pot");
    } else if (r < smoke) {
      ev.push(this.snap(BOSS.name + "は まほうの けむりを ふきだした!", { pose: "cast" }));
      this.party.forEach(function (p, i) {
        if (p.alive) self.hurtParty(ev, i, Math.round(self.ri(5, 8) * mul), "けむりが みんなを つつむ!", "cast");
      });
    } else {
      var lines = ["ヒッヒッヒ…「そんな もんかい?」", "「あたしの ちょこは たかいよ…ヒッヒッヒ!」", "「ほれほれ、かかっておいで!」"];
      ev.push(this.snap(BOSS.name + ": " + lines[this.ri(0, lines.length - 1)], { pose: "grin" }));
    }
  };

  // 1ターンぶんを進める
  Battle.prototype.resolve = function (cmds) {
    var ev = [], self = this, i;
    this.turn++;
    this.party.forEach(function (p) { p.def = false; });

    // にげる(ボス戦はにげられない)
    var fleeBy = -1;
    for (i = 0; i < this.party.length; i++) if (this.party[i].alive && cmds[i] && cmds[i].type === "flee") { fleeBy = i; break; }
    if (fleeBy >= 0) {
      if (this.boss) {
        ev.push(this.snap(this.party[fleeBy].name + "は にげようとした!\nしかし " + BOSS.name + "は にがしてくれない!"));
      } else if (this.rng() < 0.65) {
        ev.push(this.snap("みんなは うまく にげきれた!"));
        this.result = "flee";
        ev[ev.length - 1].result = "flee";
        return ev;
      } else {
        ev.push(this.snap("にげようとした! しかし まわりこまれた!"));
      }
    }

    for (i = 0; i < this.party.length; i++) {
      if (i === fleeBy) continue;
      this.partyActs(ev, i, cmds[i]);
      if (this.livingEnemies().length === 0) break;
    }
    if (this.livingEnemies().length === 0) return this.finish(ev, "win");

    for (i = 0; i < this.enemies.length; i++) {
      this.enemyActs(ev, i);
      // ボスは HP が減ると本気になる
      var e = this.enemies[i];
      if (e.boss && e.alive) {
        if (!this.enraged && e.hp < e.maxhp * 0.45) {
          this.enraged = true;
          ev.push(this.snap(BOSS.name + "は ほんきを だした!\nまわりに まほうじんが うかびあがる!", { pose: "rage", enraged: true }));
        } else if (this.enraged && this.rng() < 0.35 && this.livingParty().length) {
          this.bossActs(ev, e);
        }
      }
      if (this.livingParty().length === 0) return this.finish(ev, "lose");
    }
    this.enemies.forEach(function (x) { if (x.scared > 0) x.scared--; });
    return ev;
  };

  Battle.prototype.finish = function (ev, res) {
    this.result = res;
    if (res === "win") {
      ev.push(this.snap(this.boss ? "しずよに しょうり した!" : "てきを やっつけた!"));
      if (this.money > 0) ev.push(this.snap("おこづかい ¥" + this.money + " を ひろった!"));
    } else {
      ev.push(this.snap("なかまは ぜんいん たおれてしまった…"));
    }
    ev[ev.length - 1].result = res;
    return ev;
  };

  // ランダムなてきの組み合わせ
  function randomGroup(rng) {
    rng = rng || Math.random;
    return GROUPS[Math.floor(rng() * GROUPS.length)].slice();
  }

  H.Battle = Battle;
  H.MEMBERS = MEMBERS;
  H.ENEMIES = ENEMIES;
  H.BOSS = BOSS;
  H.randomGroup = randomGroup;
  if (typeof module !== "undefined" && module.exports) module.exports = H;
})(typeof window !== "undefined" ? window : globalThis);
