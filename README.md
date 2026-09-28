# はじめてのラウンド

ゴルフ初心者が約3か月（12週）でコースデビューするための練習ウェブアプリ。

## 開き方

`index.html` をブラウザ（Chrome / Safari / Edge）で開くだけで動きます。
3D表示に使う Three.js は CDN から読み込むので、インターネット接続が必要です。

## できること

| タブ | 内容 |
|---|---|
| ホーム | 3Dコースのカメラワーク、デビューまでのカウントダウン、今週のメニュー、12週スコアカード、今日のうんちく |
| プラン | 12週プログラム（1週＝1ホール）。タスクをチェックして進める |
| 練習 | ドリル図鑑（20種・図解つき）、テンポ練習（音つき）、パター距離感ゲーム（3D） |
| 学ぶ | 3Dコース図鑑、ゴルフの歴史、うんちく、クイズ、用語集、ルールとマナー、デビュー準備、クラブの基本 |
| 記録 | 練習ログと週ごとの練習時間グラフ |

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
assets/ball-glb.js    Blender で作ったディンプル付きボール（GLB を埋め込み）
assets/*.png, *.jpg   Blender でレンダリングしたアイコンとヒーロー画像
tools/blender_assets.py  上の素材を作る Blender スクリプト
tools/build_artifact.py  1枚のHTMLにまとめる（公開用 → dist/artifact.html）
```

## 素材を作り直す

```
blender -b -P tools/blender_assets.py
python3 -c "import base64;b=open('assets/ball.glb','rb').read();open('assets/ball-glb.js','w').write('window.BALL_GLB_BASE64=\"'+base64.b64encode(b).decode()+'\";')"
```

コンテンツを増やしたいときは `js/data.js` を編集してください。
