# はじめてのラウンド

ゴルフ初心者が約3か月（12週）でコースデビューするための練習ウェブアプリ。

## 開き方

`index.html` をブラウザ（Chrome / Safari / Edge）で開くだけで動きます。
3D表示に使う Three.js は CDN から読み込むので、インターネット接続が必要です。

## できること

| タブ | 内容 |
|---|---|
| ホーム | 3Dコースのカメラワーク、デビューまでのカウントダウン、今週のメニュー、12週スコアカード、今日のミッション、今日のうんちく |
| 練習 | 12週プログラム（1週＝1ホール）、ドリル図鑑（20種・図解つき）、テンポ練習（音つき） |
| プレー | 3クリックショットのゲーム：ショートラウンド（3ホール）、ニアピン、ドラコン、パター距離感 |
| 学ぶ | 3Dコース図鑑、ゴルフの歴史、うんちく、クイズ、用語集、ルールとマナー、デビュー準備、クラブの基本 |
| マイ | レベル・XP、バッジ23種、着せ替え（ボール・ウェア）、練習ログと週ごとの練習時間グラフ |

### ゲームと練習のつながり

- 練習メニューの達成・練習記録・クイズ・デイリーミッション・バッジで XP がたまり、レベルが上がる
- レベルが上がると、ゲームのゴルファーのパワーとナイスショットのゾーン幅が上がり、着せ替えが増える
- ゲームの中でも OB（1打罰で打ち直し）・池（1打罰でドロップ）・パーの2倍でギブアップなど、実際のルールどおりに進む

進捗や記録はブラウザの localStorage に保存されます（端末ごと）。

## ファイル構成

```
index.html            画面の骨組み（Three.js は importmap で CDN から）
css/style.css         デザイン（ライト／ダーク対応）
js/data.js            コンテンツ（12週プログラム・ドリル・歴史・うんちく・クイズ・用語・ルール）
js/app.js             画面の切り替え・保存・各画面の描画
js/scene3d.js         3Dコース（地形・芝・池・木・旗・解説ポイント）
js/putting.js         パター距離感ゲーム
js/tempo.js           テンポ練習
js/game.js            ラウンドゲーム（3クリックショット・弾道・転がり・スイング同期）
js/bgm.js             BGM（Web Audio で演奏するオリジナル曲とファンファーレ）
assets/golfer-glb.js  Blender で作ったゴルファー（体・服・クラブ・スイング／パットのアニメーション）
assets/ball-glb.js    Blender で作ったディンプル付きボール（GLB を埋め込み）
assets/*.png, *.jpg   Blender でレンダリングしたアイコンとヒーロー画像
tools/blender_assets.py  ボール・アイコン・ヒーロー画像を作る Blender スクリプト
tools/blender_golfer.py  ゴルファーを作る Blender スクリプト（-- check でポーズ確認画像も）
tools/build_artifact.py  1枚のHTMLにまとめる（公開用 → dist/artifact.html）
```

## 素材を作り直す

```
blender -b -P tools/blender_golfer.py
node -e "const b=require('fs').readFileSync('assets/golfer.glb');require('fs').writeFileSync('assets/golfer-glb.js','window.GOLFER_GLB_BASE64=\"'+b.toString('base64')+'\";')"
blender -b -P tools/blender_assets.py
python3 -c "import base64;b=open('assets/ball.glb','rb').read();open('assets/ball-glb.js','w').write('window.BALL_GLB_BASE64=\"'+base64.b64encode(b).decode()+'\";')"
```

コンテンツを増やしたいときは `js/data.js` を編集してください。
