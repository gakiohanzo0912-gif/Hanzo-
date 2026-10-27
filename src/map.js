// マップデータ。1文字が1タイル。手で書き換えてOK(30×22)。
//   T=木  .=草  ,=花  ==道  ~=水  B=橋  F=柵  R=岩  H=家  D=家の入り口
(function (g) {
  "use strict";
  var H = (g.Hanzo = g.Hanzo || {});
  H.MAP = {
    rows: [
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
    ],
    // 家(絵は5×3タイル、左上のタイル座標)
    objects: [{ type: "house", x: 4, y: 3, w: 5, h: 3 }],
    // 姪っ子の開始位置と向き。犬は「向きの反対側」からスタート。
    spawn: { x: 6, y: 8, dir: "down" },
  };
})(typeof window !== "undefined" ? window : globalThis);
