// 動きのテスト:  node tools/test-world.js
const assert = require("assert");
require("../src/map.js");
const H = require("../src/world.js");

const map = H.MAP;
assert.strictEqual(map.rows.length, 22, "マップは22行");
map.rows.forEach((r, i) => assert.strictEqual(r.length, 30, "行 " + i + " の幅は30"));

function sim(world, seq, secondsEach) {
  // seq: 方向(または null=はなす)のリストを順番に押し続ける
  let worst = 0;
  for (const dir of seq) {
    for (let t = 0; t < secondsEach; t += 1 / 60) {
      world.update(1 / 60, dir);
      const p = world.player.pos(), d = world.dog.pos();
      worst = Math.max(worst, Math.abs(p.x - d.x) + Math.abs(p.y - d.y));
      assert(!world.solid(world.dog.tx, world.dog.ty), "犬が通れないマスにいる");
      assert(!world.solid(world.player.tx, world.player.ty), "姪っ子が通れないマスにいる");
    }
  }
  return worst;
}
const adjacent = (a, b) => Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty) === 1;

// 1) スタート
let w = new H.World(map);
assert(!w.solid(w.player.tx, w.player.ty));
assert(adjacent(w.player, w.dog), "犬は姪っ子のとなり(後ろ)から始まる");
assert.strictEqual(w.dog.ty, w.player.ty - 1, "下向きスタートなので犬は上(後ろ)");

// 2) 下に歩き続ける → 壁(木)で止まる。犬は後ろにぴったりついてくる
w = new H.World(map);
let worst = sim(w, ["down"], 6);
assert(worst <= 2.05, "犬が遅れすぎ: " + worst);
sim(w, [null], 1);
assert(adjacent(w.player, w.dog), "止まったら犬は姪っ子のとなり");
assert.strictEqual(w.dog.ty, w.player.ty - 1, "下に歩いたので犬は上にいる");

// 3) ぐるっと歩く(右→下→左→上)。犬はいつも道すじをたどる
w = new H.World(map);
worst = sim(w, ["right", "right", "down", "down", "left", "left", "up", "up", "right", "down", "right", null], 0.7);
assert(worst <= 2.05, "犬が遅れすぎ: " + worst);
sim(w, [null], 1);
assert(adjacent(w.player, w.dog));

// 4) 橋をわたる(22,12)→(22,18)。水に落ちない
w = new H.World(map);
w.player.tx = 22; w.player.ty = 11; w.player.dir = "down";
w.dog.tx = 22; w.dog.ty = 10;
sim(w, ["down"], 4);
assert.strictEqual(w.player.tx, 22);
assert(w.player.ty >= 18, "橋をわたりきる ty=" + w.player.ty);
sim(w, [null], 1);
assert(adjacent(w.player, w.dog));

// 5) 犬のほうへ戻る(入れかわり)。重ならずに止まる
w = new H.World(map);
sim(w, ["down"], 1.0);   // 何マスか進む
sim(w, [null], 0.6);
sim(w, ["up"], 1.2);
sim(w, [null], 1);
assert(adjacent(w.player, w.dog), "入れかわったあとも犬がとなり");
assert(!(w.player.tx === w.dog.tx && w.player.ty === w.dog.ty), "重なっていない");

// 6) 家の入り口・水・木には入れない
w = new H.World(map);
w.player.tx = 6; w.player.ty = 6; w.player.dir = "up";
w.dog.tx = 6; w.dog.ty = 7;
sim(w, ["up"], 2);
assert.strictEqual(w.player.ty, 6, "入口(D)は通れない");

console.log("OK: すべてのテストに通りました");
