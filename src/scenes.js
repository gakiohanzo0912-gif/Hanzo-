// 場所(シーン)のデータ。1文字が1マス。手で書き換えてOK。
//
// 外(outside)  T=木 .=草 ,=花 ==道 ~=水 B=橋 F=柵 R=岩 H=家 D=家の入り口 S=お店 E=お店の入り口
// 家の中(home) / お店の中(shop)
//   W=かべ f=ゆか r=ラグ M=出入り口のマット T=テーブル S=本だな K=台所 P=植木 C=カウンター B=カウンター(ベル) G=商品だな
//
// warps  : "x,y" に乗ると to のシーンの (x,y) へ移る(歩いて入れるドア・出口)
// npcs   : その場所にいる人。kind は assets/sprites/ の名前
// talk   : 家具などを「しらべた」ときのせりふ(1文字のタイル記号 → せりふの配列)
(function (g) {
  "use strict";
  var H = (g.Hanzo = g.Hanzo || {});

  function put(rows, x, y, ch) {
    rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
  }

  var outRows = [
    "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
    "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
    "TT..........................TT",
    "TT.FHHHHHF......TT..........TT",
    "TT.FHHHHHF.TT....T......TT..TT",
    "TT.FHHDHHF.T.............T..TT",
    "TT.F..=..F.........R.T,,....TT",
    "TT.FFF=FFF.....,,...T..,..T.TT",
    "TT....=...,.R...,.........T.TT",
    "TT..,.=.,,..............,,..TT",
    "TT.R..=====================,TT",
    "TT.........,,=........=.....TT",
    "TT...,..R....=,,......=.....TT",
    "TT...,....TT.=,...~~~~B~~~R.TT",
    "TT........T..=....~~~~B~~~..TT",
    "TT...TT......=....~~~~B~~~..TT",
    "TT...T.......=.TT.~~~~B~~~..TT",
    "TT..T........=..T.~~~~B~~~..TT",
    "TT...........==========.....TT",
    "TT......,,.......,,...=.....TT",
    "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
    "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  ];
  // 右上にお店を建てる(5×3マス。入り口は (24,7)、道は大通りまでつなぐ)
  var x, y;
  for (y = 5; y <= 7; y++) for (x = 22; x <= 26; x++) put(outRows, x, y, "S");
  put(outRows, 24, 7, "E");
  put(outRows, 24, 8, "=");
  put(outRows, 24, 9, "=");

  H.SCENES = {
    outside: {
      id: "outside", kind: "outdoor", title: "そと",
      rows: outRows,
      objects: [
        { type: "house", x: 4, y: 3, w: 5, h: 3 },
        { type: "shop", x: 22, y: 5, w: 5, h: 3 },
      ],
      spawn: { x: 6, y: 8, dir: "down" },
      warps: {
        "6,5": { to: "home", x: 6, y: 6, dir: "up" },
        "24,7": { to: "shop", x: 6, y: 6, dir: "up" },
      },
      npcs: [
        // みずうみで釣りをしているおじさん(ビールを渡すまで動かない)
        { id: "uncle", kind: "uncle", x: 17, y: 15, dir: "right", pose: "fish" },
      ],
      talk: {},
    },

    home: {
      id: "home", kind: "indoor", title: "いえ",
      theme: { wall: "#ecdcb6", wains: "#a8744a", floor: "#cf9f62", trim: "#5a4636" },
      rows: [
        "WWWWWWWWWWWW",
        "WWWWWWWWWWWW",
        "WSSfKKKffPUW",
        "WffffffffffW",
        "WfTTffffffPW",
        "WffffffrrffW",
        "WffffffrrffW",
        "WWWWWWMWWWWW",
      ],
      objects: [],
      spawn: { x: 6, y: 6, dir: "up" },
      warps: {
        "6,7": { to: "outside", x: 6, y: 6, dir: "down" },
        "10,2": { to: "room2", x: 10, y: 3, dir: "down" },
      },
      npcs: [
        { id: "mama", kind: "mama", x: 5, y: 3, dir: "up", step: true },      // 台所でごはん作り
        { id: "papa", kind: "papa", x: 2, y: 3, dir: "up", step: true },      // 本だなをながめている
      ],
      talk: {
        S: ["ほんが ぎっしり ならんでいる。", "『まめしばの そだてかた』…ある。"],
        K: ["だいどころだ。いいにおいが する。"],
        T: ["テーブルの上に おちゃが おいてある。"],
        U: ["2かいへ のぼる かいだんだ。"],
        P: ["げんきな うえきだ。"],
      },
    },

    room2: {
      id: "room2", kind: "indoor", title: "2かいの へや",
      theme: { wall: "#d7e6f3", wains: "#6a8fb8", floor: "#d9ab72", trim: "#4a4256" },
      rows: [
        "WWWWWWWWWWWW",
        "WWWWWWWWWWWW",
        "WLlfSSfDDfNW",
        "WffffffffffW",
        "WffffrrffPfW",
        "WffffrrffffW",
        "WffffffffffW",
        "WWWWWWWWWWWW",
      ],
      objects: [],
      spawn: { x: 3, y: 4, dir: "down" },
      warps: { "10,2": { to: "home", x: 10, y: 3, dir: "down" } },
      npcs: [],
      talk: {
        L: ["ふかふかの ベッド。", "まだ ちょっと ねむい…"],
        D: ["つくえの上に ノートが ひらいてある。", "『ぼうけんの きろく』と かいてある。"],
        S: ["えほんが たくさん ならんでいる。"],
        P: ["まどべの うえきだ。"],
        N: ["したに おりる かいだんだ。"],
      },
    },

    shop: {
      id: "shop", kind: "indoor", title: "おみせ",
      theme: { wall: "#d9ecdc", wains: "#4f8f6e", floor: "#dcb87f", trim: "#3d5a4a" },
      rows: [
        "WWWWWWWWWWWW",
        "WWWWWWWWWWWW",
        "WGGfGGfGGfPW",
        "WffffffffffW",
        "WffCCBCCffrW",
        "WffffffffffW",
        "WfrrffffffPW",
        "WWWWWWMWWWWW",
      ],
      objects: [],
      spawn: { x: 6, y: 6, dir: "up" },
      warps: { "6,7": { to: "outside", x: 24, y: 8, dir: "down" } },
      npcs: [],
      talk: {
        G: ["おかしや ジュースが ならんでいる。", "ぜんぶ ほしくなっちゃう!"],
        P: ["おみせの かざりの はなだ。"],
      },
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
