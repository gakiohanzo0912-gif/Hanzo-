// 画面の表示・キー/タッチ操作・会話ウィンドウ・ゲームループ
(function () {
  "use strict";
  var H = window.Hanzo;
  var TILE = H.TILE;
  var VIEW_W = 768, VIEW_H = 512;      // 画面は 12×8 マス
  var BOB_PX = 2;                      // 前後向きで歩くときの上下ゆれ
  var FONT = "'Hiragino Maru Gothic ProN','Yu Gothic','Meiryo',sans-serif";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  function mk(w, h) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  // ---------------------------------------------------------- 読み込み
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error(src + " を読み込めませんでした")); };
      img.src = src;
    });
  }

  var KINDS = ["niece", "dog", "uncle", "mama", "papa"];
  var ENEMY_KINDS = ["shizuyo", "shizuyo_grin", "shizuyo_pot", "shizuyo_cast", "shizuyo_rage", "bat", "babybat", "soot", "potions"];
  var sprites = {}, arts = {}, enemyImgs = {};
  var world = null, story = null;
  var ready = false, loadError = null;

  Promise.all(KINDS.map(function (k) { return loadImage("assets/sprites/" + k + ".png?v=8"); })
      .concat(ENEMY_KINDS.map(function (k) { return loadImage("assets/enemies/" + k + ".png?v=8"); })))
    .then(function (imgs) {
      KINDS.forEach(function (k, i) { sprites[k] = imgs[i]; });
      ENEMY_KINDS.forEach(function (k, i) { enemyImgs[k] = imgs[KINDS.length + i]; });
      world = new H.World(H.SCENES, "room2");
      story = new H.Story(world, ui);
      world.onStep = function (id, x, y, ch) { story.onStep(id, x, y, ch); };
      ready = true;
    })
    .catch(function (e) { loadError = e; });

  function artFor(id) {
    if (!arts[id]) arts[id] = H.makeArt(mk, H.SCENES[id]);
    return arts[id];
  }

  // ---------------------------------------------------------- 会話ウィンドウ
  var intro = null;        // はじまりのおはなし(黒い画面)
  var title = { t: 0 };    // タイトル画面(はじめたら null)
  var dlg = null;          // いま出ている会話
  var ending = null;       // 第1章クリアの表示
  var fade = null;         // 場面転換の暗転
  var clock = 0, anim = 0;
  var started = false, showGrid = false;

  function wrap(str, maxW, size) {
    ctx.font = "bold " + size + "px " + FONT;
    var lines = [], cur = "";
    for (var i = 0; i < str.length; i++) {
      var c = str.charAt(i);
      if (c === "\n") { lines.push(cur); cur = ""; continue; }
      if (ctx.measureText(cur + c).width > maxW) { lines.push(cur); cur = c; } else cur += c;
    }
    lines.push(cur);
    return lines;
  }

  function openDialog(who, pages, choices, cb) {
    dlg = { who: who, pages: pages.slice(), i: 0, shown: 0, choices: choices || null, sel: 0, cb: cb || null, wrapped: null };
  }
  var ui = {
    say: function (who, lines, cb) { openDialog(who, lines, null, cb); },
    ask: function (who, text, options, cb) { openDialog(who, [text], options, cb); },
    ending: function () { ending = { t: 0 }; },
    battle: function (spec, cb) { startBattle(spec, cb); },
  };

  function pageText() { return dlg.pages[dlg.i]; }
  function pageLines() {
    if (!dlg.wrapped || dlg.wrapped.i !== dlg.i) dlg.wrapped = { i: dlg.i, lines: wrap(pageText(), 660, 26) };
    return dlg.wrapped.lines;
  }
  function pageLength() { return pageText().replace(/\n/g, "").length; }

  function advanceDialog() {
    if (dlg.shown < pageLength()) { dlg.shown = pageLength(); return; }
    var last = dlg.i >= dlg.pages.length - 1;
    if (!last) { dlg.i++; dlg.shown = 0; return; }
    var d = dlg;
    dlg = null;
    if (d.choices) { if (d.cb) d.cb(d.sel); } else if (d.cb) d.cb();
  }

  // ---------------------------------------------------------- 入力
  var held = [];                       // 押している向き(あとから押したものを優先)
  function press(id, dir) {
    release(id);
    held.push({ id: id, dir: dir });
    started = true;
    if (bt && bt.menu && (dir === "up" || dir === "down") && (bt.phase === "cmd" || bt.phase === "target")) {
      var bn = bt.menu.items.length;
      bt.menu.sel = (bt.menu.sel + (dir === "down" ? 1 : bn - 1)) % bn;
    }
    if (dlg && dlg.choices && dlg.shown >= pageLength() && (dir === "up" || dir === "down")) {
      var n = dlg.choices.length;
      dlg.sel = (dlg.sel + (dir === "down" ? 1 : n - 1)) % n;
    }
  }
  function release(id) {
    held = held.filter(function (h) { return h.id !== id; });
  }
  function currentDir() { return held.length ? held[held.length - 1].dir : null; }

  // 「はなす・しらべる」ボタン(Z / Enter / スペース / 画面の A)
  function onAction() {
    started = true;
    if (!ready || fade) return;
    if (title) { if (title.t > 0.4) { title = null; intro = { i: 0, shown: 0 }; } return; }
    if (intro) {
      var len = INTRO[intro.i].replace(/\n/g, "").length;
      if (intro.shown < len) intro.shown = len;
      else if (intro.i < INTRO.length - 1) { intro.i++; intro.shown = 0; }
      else { intro = null; fade = { a: 1, phase: "in" }; }
      return;
    }
    if (bt) { battleAction(); return; }
    if (ending) { if (ending.t > 0.8) ending = null; return; }
    if (dlg) { advanceDialog(); return; }
    var t = world.interactTarget();
    if (!t) return;
    if (t.type === "npc" && !t.npc.pose) t.npc.dir = H.OPPOSITE[world.player.dir];   // 話す相手はこっちを向く
    story.interact(t);
  }

  var KEYS = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
  };
  var ACTION_KEYS = { z: 1, Z: 1, Enter: 1, " ": 1 };

  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "g" || e.key === "G") { if (!e.repeat) showGrid = !showGrid; return; }
    if (ACTION_KEYS[e.key]) { e.preventDefault(); if (!e.repeat) onAction(); return; }
    var dir = KEYS[e.key];
    if (!dir) return;
    e.preventDefault();
    if (!e.repeat) press("key-" + e.key.toLowerCase(), dir);
  });
  window.addEventListener("keyup", function (e) {
    if (KEYS[e.key]) release("key-" + e.key.toLowerCase());
  });
  // 長押し・ドラッグで文字や画像が選択されたり、メニューが出たりしないようにする
  ["selectstart", "dragstart", "contextmenu"].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); });
  });
  function clearInput() { held = []; }
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", clearInput);

  // 画面のボタン(スマホ・タブレット用)
  Array.prototype.forEach.call(document.querySelectorAll("#pad button"), function (b) {
    var dir = b.getAttribute("data-dir"), id = "pad-" + dir;
    b.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (_) { /* 古いブラウザは無視 */ }
      press(id, dir);
      b.classList.add("on");
    });
    function up(e) { e.preventDefault(); release(id); b.classList.remove("on"); }
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("lostpointercapture", up);
    b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  });
  var abtn = document.getElementById("abtn");
  if (abtn) {
    abtn.addEventListener("pointerdown", function (e) { e.preventDefault(); abtn.classList.add("on"); onAction(); });
    var aup = function (e) { e.preventDefault(); abtn.classList.remove("on"); };
    abtn.addEventListener("pointerup", aup);
    abtn.addEventListener("pointercancel", aup);
  }
  // 会話中は画面をタップしても進む
  canvas.addEventListener("pointerdown", function (e) {
    if (title || intro || dlg || ending || bt) { e.preventDefault(); onAction(); }
  });

  // ---------------------------------------------------------- 画面サイズに合わせる
  function fit() {
    var ctl = document.getElementById("controls");
    var padH = ctl && getComputedStyle(ctl).display !== "none" ? ctl.offsetHeight + 12 : 0;
    var head = document.getElementById("head").offsetHeight;
    var foot = document.getElementById("foot");
    var footH = foot && getComputedStyle(foot).display !== "none" ? foot.offsetHeight : 0;
    var availW = window.innerWidth - 16;
    var availH = window.innerHeight - padH - head - footH - 24;
    var s = Math.min(availW / VIEW_W, availH / VIEW_H);
    if (s >= 1) s = Math.floor(s);      // 整数倍のほうがドットがきれいに見える
    s = Math.max(0.3, s);
    canvas.style.width = Math.floor(VIEW_W * s) + "px";
    canvas.style.height = Math.floor(VIEW_H * s) + "px";
  }
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", fit);
  fit();

  // ---------------------------------------------------------- 描画
  var SHADOW = { dog: 24, uncle: 20, niece: 15, mama: 15, papa: 15 };

  // 人・犬を1体描く(x, y は足もとのマス座標(小数))
  function actor(kind, x, y, dir, walker, pose, step) {
    var meta = window.SPRITE_META[kind];
    var dm = meta.dirs[dir] || meta.dirs.down;
    var feetX = x * TILE + TILE / 2;
    var feetY = y * TILE + 58;
    var row = dm.row, fi = dm.idle, bob = 0;
    if (pose && meta.extra && meta.extra[pose]) {
      row = meta.extra[pose].row;
      fi = [0, 1, 2, 1][Math.floor(anim * 1.4) % 4];
    } else if (step) {   // その場で足ぶみ(ドラクエの村人のように)
      var sl = dm.walk.length;
      fi = dm.walk[Math.floor(anim * 3.5) % sl];
    } else if (walker && walker.moving) {
      var len = dm.walk.length;
      var k = walker.steps * 2 + (walker.t >= 0.5 ? 1 : 0);
      var idx = Math.floor((k * len) / 4) % len;
      fi = dm.walk[idx];
      bob = dm.bob[idx] * BOB_PX;
    }
    return {
      sortY: feetY,
      draw: function (camX, camY) {
        ctx.fillStyle = "rgba(20, 30, 20, 0.28)";
        ctx.beginPath();
        ctx.ellipse(Math.round(feetX - camX), Math.round(feetY - camY - 1), SHADOW[kind] || 15, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(
          sprites[kind],
          fi * meta.cellW, row * meta.cellH, meta.cellW, meta.cellH,
          Math.round(feetX - meta.anchorX - camX), Math.round(feetY - meta.anchorY - camY - bob),
          meta.cellW, meta.cellH
        );
      },
    };
  }

  function text(str, x, y, size, align, alpha) {
    ctx.font = "bold " + size + "px " + FONT;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(20,24,32,0.85)";
    ctx.strokeText(str, x, y);
    ctx.fillStyle = "#fff";
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  // ドラクエ風のウィンドウ(黒地に白いふち)
  function windowBox(x, y, w, h) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.fillStyle = "#0b0f2a";
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = "#0b1240";
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  }
  function plainText(str, x, y, size, color) {
    ctx.font = "bold " + size + "px " + FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color || "#fff";
    ctx.fillText(str, x, y);
  }

  function drawDialog(top) {
    var bx = 28, by = top ? 78 : 330, bw = 712, bh = 152;
    windowBox(bx, by, bw, bh);
    if (dlg.who) {
      windowBox(bx + 12, by - 28, ctx.measureText ? Math.max(90, dlg.who.length * 24 + 28) : 120, 36);
      plainText(dlg.who, bx + 26, by - 9, 22, "#ffe58a");
    }
    var lines = pageLines(), left = Math.floor(dlg.shown), ly = by + 34;
    for (var i = 0; i < lines.length && left > 0; i++) {
      var s = lines[i].slice(0, left);
      left -= lines[i].length;
      plainText(s, bx + 26, ly + i * 38, 26);
    }
    var done = dlg.shown >= pageLength();
    if (done && !dlg.choices && Math.floor(anim * 2) % 2 === 0) {
      plainText("▼", bx + bw - 44, by + bh - 24, 22);
    }
    if (done && dlg.choices) {
      var cw = 190, ch = dlg.choices.length * 44 + 20, cx = bx + bw - cw, cy = top ? by + bh + 12 : by - ch - 12;
      windowBox(cx, cy, cw, ch);
      for (var j = 0; j < dlg.choices.length; j++) {
        plainText((j === dlg.sel ? "▶ " : "　") + dlg.choices[j], cx + 14, cy + 32 + j * 44, 26);
      }
    }
  }

  function drawHud() {
    ctx.fillStyle = "rgba(11,15,42,0.78)";
    ctx.fillRect(0, 0, VIEW_W, 34);
    plainText("▶ " + story.objective(), 12, 18, 18, "#fff");
    var items = story.items();
    if (items.length) {
      ctx.textAlign = "right";
      ctx.font = "bold 16px " + FONT;
      ctx.fillStyle = "#ffe58a";
      ctx.fillText(items.join("  "), VIEW_W - 12, 18);
    }
  }


  // ---------------------------------------------------------- タイトル画面
  var STARS = [];
  (function () {
    function r(n) { var v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }
    for (var i = 0; i < 70; i++) {
      STARS.push({ x: Math.floor(r(i) * VIEW_W), y: Math.floor(r(i + 100) * 300), p: r(i + 200) * 6.28, big: i % 9 === 0 });
    }
  })();

  function logoText(str, cx, cy, size) {
    ctx.font = "900 " + size + "px Georgia,'Times New Roman','Hiragino Mincho ProN',serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    // ふち(濃い赤→黒)
    ctx.lineWidth = 16; ctx.strokeStyle = "#1a0505"; ctx.strokeText(str, cx, cy + 5);
    ctx.lineWidth = 10; ctx.strokeStyle = "#8a1010"; ctx.strokeText(str, cx, cy + 3);
    // 金色のグラデーション
    var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, cy - size / 2, 0, cy + size / 2) : null;
    if (g) { g.addColorStop(0, "#fff7c2"); g.addColorStop(0.45, "#ffd23a"); g.addColorStop(0.55, "#e89a10"); g.addColorStop(1, "#ffe27a"); }
    ctx.fillStyle = g || "#ffd23a";
    ctx.fillText(str, cx, cy);
    ctx.lineWidth = 2; ctx.strokeStyle = "#fff7d8"; ctx.strokeText(str, cx, cy - 1);
  }

  function drawTitle() {
    var sky = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, VIEW_H) : null;
    if (sky) { sky.addColorStop(0, "#050a2a"); sky.addColorStop(0.6, "#16307a"); sky.addColorStop(1, "#3a5ca8"); }
    ctx.fillStyle = sky || "#16307a";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (var i = 0; i < STARS.length; i++) {
      var st = STARS[i], tw = 0.5 + 0.5 * Math.sin(anim * 2 + st.p);
      ctx.fillStyle = "rgba(255,255,230," + (0.35 + 0.65 * tw) + ")";
      ctx.fillRect(st.x, st.y, st.big ? 4 : 2, st.big ? 4 : 2);
      if (st.big && tw > 0.6) { ctx.fillRect(st.x - 3, st.y + 1, 10, 2); ctx.fillRect(st.x + 1, st.y - 3, 2, 10); }
    }
    // 丘(草)
    ctx.fillStyle = "#1f5a2c";
    ctx.beginPath(); ctx.ellipse(220, 560, 560, 190, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2c7a3c";
    ctx.beginPath(); ctx.ellipse(600, 600, 520, 190, 0, 0, Math.PI * 2); ctx.fill();
    // ロゴ
    var drop = Math.min(1, title.t / 0.8), ease = 1 - Math.pow(1 - drop, 3);
    ctx.globalAlpha = ease;
    logoText("SUGIURA", VIEW_W / 2, 120 - (1 - ease) * 40, 96);
    logoText("QUEST", VIEW_W / 2, 215 - (1 - ease) * 40, 96);
    ctx.globalAlpha = 1;
    var sub = Math.max(0, Math.min(1, title.t - 0.8));
    text("〜 姪っ子と豆柴の冒険 〜", VIEW_W / 2, 290, 24, "center", sub);
    // 主人公たち
    var nm = window.SPRITE_META.niece, dm = window.SPRITE_META.dog;
    var bob = Math.floor(anim * 2) % 2;
    ctx.drawImage(sprites.niece, 0, nm.dirs.right.row * nm.cellH, nm.cellW, nm.cellH, VIEW_W / 2 - 74 - nm.anchorX, 476 - nm.anchorY, nm.cellW, nm.cellH);
    ctx.drawImage(sprites.dog, 0, dm.dirs.right.row * dm.cellH, dm.cellW, dm.cellH, VIEW_W / 2 + 6 - dm.anchorX, 476 - dm.anchorY - bob * 2, dm.cellW, dm.cellH);
    if (title.t > 1.2) {
      windowBox(VIEW_W / 2 - 150, 322, 300, 56);
      plainText("▶ ぼうけんを はじめる", VIEW_W / 2 - 126, 350, 24, Math.floor(anim * 2) % 2 ? "#fff" : "#ffe58a");
    }
    ctx.textAlign = "center";
    plainText("", 0, 0, 1);
    text("Z / Enter / タップ で スタート", VIEW_W / 2, 500, 14, "center", title.t > 1.2 ? 0.8 : 0);
  }


  // ---------------------------------------------------------- はじまりのおはなし
  var INTRO = [
    "2026年9月15日　はれ",
    "きょうは おやすみの ひ。\nあさから ごろごろ してます。",
    "2かいの へやで、まめしばと\nのんびり していたら…",
    "したから いいにおいが してきた。\nママが ごはんを つくっているみたい。",
  ];
  function drawIntro() {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    var lines = wrap(INTRO[intro.i], 600, 30), left = Math.floor(intro.shown);
    for (var i = 0; i < lines.length && left > 0; i++) {
      plainText(lines[i].slice(0, left), 84, 190 + i * 52, 30);
      left -= lines[i].length;
    }
    if (intro.shown >= INTRO[intro.i].replace(/\n/g, "").length && Math.floor(anim * 2) % 2 === 0) plainText("▼", VIEW_W - 90, VIEW_H - 70, 22);
  }

  // ---------------------------------------------------------- せんとう
  var bt = null;      // いまの せんとう(なければ null)

  function startBattle(spec, cb) {
    var eng = new H.Battle(spec.members, spec.enemies, { boss: spec.boss, rng: spec.rng });
    held = [];
    bt = {
      eng: eng, cb: cb, boss: !!spec.boss, phase: "flash", t: 0, msg: null,
      queue: [], cmdI: -1, cmds: [], menu: null, pose: null, shake: 0,
      dhp: eng.party.map(function (p) { return p.hp; }), thp: eng.party.map(function (p) { return p.hp; }),
      dmp: eng.party.map(function (p) { return p.mp; }), tmp: eng.party.map(function (p) { return p.mp; }),
      deh: eng.enemies.map(function (e) { return e.hp; }), teh: eng.enemies.map(function (e) { return e.hp; }),
      alpha: eng.enemies.map(function () { return 1; }),
      hitE: eng.enemies.map(function () { return 0; }), hitP: eng.party.map(function () { return 0; }),
      healP: eng.party.map(function () { return 0; }), fx: [],
      intro: spec.intro || introText(eng),
    };
  }
  function introText(eng) {
    var names = [];
    eng.enemies.forEach(function (e) {
      var n = (H.ENEMIES[e.kind] || {}).name || e.name;
      if (names.indexOf(n) < 0) names.push(n);
    });
    return names.join("と ") + (names.length === 1 && eng.enemies.length > 1 ? "たち" : "") + "が あらわれた!";
  }

  function btSay(text, after) {
    bt.phase = "msg";
    bt.menu = null;
    bt.msg = { text: text, shown: 0, after: after, wrapped: null };
  }
  function btMsgLen() { return bt.msg.text.replace(/\n/g, "").length; }

  function btNextCommand() {
    var eng = bt.eng;
    bt.pose = null;
    do { bt.cmdI++; } while (bt.cmdI < eng.party.length && !eng.party[bt.cmdI].alive);
    if (bt.cmdI >= eng.party.length) { btRunTurn(); return; }
    btCommandMenu();
  }
  function btCommandMenu() {
    var eng = bt.eng, p = eng.party[bt.cmdI];
    bt.phase = "cmd";
    bt.msg = null;
    bt.menu = { sel: 0, items: ["たたかう", eng.skillOf(bt.cmdI).name, "ぼうぎょ", "にげる"], prompt: p.name + "は どうする?" };
  }
  function btRecord(cmd) { bt.cmds[bt.cmdI] = cmd; btNextCommand(); }
  function btPickTarget(type) {
    var eng = bt.eng, list = [];
    eng.enemies.forEach(function (e, i) { if (e.alive) list.push(i); });
    if (list.length === 1) { btRecord({ type: type, target: list[0] }); return; }
    bt.phase = "target";
    bt.menu = {
      sel: 0, ids: list, type: type, prompt: "どれを ねらう?",
      items: list.map(function (i) { return eng.enemies[i].name; }).concat(["もどる"]),
    };
  }

  function btRunTurn() {
    bt.queue = bt.eng.resolve(bt.cmds);
    bt.cmds = []; bt.cmdI = -1;
    btPlayNext();
  }
  function btPlayNext() {
    if (!bt.queue.length) {
      if (bt.eng.result) { btEnd(); return; }
      btNextCommand();
      return;
    }
    var ev = bt.queue.shift(), i;
    for (i = 0; i < ev.hp.length; i++) { bt.thp[i] = ev.hp[i]; bt.tmp[i] = ev.mp[i]; }
    for (i = 0; i < ev.eh.length; i++) bt.teh[i] = ev.eh[i];
    if (ev.pose) bt.pose = ev.pose;
    else if (ev.enraged) bt.pose = bt.pose || "rage";
    if (ev.hit) {
      if (ev.hit.side === "enemy") {
        bt.hitE[ev.hit.i] = 0.55;
        var pos = enemyPos(ev.hit.i);
        bt.fx.push({ x: pos.x, y: pos.y - pos.h * 0.55, text: String(ev.hit.dmg), t: 0, col: "#fff" });
      } else {
        bt.hitP[ev.hit.i] = 0.6;
        bt.shake = 0.28;
        bt.fx.push({ x: 160, y: 56 + ev.hit.i * 38, text: "-" + ev.hit.dmg, t: 0, col: "#ff8c8c" });
      }
    }
    if (ev.heal) bt.healP[ev.heal.i] = 0.7;
    btSay(ev.text, btPlayNext);
  }

  function btEnd() {
    var eng = bt.eng;
    bt.phase = "out"; bt.t = 0; bt.msg = null; bt.menu = null;
    bt.res = { result: eng.result, party: eng.party, money: eng.money };
  }

  function battleAction() {
    if (!bt) return;
    if (bt.phase === "flash" || bt.phase === "out") return;
    if (bt.phase === "msg") {
      if (bt.msg.shown < btMsgLen()) { bt.msg.shown = btMsgLen(); return; }
      var after = bt.msg.after;
      bt.msg = null;
      after();
      return;
    }
    var sel = bt.menu.sel, eng = bt.eng;
    if (bt.phase === "cmd") {
      if (sel === 0) btPickTarget("attack");
      else if (sel === 1) {
        if (!eng.canSkill(bt.cmdI)) { btSay("MPが たりない!", btCommandMenu); return; }
        if (eng.party[bt.cmdI].id === "uncle") btPickTarget("skill"); else btRecord({ type: "skill" });
      }
      else if (sel === 2) btRecord({ type: "defend" });
      else {
        if (bt.boss) { btSay(H.BOSS.name + "からは にげられない!", btCommandMenu); return; }
        btRecord({ type: "flee" });
      }
    } else if (bt.phase === "target") {
      if (sel >= bt.menu.ids.length) { btCommandMenu(); return; }
      btRecord({ type: bt.menu.type, target: bt.menu.ids[sel] });
    }
  }

  function enemyPos(i) {
    var eng = bt.eng, n = eng.enemies.length, e = eng.enemies[i];
    var def = e.boss ? H.BOSS : H.ENEMIES[e.kind];
    var xs = n === 1 ? [e.boss ? 450 : 400] : n === 2 ? [360, 560] : [270, 450, 620];
    var floor = e.boss ? 320 : 290;
    return { x: xs[i], y: floor, h: def.size };
  }

  function updateBattle(dt) {
    bt.t += dt;
    var i;
    if (bt.phase === "flash") {
      if (bt.t > 0.9) { btSay(bt.intro, btNextCommand); bt.t = 0; }
      return;
    }
    if (bt.msg && bt.msg.shown < btMsgLen()) bt.msg.shown += dt * 40;
    bt.shake = Math.max(0, bt.shake - dt);
    for (i = 0; i < bt.dhp.length; i++) {
      bt.hitP[i] = Math.max(0, bt.hitP[i] - dt); bt.healP[i] = Math.max(0, bt.healP[i] - dt);
      bt.dhp[i] += Math.max(-dt * 50, Math.min(dt * 50, bt.thp[i] - bt.dhp[i]));
      bt.dmp[i] = bt.tmp[i];
    }
    for (i = 0; i < bt.deh.length; i++) {
      bt.hitE[i] = Math.max(0, bt.hitE[i] - dt);
      bt.deh[i] += Math.max(-dt * 90, Math.min(dt * 90, bt.teh[i] - bt.deh[i]));
      if (bt.teh[i] <= 0 && bt.hitE[i] <= 0) bt.alpha[i] = Math.max(0, bt.alpha[i] - dt * 2.2);
    }
    bt.fx = bt.fx.filter(function (f) { f.t += dt; return f.t < 0.9; });
    if (bt.phase === "out" && bt.t > 0.45) {
      var cb = bt.cb, res = bt.res;
      bt = null;
      held = [];
      cb(res);
    }
  }

  // ---- 絵 ----
  var btBg = {};
  function fieldBg() {
    if (btBg.field) return btBg.field;
    var c = mk(VIEW_W, VIEW_H), g = c.getContext("2d"), i;
    var sky = g.createLinearGradient(0, 0, 0, 260);
    sky.addColorStop(0, "#5aa8e8"); sky.addColorStop(1, "#cfeeff");
    g.fillStyle = sky; g.fillRect(0, 0, VIEW_W, 260);
    g.fillStyle = "#ffffff";                       // くも
    [[120, 70, 1], [520, 46, 1.3], [660, 120, 0.8], [300, 110, 0.7]].forEach(function (cl) {
      g.globalAlpha = 0.85;
      g.beginPath(); g.ellipse(cl[0], cl[1], 54 * cl[2], 16 * cl[2], 0, 0, 6.3); g.fill();
      g.beginPath(); g.ellipse(cl[0] + 30 * cl[2], cl[1] - 10 * cl[2], 34 * cl[2], 14 * cl[2], 0, 0, 6.3); g.fill();
    });
    g.globalAlpha = 1;
    g.fillStyle = "#6fb36a"; g.beginPath(); g.ellipse(160, 270, 300, 70, 0, 0, 6.3); g.fill();   // 遠くの丘
    g.fillStyle = "#5aa05a"; g.beginPath(); g.ellipse(620, 276, 330, 80, 0, 0, 6.3); g.fill();
    var gr = g.createLinearGradient(0, 240, 0, VIEW_H);
    gr.addColorStop(0, "#58b04c"); gr.addColorStop(1, "#2f7a3a");
    g.fillStyle = gr; g.fillRect(0, 240, VIEW_W, VIEW_H - 240);
    function r(n) { var v = Math.sin(n * 91.7 + 13.1) * 43758.5453; return v - Math.floor(v); }
    for (i = 0; i < 90; i++) {                    // くさのかたまり
      var x = Math.floor(r(i) * VIEW_W / 6) * 6, y = 250 + Math.floor(r(i + 50) * 250 / 6) * 6;
      g.fillStyle = i % 3 ? "#7bd067" : "#2f8a3e";
      g.fillRect(x, y, 6, 6); g.fillRect(x + 6, y - 6, 6, 6); g.fillRect(x + 12, y, 6, 6);
    }
    for (i = 0; i < 14; i++) {                    // 花
      var fx = Math.floor(r(i + 300) * VIEW_W / 6) * 6, fy = 262 + Math.floor(r(i + 400) * 160 / 6) * 6;
      g.fillStyle = i % 2 ? "#ffe05a" : "#ff9ac0"; g.fillRect(fx, fy, 6, 6);
    }
    [[40, 250, 1.1], [700, 246, 1.2], [610, 236, 0.8]].forEach(function (t) {   // 木
      g.fillStyle = "#6b4426"; g.fillRect(t[0] - 6 * t[2], t[1], 12 * t[2], 44 * t[2]);
      g.fillStyle = "#2c7a3a"; g.beginPath(); g.ellipse(t[0], t[1] - 6, 44 * t[2], 40 * t[2], 0, 0, 6.3); g.fill();
      g.fillStyle = "#3f9a4c"; g.beginPath(); g.ellipse(t[0] - 10 * t[2], t[1] - 18, 26 * t[2], 22 * t[2], 0, 0, 6.3); g.fill();
    });
    btBg.field = c;
    return c;
  }
  function shopBg() {
    if (btBg.shop) return btBg.shop;
    var c = mk(VIEW_W, VIEW_H), g = c.getContext("2d"), i;
    var w = g.createLinearGradient(0, 0, 0, 280);
    w.addColorStop(0, "#1c1034"); w.addColorStop(1, "#3a2160");
    g.fillStyle = w; g.fillRect(0, 0, VIEW_W, 280);
    for (i = 0; i < 4; i++) {                      // たな
      var sx = 24 + i * 186;
      g.fillStyle = "#2a1a1a"; g.fillRect(sx, 40, 150, 170);
      g.fillStyle = "#4a2e22";
      for (var sy = 40; sy < 200; sy += 54) g.fillRect(sx, sy + 46, 150, 8);
      for (var k = 0; k < 9; k++) {                // ビン
        var bx = sx + 12 + (k % 3) * 46, by2 = 40 + Math.floor(k / 3) * 54 + 20;
        g.fillStyle = ["#9a4bd6", "#4bd690", "#d64b6a"][(i + k) % 3];
        g.fillRect(bx, by2, 20, 26); g.fillRect(bx + 6, by2 - 8, 8, 8);
      }
    }
    var f = g.createLinearGradient(0, 260, 0, VIEW_H);
    f.addColorStop(0, "#3d2a5c"); f.addColorStop(1, "#1d1033");
    g.fillStyle = f; g.fillRect(0, 260, VIEW_W, VIEW_H - 260);
    g.fillStyle = "rgba(255,255,255,0.05)";
    for (i = 0; i < 12; i++) g.fillRect(0, 270 + i * 22, VIEW_W, 2);
    btBg.shop = c;
    return c;
  }

  var POSES = { grin: "shizuyo_grin", pot: "shizuyo_pot", cast: "shizuyo_cast", rage: "shizuyo_rage" };

  function drawEnemies() {
    var eng = bt.eng;
    for (var i = 0; i < eng.enemies.length; i++) {
      var e = eng.enemies[i], pos = enemyPos(i);
      if (bt.alpha[i] <= 0) continue;
      var name = e.kind;
      if (e.boss) name = (bt.pose && POSES[bt.pose]) || (eng.enraged ? "shizuyo_rage" : "shizuyo");
      var img = enemyImgs[name];
      if (!img) continue;
      var sc = e.boss ? pos.h / 296 : pos.h / img.height;
      var w = img.width * sc, h = img.height * sc;
      var bob = (e.kind === "potions") ? 0 : Math.sin(anim * (e.boss ? 1.6 : 3.2) + i * 1.7) * (e.boss ? 4 : 7);
      var lift = e.kind === "bat" ? 24 : e.kind === "babybat" ? 44 : e.kind === "soot" ? 10 : 0;
      var sh = bt.hitE[i] > 0 ? Math.sin(anim * 60) * 7 : 0;
      var blink = bt.hitE[i] > 0 && Math.floor(anim * 16) % 2 === 0;
      var x = pos.x + sh, y = pos.y - lift + bob;
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 4, w * 0.38, 8, 0, 0, 6.3); ctx.fill();
      if (!blink) {
        ctx.globalAlpha = bt.alpha[i];
        ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
        ctx.globalAlpha = 1;
      }
      if (!e.boss && bt.alpha[i] > 0.5) text(e.name, pos.x, pos.y + 24, 15, "center");
    }
  }

  function hpColor(h, m) { return h / m < 0.25 ? "#ff7a7a" : h / m < 0.5 ? "#ffd75a" : "#ffffff"; }

  function drawPartyWindow() {
    var eng = bt.eng, n = eng.party.length, bx = 14, by = 14, bw = 304, bh = 18 + n * 40;
    windowBox(bx, by, bw, bh);
    for (var i = 0; i < n; i++) {
      var p = eng.party[i], y = by + 30 + i * 40, dead = !p.alive && bt.dhp[i] <= 0.5;
      if (bt.hitP[i] > 0 && Math.floor(anim * 14) % 2 === 0) { ctx.fillStyle = "rgba(255,70,70,0.5)"; ctx.fillRect(bx + 4, y - 18, bw - 8, 34); }
      if (bt.healP[i] > 0) { ctx.fillStyle = "rgba(90,255,150," + (0.15 + 0.3 * Math.abs(Math.sin(anim * 12))) + ")"; ctx.fillRect(bx + 4, y - 18, bw - 8, 34); }
      var hp = Math.max(0, Math.round(bt.dhp[i]));
      plainText(p.name, bx + 12, y - 4, 20, dead ? "#888" : "#ffe58a");
      plainText("HP", bx + 118, y - 4, 16, "#9fb4c8");
      plainText(String(hp), bx + 142, y - 4, 22, dead ? "#888" : hpColor(hp, p.maxhp));
      plainText("MP", bx + 214, y - 4, 16, "#9fb4c8");
      plainText(String(Math.round(bt.dmp[i])), bx + 240, y - 4, 22, "#bfe0ff");
      ctx.fillStyle = "#1b2748"; ctx.fillRect(bx + 12, y + 10, bw - 28, 5);
      ctx.fillStyle = hp / p.maxhp < 0.25 ? "#e05050" : hp / p.maxhp < 0.5 ? "#e0b840" : "#4fd08a";
      ctx.fillRect(bx + 12, y + 10, Math.round((bw - 28) * hp / p.maxhp), 5);
    }
  }

  function drawBattleMessage() {
    var bx = 28, by = 336, bw = 712, bh = 152;
    if (bt.msg) {
      windowBox(bx, by, bw, bh);
      if (!bt.msg.wrapped) bt.msg.wrapped = wrap(bt.msg.text, 660, 26);
      var lines = bt.msg.wrapped, left = Math.floor(bt.msg.shown);
      for (var i = 0; i < lines.length && left > 0; i++) {
        plainText(lines[i].slice(0, left), bx + 26, by + 34 + i * 38, 26);
        left -= lines[i].length;
      }
      if (bt.msg.shown >= btMsgLen() && Math.floor(anim * 2) % 2 === 0) plainText("▼", bx + bw - 44, by + bh - 24, 22);
    } else if (bt.menu) {
      var m = bt.menu, cw = 330, rowH = bt.phase === "target" ? 32 : 34;
      windowBox(bx, by, cw, bh);
      for (var j = 0; j < m.items.length; j++) {
        var yy = by + 28 + j * rowH;
        plainText((j === m.sel ? "▶ " : "　") + m.items[j], bx + 14, yy, 22);
        if (bt.phase === "cmd" && j === 1) {
          var sk = bt.eng.skillOf(bt.cmdI), ok = bt.eng.canSkill(bt.cmdI);
          ctx.textAlign = "right";
          ctx.font = "bold 15px " + FONT; ctx.fillStyle = ok ? "#bfe0ff" : "#ff8c8c";
          ctx.fillText("MP" + sk.mp, bx + cw - 14, yy);
        }
      }
      windowBox(bx + cw + 18, by, bw - cw - 18, bh);
      plainText(m.prompt, bx + cw + 40, by + 40, 24);
      if (bt.phase === "cmd") {
        var pp = bt.eng.party[bt.cmdI];
        plainText("HP " + pp.hp + " / " + pp.maxhp, bx + cw + 40, by + 90, 20, "#fff");
        plainText("MP " + pp.mp + " / " + pp.maxmp, bx + cw + 40, by + 122, 20, "#bfe0ff");
      }
    }
  }

  function drawBattle() {
    ctx.save();
    if (bt.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 10), Math.round((Math.random() - 0.5) * 8));
    ctx.drawImage(bt.boss ? shopBg() : fieldBg(), 0, 0);
    if (bt.boss) {                                  // 足もとのまほうじん
      var pulse = 0.5 + 0.5 * Math.sin(anim * 2.4), rage = bt.eng.enraged;
      ctx.fillStyle = (rage ? "rgba(255,70,120," : "rgba(160,110,255,") + (0.16 + 0.14 * pulse) + ")";
      ctx.beginPath(); ctx.ellipse(450, 326, 230 + pulse * 10, 38, 0, 0, 6.3); ctx.fill();
      ctx.strokeStyle = (rage ? "rgba(255,160,190," : "rgba(210,190,255,") + (0.45 + 0.3 * pulse) + ")";
      ctx.lineWidth = 3; ctx.stroke();
    }
    drawEnemies();
    for (var i = 0; i < bt.fx.length; i++) {
      var f = bt.fx[i];
      text(f.text, f.x, f.y - f.t * 40, 34, "center", Math.min(1, 2.2 - f.t * 2.4));
    }
    ctx.restore();
    drawPartyWindow();
    drawBattleMessage();
    if (bt.phase === "out") { ctx.fillStyle = "rgba(0,0,0," + Math.min(1, bt.t / 0.4) + ")"; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  }

  // であった しゅんかん(画面がチカチカして、せんとうへ)
  function drawBattleFlash() {
    var k = Math.floor(bt.t / 0.09) % 2;
    ctx.fillStyle = k ? "rgba(255,255,255," + Math.min(0.9, bt.t * 2) + ")" : "rgba(0,0,0," + Math.min(0.85, bt.t * 1.6) + ")";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  function render() {
    ctx.fillStyle = "#14181f";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (loadError) { text("よみこみに失敗しました", VIEW_W / 2, VIEW_H / 2 - 12, 24, "center"); text(String(loadError.message), VIEW_W / 2, VIEW_H / 2 + 20, 14, "center"); return; }
    if (!ready) { text("よみこみ中…", VIEW_W / 2, VIEW_H / 2, 24, "center"); return; }

    if (title) { drawTitle(); return; }
    if (intro) { drawIntro(); return; }
    if (bt && bt.phase !== "flash") { drawBattle(); return; }
    var art = artFor(world.sceneId);
    var p = world.player.pos();
    var camX = Math.round(p.x * TILE + TILE / 2 - VIEW_W / 2);
    var camY = Math.round(p.y * TILE + TILE / 2 - VIEW_H / 2);
    camX = Math.max(0, Math.min(art.width - VIEW_W, camX));
    camY = Math.max(0, Math.min(art.height - VIEW_H, camY));
    if (art.width <= VIEW_W) camX = Math.round((art.width - VIEW_W) / 2);
    if (art.height <= VIEW_H) camY = Math.round((art.height - VIEW_H) / 2);

    // 地面(水は0.5秒ごとにゆれる)
    var gi = Math.floor(anim * 2) % 2;
    ctx.drawImage(art.ground[gi], camX, camY, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

    // 木・家・キャラを、奥から手前の順に重ねる
    var list = [];
    for (var i = 0; i < art.objects.length; i++) {
      var o = art.objects[i];
      if (o.x + o.img.width < camX || o.x > camX + VIEW_W || o.y + o.img.height < camY || o.y > camY + VIEW_H) continue;
      list.push(o);
    }
    world.npcs.forEach(function (n) { list.push(actor(n.kind, n.x, n.y, n.dir, null, n.pose, n.step)); });
    world.followers.forEach(function (f) { list.push(actor(f.kind, f.pos().x, f.pos().y, f.dir, f)); });
    list.push(actor("niece", p.x, p.y, world.player.dir, world.player));
    list.sort(function (a, b) { return a.sortY - b.sortY; });
    for (i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.draw) it.draw(camX, camY);
      else ctx.drawImage(it.img, it.x - camX, it.y - camY);
    }

    if (showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
      for (var x = -(camX % TILE); x < VIEW_W; x += TILE) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, VIEW_H); ctx.stroke(); }
      for (var y = -(camY % TILE); y < VIEW_H; y += TILE) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(VIEW_W, y + 0.5); ctx.stroke(); }
      text("マス (" + world.player.tx + ", " + world.player.ty + ")", 12, VIEW_H - 18, 14);
    }

    drawHud();
    if (dlg) drawDialog(p.y * TILE + 58 - camY > 290);   // 自分が画面の下のほうにいるときは、ウィンドウを上に出す
    else if (!started || clock < 4) text("矢印キー/WASDで うごく ・ Z / Enter / A ボタンで はなす", VIEW_W / 2, VIEW_H - 24, 16, "center", started ? Math.max(0, 1 - (clock - 3)) : 1);

    if (ending) {
      ctx.fillStyle = "rgba(0,0,0," + Math.min(0.7, ending.t * 0.7) + ")";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      var a = Math.min(1, ending.t);
      text("だい 1 しょう  おわり!", VIEW_W / 2, 190, 40, "center", a);
      text("だい 2 しょう  COMING SOON", VIEW_W / 2, 262, 28, "center", Math.max(0, Math.min(1, ending.t - 0.5)));
      if (ending.t > 0.8) text("Z / A ボタンで あそびつづける", VIEW_W / 2, 340, 18, "center", 0.6 + 0.4 * Math.sin(anim * 4));
    }
    if (bt && bt.phase === "flash") drawBattleFlash();
    if (fade && fade.a > 0) {
      ctx.fillStyle = "rgba(0,0,0," + Math.min(1, fade.a) + ")";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  // ---------------------------------------------------------- ループ
  var FADE_TIME = 0.22;
  function updateFade(dt) {
    if (!fade) return;
    if (fade.phase === "out") {
      fade.a += dt / FADE_TIME;
      if (fade.a >= 1) {
        fade.a = 1;
        var w = world.pendingWarp;
        if (w) { world.enter(w.to, w.x, w.y, w.dir); story.onEnter(w.to); held = held.slice(); }
        fade.phase = "in";
      }
    } else {
      fade.a -= dt / FADE_TIME;
      if (fade.a <= 0) fade = null;
    }
  }

  var wasDlg = false;
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    anim += dt;
    if (started) clock += dt; else clock = 0;
    if (dlg && dlg.shown < pageLength()) dlg.shown += dt * 38;
    if (bt) updateBattle(dt);
    if (ending) ending.t += dt;
    if (title) title.t += dt;
    if (intro) intro.shown += dt * 14;
    if (ready) {
      if (world.pendingWarp && !fade && !dlg) fade = { a: 0, phase: "out" };
      updateFade(dt);
      if (wasDlg && !dlg) world.npcs.forEach(function (n) { if (n.dir0 && !n.pose) n.dir = n.dir0; });
      wasDlg = !!dlg;
      var want = title || intro || dlg || fade || ending || bt ? null : currentDir();
      world.update(dt, want);
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 動作確認用(ブラウザのコンソールから window.hanzoDebug で見られる)
  window.hanzoDebug = {
    get world() { return world; }, get story() { return story; },
    action: onAction, get dialog() { return dlg; }, get battle() { return bt; }, startBattle: startBattle,
  };
})();
