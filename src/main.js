// 画面の表示・キー/タッチ操作・ゲームループ
(function () {
  "use strict";
  var H = window.Hanzo;
  var TILE = H.TILE;
  var VIEW_W = 768, VIEW_H = 512;      // 画面は 12×8 マス
  var BOB_PX = 2;                      // 前後向きで歩くときの上下ゆれ

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

  var sprites = {};
  var art = null, world = null;
  var ready = false, loadError = null;

  Promise.all([loadImage("assets/sprites/niece.png"), loadImage("assets/sprites/dog.png")])
    .then(function (imgs) {
      sprites.niece = imgs[0];
      sprites.dog = imgs[1];
      art = H.makeArt(mk, H.MAP);
      world = new H.World(H.MAP);
      ready = true;
    })
    .catch(function (e) { loadError = e; });

  // ---------------------------------------------------------- 入力
  var held = [];                       // 押している向き(あとから押したものを優先)
  function press(id, dir) {
    release(id);
    held.push({ id: id, dir: dir });
    started = true;
  }
  function release(id) {
    held = held.filter(function (h) { return h.id !== id; });
  }
  function currentDir() { return held.length ? held[held.length - 1].dir : null; }

  var KEYS = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
  };
  var showGrid = false, started = false;

  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "g" || e.key === "G") { if (!e.repeat) showGrid = !showGrid; return; }
    var dir = KEYS[e.key];
    if (!dir) return;
    e.preventDefault();
    if (!e.repeat) press("key-" + e.key.toLowerCase(), dir);
  });
  window.addEventListener("keyup", function (e) {
    if (KEYS[e.key]) release("key-" + e.key.toLowerCase());
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

  // ---------------------------------------------------------- 画面サイズに合わせる
  var wrap = document.getElementById("wrap");
  function fit() {
    var pad = document.getElementById("pad");
    var padH = pad && getComputedStyle(pad).display !== "none" ? pad.offsetHeight + 12 : 0;
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
  function drawChar(kind, walker) {
    var meta = window.SPRITE_META[kind];
    var dm = meta.dirs[walker.dir];
    var pos = walker.pos();
    var feetX = pos.x * TILE + TILE / 2;
    var feetY = pos.y * TILE + 58;
    var fi = dm.idle, bob = 0;
    if (walker.moving) {
      var len = dm.walk.length;
      var k = walker.steps * 2 + (walker.t >= 0.5 ? 1 : 0);
      var idx = Math.floor((k * len) / 4) % len;
      fi = dm.walk[idx];
      bob = dm.bob[idx] * BOB_PX;
    }
    return {
      sortY: feetY,
      draw: function (camX, camY) {
        // 影
        ctx.fillStyle = "rgba(20, 30, 20, 0.28)";
        ctx.beginPath();
        var sw = kind === "dog" ? 24 : 15;
        ctx.ellipse(Math.round(feetX - camX), Math.round(feetY - camY - 1), sw, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(
          sprites[kind],
          fi * meta.cellW, dm.row * meta.cellH, meta.cellW, meta.cellH,
          Math.round(feetX - meta.anchorX - camX), Math.round(feetY - meta.anchorY - camY - bob),
          meta.cellW, meta.cellH
        );
      },
    };
  }

  function text(str, x, y, size, align, alpha) {
    ctx.font = "bold " + size + "px 'Hiragino Maru Gothic ProN','Yu Gothic','Meiryo',sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(20,24,32,0.85)";
    ctx.strokeText(str, x, y);
    ctx.fillStyle = "#fff";
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  var clock = 0;
  function render() {
    ctx.fillStyle = "#14181f";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (loadError) { text("よみこみに失敗しました", VIEW_W / 2, VIEW_H / 2 - 12, 24, "center"); text(String(loadError.message), VIEW_W / 2, VIEW_H / 2 + 20, 14, "center"); return; }
    if (!ready) { text("よみこみ中…", VIEW_W / 2, VIEW_H / 2, 24, "center"); return; }

    var p = world.player.pos();
    var camX = Math.round(p.x * TILE + TILE / 2 - VIEW_W / 2);
    var camY = Math.round(p.y * TILE + TILE / 2 - VIEW_H / 2);
    camX = Math.max(0, Math.min(art.width - VIEW_W, camX));
    camY = Math.max(0, Math.min(art.height - VIEW_H, camY));

    // 地面(水は0.5秒ごとにゆれる)
    var gi = Math.floor(clock * 2) % 2;
    ctx.drawImage(art.ground[gi], camX, camY, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

    // 木・家・キャラを、奥から手前の順に重ねる
    var list = [];
    for (var i = 0; i < art.objects.length; i++) {
      var o = art.objects[i];
      if (o.x + o.img.width < camX || o.x > camX + VIEW_W || o.y + o.img.height < camY || o.y > camY + VIEW_H) continue;
      list.push(o);
    }
    list.push(drawChar("dog", world.dog));
    list.push(drawChar("niece", world.player));
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
      text("マス (" + world.player.tx + ", " + world.player.ty + ")  犬 (" + world.dog.tx + ", " + world.dog.ty + ")", 12, VIEW_H - 18, 14);
    }

    // 文字
    text("姪っ子と豆柴の冒険  第1章(仮マップ)", 12, 18, 15);
    if (!started || clock < 3) text("矢印キー / WASD / 画面のボタンで うごく", VIEW_W / 2, VIEW_H - 24, 16, "center", started ? Math.max(0, 1 - (clock - 2)) : 1);
  }

  // ---------------------------------------------------------- ループ
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (started) clock += dt; else clock = 0;
    if (ready) world.update(dt, currentDir());
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 動作確認用(ブラウザのコンソールから window.hanzoDebug で見られる)
  window.hanzoDebug = { get world() { return world; } };
})();
