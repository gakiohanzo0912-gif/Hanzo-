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
  var sprites = {}, arts = {};
  var world = null, story = null;
  var ready = false, loadError = null;

  Promise.all(KINDS.map(function (k) { return loadImage("assets/sprites/" + k + ".png"); }))
    .then(function (imgs) {
      KINDS.forEach(function (k, i) { sprites[k] = imgs[i]; });
      world = new H.World(H.SCENES, "outside");
      story = new H.Story(world, ui);
      ready = true;
    })
    .catch(function (e) { loadError = e; });

  function artFor(id) {
    if (!arts[id]) arts[id] = H.makeArt(mk, H.SCENES[id]);
    return arts[id];
  }

  // ---------------------------------------------------------- 会話ウィンドウ
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
    if (title) { if (title.t > 0.4) { title = null; fade = { a: 1, phase: "in" }; } return; }
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
    if (title || dlg || ending) { e.preventDefault(); onAction(); }
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
  function actor(kind, x, y, dir, walker, pose) {
    var meta = window.SPRITE_META[kind];
    var dm = meta.dirs[dir] || meta.dirs.down;
    var feetX = x * TILE + TILE / 2;
    var feetY = y * TILE + 58;
    var row = dm.row, fi = dm.idle, bob = 0;
    if (pose && meta.extra && meta.extra[pose]) {
      row = meta.extra[pose].row;
      fi = [0, 1, 2, 1][Math.floor(anim * 1.4) % 4];
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

  function render() {
    ctx.fillStyle = "#14181f";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (loadError) { text("よみこみに失敗しました", VIEW_W / 2, VIEW_H / 2 - 12, 24, "center"); text(String(loadError.message), VIEW_W / 2, VIEW_H / 2 + 20, 14, "center"); return; }
    if (!ready) { text("よみこみ中…", VIEW_W / 2, VIEW_H / 2, 24, "center"); return; }

    if (title) { drawTitle(); return; }
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
    world.npcs.forEach(function (n) { list.push(actor(n.kind, n.x, n.y, n.dir, null, n.pose)); });
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
        if (w) { world.enter(w.to, w.x, w.y, w.dir); held = held.slice(); }
        fade.phase = "in";
      }
    } else {
      fade.a -= dt / FADE_TIME;
      if (fade.a <= 0) fade = null;
    }
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    anim += dt;
    if (started) clock += dt; else clock = 0;
    if (dlg && dlg.shown < pageLength()) dlg.shown += dt * 38;
    if (ending) ending.t += dt;
    if (title) title.t += dt;
    if (ready) {
      if (world.pendingWarp && !fade && !dlg) fade = { a: 0, phase: "out" };
      updateFade(dt);
      var want = title || dlg || fade || ending ? null : currentDir();
      world.update(dt, want);
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 動作確認用(ブラウザのコンソールから window.hanzoDebug で見られる)
  window.hanzoDebug = {
    get world() { return world; }, get story() { return story; },
    action: onAction, get dialog() { return dlg; },
  };
})();
