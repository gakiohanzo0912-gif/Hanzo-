# 犬の歯みがきチャレンジ

ユーザー提供の犬写真を使った、GitHub配布向けのシンプルなブラウザゲームです。

## ゲーム概要

- 犬が **口を開けている間** にだけ歯みがき成功
- **口を閉じているのに磨く** と噛まれてダメージ
- **3回ダメージでゲームオーバー**
- 全 **3ステージ** クリアで勝利

## 操作

- **PC**: マウスで歯ブラシを動かし、長押しで歯みがき
- **キーボード**: `Space` 長押しでも歯みがき可能
- **スマホ**: 指で長押ししながら歯ブラシを動かす

## ファイル構成

```text
index.html
style.css
game.js
assets/
  dog-open.png
  dog-closed.png
  toothbrush.svg
  plaque.svg
  heart-full.png
  heart-broken.png
  icon.png
```

## ローカルで遊ぶ

`index.html` をブラウザで開くだけで動きます。

## GitHubで配布する方法

### そのままリポジトリに置く
1. 新しいGitHubリポジトリを作成
2. この一式をアップロード
3. `index.html` をルートに置いたままコミット

### GitHub Pagesで公開する
1. リポジトリ作成後にこのファイル群を push
2. GitHub の **Settings → Pages**
3. **Deploy from a branch**
4. Branch を `main` / Folder を `/root` に設定
5. 数十秒〜数分で公開URLが発行されます

## カスタムしやすい場所

- 難易度調整: `game.js` の `STAGES`
- 口判定位置: `style.css` の `.mouth-zone`
- ブラシ見た目: `assets/toothbrush.svg`
- 文言: `index.html`

## 注意

- `dog-closed.png` は提供写真からゲーム用に加工した簡易差分素材です。
- 音はファイルではなく Web Audio API で生成しています。
