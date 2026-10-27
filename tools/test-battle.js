// せんとうの自動テスト。  node tools/test-battle.js
const assert = require("assert");
const H = require("../src/world.js");
require("../src/scenes.js");
require("../src/battle.js");
require("../src/story.js");

function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function party(ids) { return ids.map((id) => ({ id, hp: H.MEMBERS[id].hp, mp: H.MEMBERS[id].mp })); }

// かしこい あいて(たたかう・ときどき とくぎ・弱ったら かいふく)
function play(ids, enemies, seed, boss) {
  const rng = seeded(seed), b = new H.Battle(party(ids), enemies, { boss, rng });
  let turns = 0, events = 0;
  while (!b.result && turns < 60) {
    turns++;
    const cmds = b.party.map((p, i) => {
      if (!p.alive) return null;
      const hurt = b.party.some((q) => q.alive && q.hp < q.maxhp * 0.5);
      if (p.id === "niece" && hurt && b.canSkill(i)) return { type: "skill" };
      if (p.id === "uncle" && b.canSkill(i) && turns % 2) return { type: "skill", target: b.firstAliveEnemy() };
      if (p.id === "dog" && boss && turns === 1 && b.canSkill(i)) return { type: "skill" };
      return { type: "attack", target: b.firstAliveEnemy() };
    });
    const ev = b.resolve(cmds);
    events += ev.length;
    ev.forEach((e) => {
      assert.ok(typeof e.text === "string" && e.text.length);
      assert.strictEqual(e.hp.length, b.party.length);
      assert.strictEqual(e.eh.length, b.enemies.length);
      e.hp.forEach((h) => assert.ok(h >= 0));
    });
    b.party.forEach((p) => { assert.ok(p.hp >= 0 && p.hp <= p.maxhp && p.mp >= 0); });
  }
  return { b, turns, events };
}

// ---- ふつうのてき ----
for (const g of [["bat"], ["babybat", "babybat"], ["soot", "soot"], ["potions"], ["soot", "babybat", "babybat"]]) {
  let win = 0;
  for (let s = 1; s <= 200; s++) {
    const r = play(["niece", "dog"], g, s, false);
    assert.ok(r.b.result, g.join() + " ends");
    if (r.b.result === "win") win++;
  }
  assert.ok(win >= 150, g.join() + " are beatable by niece+dog: " + win + "/200");
}

// ---- ボス ----
for (const ids of [["niece", "dog", "uncle"], ["niece", "dog"]]) {
  let win = 0, lose = 0;
  for (let s = 1; s <= 300; s++) {
    const r = play(ids, ["shizuyo"], s, true);
    assert.ok(r.b.result === "win" || r.b.result === "lose");
    if (r.b.result === "win") win++; else lose++;
  }
  console.log("boss " + ids.length + "にん: win " + win + " / lose " + lose);
  assert.ok(win > 100 && lose > 0, "boss is a real fight but winnable");
}

// ---- にげる ----
{
  let fled = 0, failed = 0, bossFlee = 0;
  for (let s = 1; s <= 100; s++) {
    const b = new H.Battle(party(["niece", "dog"]), ["bat"], { rng: seeded(s) });
    const ev = b.resolve([{ type: "flee" }, null]);
    if (b.result === "flee") { fled++; assert.strictEqual(ev[ev.length - 1].result, "flee"); } else failed++;
    const bb = new H.Battle(party(["niece"]), ["shizuyo"], { boss: true, rng: seeded(s) });
    bb.resolve([{ type: "flee" }]);
    if (bb.result === "flee") bossFlee++;
  }
  assert.ok(fled > 30 && failed > 10, "flee sometimes works: " + fled + "/" + failed);
  assert.strictEqual(bossFlee, 0, "can't flee the boss");
}

// ---- ぼうぎょ・かいふく ----
{
  const b = new H.Battle(party(["niece", "dog"]), ["bat"], { rng: seeded(7) });
  b.party[1].hp = 5;
  const mp0 = b.party[0].mp;
  b.resolve([{ type: "skill" }, { type: "defend" }]);
  assert.strictEqual(b.party[0].mp, mp0 - H.MEMBERS.niece.skill.mp);
  assert.ok(b.party[1].hp > 5 || b.party[1].hp === 0, "healed (or later hit)");
}

// ---- てきの組み合わせ ----
{
  const seen = {};
  for (let i = 0; i < 200; i++) H.randomGroup(seeded(i + 1)).forEach((k) => { assert.ok(H.ENEMIES[k]); seen[k] = 1; });
  assert.ok(!seen.slime, "スライムは でない");
  assert.deepStrictEqual(Object.keys(H.ENEMIES).sort(), ["babybat", "bat", "potions", "soot"]);
}

// ---- Story: くさむらで てきに であう ----
{
  const w = new H.World(H.SCENES, "outside");
  const fights = [];
  const ui = {
    say(who, lines, cb) { if (cb) cb(); }, ask(w_, t, o, cb) { cb(0); }, ending() {},
    battle(spec, cb) {
      fights.push(spec);
      const b = new H.Battle(spec.members, spec.enemies, { rng: seeded(3) });
      let guard = 0;
      while (!b.result && guard++ < 80) b.resolve(b.party.map((p, i) => p.alive ? { type: "attack", target: b.firstAliveEnemy() } : null));
      cb({ result: b.result, party: b.party, money: b.money });
    },
  };
  const story = new H.Story(w, ui);
  story.rng = seeded(11);
  w.onStep = (id, x, y, ch) => story.onStep(id, x, y, ch);
  // まだ おつかいを たのまれていないうちは でない
  for (let i = 0; i < 40; i++) story.onStep("outside", 3, 12, ".");
  assert.strictEqual(fights.length, 0);
  story.s.asked = true;
  for (let i = 0; i < 100; i++) story.onStep("outside", 3, 12, ".");
  assert.ok(fights.length >= 3 && fights.length < 40, "encounter rate " + fights.length);
  story.onStep("outside", 6, 10, "=");      // 道では でない
  const before = fights.length;
  for (let i = 0; i < 50; i++) story.onStep("outside", 6, 10, "=");
  assert.strictEqual(fights.length, before, "no encounters on the road");
  for (let i = 0; i < 50; i++) story.onStep("home", 3, 3, ".");
  assert.strictEqual(fights.length, before, "no encounters indoors");
  assert.ok(story.s.money > 0, "money from fights " + story.s.money);
  assert.strictEqual(fights[0].members[0].id, "niece");
  assert.strictEqual(fights[0].members[1].id, "dog");
}

// ---- 歩いていて、本当に であうか(World → Story) ----
{
  const w = new H.World(H.SCENES, "outside");
  let n = 0;
  const ui = { say(a, b, cb) { if (cb) cb(); }, ask(a, b, c, cb) { cb(0); }, ending() {}, battle(spec, cb) { n++; cb({ result: "flee", party: spec.members, money: 0 }); } };
  const story = new H.Story(w, ui);
  story.s.asked = true; story.rng = seeded(5);
  w.onStep = (id, x, y, ch) => story.onStep(id, x, y, ch);
  w.enter("outside", 3, 12, "right");
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < 400; i++) w.update(1 / 60, "right");
    for (let i = 0; i < 400; i++) w.update(1 / 60, "left");
  }
  assert.ok(n >= 1, "walking in the grass leads to a fight: " + n);
}

console.log("ok: せんとうのテストに通りました");
