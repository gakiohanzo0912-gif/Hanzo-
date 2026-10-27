// 第1章のおはなし(だれが何を言うか・何をもらえるか)。画面には触らないので Node でもテストできる。
//
// ui に必要なもの(main.js が用意する):
//   ui.say(who, lines, done)               … せりふを順に出す。おわったら done()
//   ui.ask(who, text, options, done(i))    … えらぶ。選んだ番号で done(i)
//   ui.ending()                            … 第1章クリアの表示
//
// ここを書き換えれば、せりふやおつかいの中身を変えられる。
(function (g) {
  "use strict";
  var H = (g.Hanzo = g.Hanzo || {});

  var PRICE = 120;     // チョコの値段
  var ALLOWANCE = 500; // ママがくれるお金

  function Story(world, ui) {
    this.world = world;
    this.ui = ui;
    this.s = { asked: false, beer: false, uncle: false, choco: false, done: false, money: 0 };
  }

  // いまの目的(画面の上に出す)
  Story.prototype.objective = function () {
    var s = this.s, sc = this.world.sceneId;
    if (s.done) return "第1章 クリア!";
    if (!s.asked) return sc === "home" ? "ママに はなしかけよう" : "おうちに はいろう";
    if (!s.beer && !s.uncle) return sc === "home" ? "パパにも はなしてみよう" : "パパに はなしを きいてこよう";
    if (!s.uncle) return "みずうみの おじさんに ビールを わたそう";
    if (!s.choco) return "おみせで チョコを かおう";
    return "ママに チョコを わたそう";
  };

  // 持ち物(画面の右上に出す)
  Story.prototype.items = function () {
    var s = this.s, list = [];
    if (s.asked) list.push("¥" + s.money);
    if (s.beer) list.push("ビール");
    if (s.choco) list.push("チョコ");
    return list;
  };

  Story.prototype.interact = function (t) {
    if (!t) return false;
    var ui = this.ui, s = this.s, self = this;
    if (t.type === "npc") {
      var id = t.npc.id;
      if (id === "mama") this.mama();
      else if (id === "papa") this.papa();
      else if (id === "uncle") this.uncle(t.npc);
      return true;
    }
    if (t.type === "follower") {
      if (t.follower.kind === "dog") ui.say("豆柴", ["ワン!", "(しっぽを ぶんぶん ふっている)"]);
      else ui.say("おじさん", s.choco ? ["ママへの おみやげ、だいじに もてよ。"] : ["おじさんが ついてるから あんしんだ。", "…ビール、もう いっぽん ないか?"]);
      return true;
    }
    if (t.type === "tile") {
      if (this.world.sceneId === "shop" && (t.ch === "C" || t.ch === "B")) { this.shop(); return true; }
      var lines = this.world.scene.talk[t.ch];
      if (lines) { ui.say("", lines); return true; }
    }
    return false;
  };

  Story.prototype.mama = function () {
    var ui = this.ui, s = this.s, self = this;
    if (s.done) {
      ui.say("ママ", ["チョコ、ありがとうね。", "あとで みんなで たべようね。"]);
    } else if (s.choco) {
      ui.say("ママ", ["あら! チョコ かってきてくれたの?", "ありがとう! ママ、これが たべたかったの!", "おつりは あなたの おこづかいに しなさい。"], function () {
        s.done = true;
        ui.ending();
      });
    } else if (!s.asked) {
      ui.say("ママ", ["あら、おかえり! ちょうどよかった。", "おみせに いって、チョコを かってきてくれる?", "おかね、" + ALLOWANCE + "えん わたしておくね。"], function () {
        s.asked = true;
        s.money = ALLOWANCE;
        ui.say("", ["¥" + ALLOWANCE + " を もらった!", "(パパにも ひとこと いってから いこう)"]);
      });
    } else if (s.uncle) {
      ui.say("ママ", ["おじさんも いっしょなら あんしんね。", "おみせは そとの みちを、みぎのほうよ。"]);
    } else {
      ui.say("ママ", ["おみせは そとの みちを、みぎのほうよ。", "きをつけて いってらっしゃい。"]);
    }
  };

  Story.prototype.papa = function () {
    var ui = this.ui, s = this.s;
    if (!s.asked) {
      ui.say("パパ", ["おかえり。ママが よんでたぞ。"]);
    } else if (!s.beer && !s.uncle) {
      ui.say("パパ", [
        "チョコを かいに いくのか。",
        "でも とちゅうの みちは あぶないぞ。",
        "みずうみで つりを してる おじさんに、この ビールを わたしなさい。",
        "そしたら おじさんが なかまに なって、いっしょに いってくれる。",
      ], function () {
        s.beer = true;
        ui.say("", ["ビールを うけとった!"]);
      });
    } else if (!s.uncle) {
      ui.say("パパ", ["ビールを おじさんに わたすんだぞ。", "みずうみは、そとの みちを したに すすんだ ところだ。"]);
    } else {
      ui.say("パパ", ["おじさんが いっしょか。それなら あんしんだ。", "きを つけて いっておいで。"]);
    }
  };

  Story.prototype.uncle = function (npc) {
    var ui = this.ui, s = this.s, w = this.world;
    if (!s.beer) {
      ui.say("おじさん", ["…………。", "(つりに ゆうちゅうで ぜんぜん きづかない)", "おっ、きみか。いまは つりちゅうなんだ。", "ビールでも あれば うごくんだがなあ。"]);
      return;
    }
    ui.ask("おじさん", "おっ! その てに もってるのは…ビールか?", ["わたす", "やめる"], function (i) {
      if (i !== 0) { ui.say("おじさん", ["そうか…ざんねん。"]); return; }
      ui.say("おじさん", ["おおっ! ビールじゃないか!", "しかたない、おじさんが いっしょに いってやろう!"], function () {
        s.beer = false;
        s.uncle = true;
        npc.pose = null;
        w.joinFollower("uncle");
        ui.say("", ["おじさんが なかまに くわわった!"]);
      });
    });
  };

  Story.prototype.shop = function () {
    var ui = this.ui, s = this.s;
    if (s.choco) { ui.say("おみせの ひと", ["まいどあり!"]); return; }
    if (!s.asked) { ui.say("おみせの ひと", ["いらっしゃいませ!", "(いまは かうものが ない)"]); return; }
    ui.ask("おみせの ひと", "いらっしゃい! チョコレートは " + PRICE + "えん だよ。", ["かう", "やめる"], function (i) {
      if (i !== 0) { ui.say("おみせの ひと", ["また きてね!"]); return; }
      if (s.money < PRICE) { ui.say("おみせの ひと", ["おかねが たりないみたい…"]); return; }
      s.money -= PRICE;
      s.choco = true;
      ui.say("", ["チョコレートを てにいれた!", "(ママの ところへ もっていこう)"]);
    });
  };

  H.Story = Story;
  H.STORY_PRICE = PRICE;
  if (typeof module !== "undefined" && module.exports) module.exports = H;
})(typeof window !== "undefined" ? window : globalThis);
