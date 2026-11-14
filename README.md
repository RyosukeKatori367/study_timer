# グミ勉

勉強用タイマーの Web アプリ。iPhone のホーム画面に追加して使う（PWA）。

公開先: https://ryosukekatori367.github.io/study_timer/

## 使い方

- 横にスワイプして3つのモードを切り替える（左: ポモドーロ／中央: タイマー／右: ストップウォッチ）
- 計測中は画面が切り替わらない
- `finish` は押し間違い防止のため長押し
- タイマーのプリセットは長押しで削除、`＋` で今の時間を追加
- 設定で「計測中、傾けたら横向きにする」をオンにすると、画面の向きをロックしていても、本体を横に倒したときに計測画面が横向きになる（モーションセンサーの許可が必要）
- 記録は端末の中だけに保存される。設定 →「記録を書き出す」でバックアップできる

iPhone では Safari で開いて、共有 →「ホーム画面に追加」。画面をつけたままにする機能は iOS 18.4 以降で動く。

## 開発

```sh
npm install
npm run dev      # 開発サーバー
npm test         # 時間計算のテスト
npm run build    # dist/ に出力
```

`main` に push すると、GitHub Actions がビルドして GitHub Pages に公開する。
初回だけ、リポジトリの Settings → Pages → Source を「GitHub Actions」にする。

## 構成

| ファイル | 役割 |
| --- | --- |
| `src/engine.ts` | 時間の計算（開始時刻との差で出すので、アプリを閉じてもずれない） |
| `src/store.ts` | 設定と記録の保存（localStorage、キーは `studytimer:` で始まる） |
| `src/summary.ts` | 統計画面の集計 |
| `src/run.ts` | 計測中の画面 |
| `src/pages/` | タイマー／ストップウォッチ／ポモドーロ／統計／設定の各画面 |
| `src/ui/` | 目盛りの円、ドラム、入力シートなどの部品 |
| `src/audio.ts` `src/wakelock.ts` | 音、画面スリープ防止 |
| `src/orientation.ts` `src/tilt.ts` | 傾きの判定と、傾きセンサー |
