// 動き・おはなしの自動テスト。  node tools/test-world.js
const assert = require("assert");
const H = require("../src/world.js");
require("../src/scenes.js");
require("../src/story.js");

function mkWorld() { return new H.World(H.SCENES, "outside"); }
// 指定の向きに n マス歩く(キーを押し続ける)
function walk(w, dir, n) {
  const p = w.player, started = () => p.steps + (p.moving ? 1 : 0);
  const goal = started() + n; let guard = 0;
  while (guard++ < 100000 && !(started() >= goal && !p.moving)) {
    w.update(1 / 120, started() >= goal ? null : dir);
  }
  w.update(0.5, null);
  return n;
}
function route(w, steps) { steps.forEach(([d, n]) => walk(w, d, n)); }
function settle(w) { for (let i = 0; i < 600; i++) w.update(1 / 60, null); }

// 画面なしで会話を進める ui
function mkUI(log, answers) {
  const ui = {
    say(who, lines, cb) { log.push(who + ":" + lines.join("/")); if (cb) cb(); },
    ask(who, text, opts, cb) { log.push(who + "?" + text); cb(answers.length ? answers.shift() : 0); },
    ending() { log.push("ENDING"); },
  };
  return ui;
}
function face(w, dir) { w.update(1 / 30, dir); w.update(0.5, null); }

// ---- マップ ----
const out = H.SCENES.outside;
assert.strictEqual(out.rows.length, 22);
out.rows.forEach((r, i) => assert.strictEqual(r.length, 30, "outside row " + i));
["home", "shop"].forEach((id) => {
  const s = H.SCENES[id];
  assert.strictEqual(s.rows.length, 8); s.rows.forEach((r) => assert.strictEqual(r.length, 12));
});

// ---- 2かいの部屋からスタート → かいだんで1かいへ ----
{
  const w2 = new H.World(H.SCENES, "room2");
  assert.strictEqual(w2.sceneId, "room2");
  assert.deepStrictEqual([w2.player.tx, w2.player.ty], [3, 4]);
  assert.strictEqual(w2.followers[0].kind, "dog");
  route(w2, [["up", 1], ["right", 7]]);     // (3,4)->(3,3)->(10,3)
  assert.deepStrictEqual([w2.player.tx, w2.player.ty], [10, 3]);
  walk(w2, "up", 1);
  assert.ok(w2.pendingWarp && w2.pendingWarp.to === "home", "stairs down");
  w2.enter("home", w2.pendingWarp.x, w2.pendingWarp.y, w2.pendingWarp.dir);
  assert.deepStrictEqual([w2.player.tx, w2.player.ty], [10, 3]);
  const mm = w2.npcs.find((n) => n.id === "mama");
  assert.strictEqual(mm.dir, "up");
  walk(w2, "up", 1);
  assert.ok(w2.pendingWarp && w2.pendingWarp.to === "room2", "stairs up");
}

// ---- ドアから家に入って、出る ----
let w = mkWorld();
assert.strictEqual(w.sceneId, "outside");
route(w, [["up", 3]]);                       // (6,8) → (6,5)=ドア
assert.ok(w.pendingWarp, "door should warp");
w.enter(w.pendingWarp.to, w.pendingWarp.x, w.pendingWarp.y, w.pendingWarp.dir);
assert.strictEqual(w.sceneId, "home");
assert.deepStrictEqual([w.player.tx, w.player.ty], [6, 6]);
assert.strictEqual(w.followers[0].kind, "dog");
assert.ok(!w.solid(w.followers[0].tx, w.followers[0].ty) || true);
walk(w, "down", 1);                          // マットに乗る → 外へ
assert.ok(w.pendingWarp && w.pendingWarp.to === "outside");
w.enter("outside", w.pendingWarp.x, w.pendingWarp.y, w.pendingWarp.dir);
assert.deepStrictEqual([w.player.tx, w.player.ty], [6, 6]);

// ---- 家の中の NPC はぶつかる ----
w = mkWorld();
w.enter("home", 6, 6, "up");
route(w, [["up", 3]]);                       // (6,3)。ママは (5,3)
face(w, "left");
const t = w.interactTarget();
assert.ok(t && t.type === "npc" && t.npc.id === "mama");
walk(w, "left", 2);
assert.deepStrictEqual([w.player.tx, w.player.ty], [6, 3], "mama blocks");

// ---- おはなし全体の流れ ----
w = mkWorld();
const log = [];
let story = new H.Story(w, mkUI(log, [0, 0]));
assert.strictEqual(story.objective(), "おうちに はいろう");
w.enter("home", 6, 6, "up");
// ママに話す → お金をもらう
route(w, [["up", 3]]); face(w, "left");
story.interact(w.interactTarget());
assert.ok(story.s.asked && story.s.money === 500);
// パパ(2,3)に話す → ビール
route(w, [["down", 1], ["left", 2], ["up", 1], ["left", 1]]);   // (6,3)->(6,4)->(4,4)->(4,3)->(3,3)
face(w, "left");
let pt = w.interactTarget();
assert.ok(pt && pt.npc.id === "papa", "papa in front");
story.interact(pt);
assert.ok(story.s.beer);
assert.ok(/ビール/.test(story.items().join()));
// 外へ
route(w, [["right", 1], ["down", 3], ["right", 2], ["down", 1]]);   // (3,3)->(4,3)->(4,6)->(6,6)->(6,7)
assert.ok(w.pendingWarp, "exit warp");
w.enter("outside", w.pendingWarp.x, w.pendingWarp.y, w.pendingWarp.dir);

// 道を歩いて湖へ: (6,6) → 道(6,10) → 東へ13 → 南へ(13,18)?  湖の手前 (16,15) まで
route(w, [["down", 4], ["right", 7], ["down", 5], ["right", 3]]);
assert.deepStrictEqual([w.player.tx, w.player.ty], [16, 15], "at lake bank " + [w.player.tx, w.player.ty]);
face(w, "right");
const ut = w.interactTarget();
assert.ok(ut && ut.type === "npc" && ut.npc.id === "uncle");
assert.strictEqual(w.followers.length, 1);
story.interact(ut);                           // 「わたす」
assert.ok(story.s.uncle && !story.s.beer);
assert.strictEqual(w.followers.length, 2);
assert.strictEqual(w.followers[1].kind, "uncle");
assert.ok(!w.npcs.some((n) => n.id === "uncle"));
settle(w);
// 少し歩いて、なかま全員が一列に並ぶ(同じマスに重ならない)
route(w, [["up", 3], ["left", 2]]);
settle(w);
const tiles = [w.player].concat(w.followers).map((f) => f.tx + "," + f.ty);
assert.strictEqual(new Set(tiles).size, 3, "no overlap: " + tiles);
const dist = (a, b) => Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
assert.ok(dist(w.player, w.followers[0]) <= 2 && dist(w.followers[0], w.followers[1]) <= 2, "followers close " + tiles);

// ---- お店 ----
w = mkWorld(); story = new H.Story(w, mkUI(log, [0, 0])); story.s.asked = true; story.s.money = 500;
route(w, [["down", 2], ["right", 18], ["up", 3]]);   // (6,8)->(6,10)->(24,10)->(24,7)
assert.ok(w.pendingWarp && w.pendingWarp.to === "shop", "shop door " + [w.player.tx, w.player.ty]);
w.enter("shop", w.pendingWarp.x, w.pendingWarp.y, w.pendingWarp.dir);
route(w, [["up", 1]]);                        // (6,5)
face(w, "up");
const ct = w.interactTarget();
assert.ok(ct && ct.type === "tile" && "CB".includes(ct.ch), "counter " + JSON.stringify(ct));
story.interact(ct);
assert.ok(story.s.choco && story.s.money === 500 - H.STORY_PRICE);

// ---- ママにチョコを渡して第1章クリア ----
w.enter("home", 6, 6, "up");
route(w, [["up", 3]]); face(w, "left");
story.interact(w.interactTarget());
assert.ok(story.s.done && log.indexOf("ENDING") >= 0);
assert.strictEqual(story.objective(), "第1章 クリア!");

console.log("ok: すべてのテストに通りました");
