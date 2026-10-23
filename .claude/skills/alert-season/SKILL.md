---
name: alert-season
description: 投げ銭アラート（app/alertbox）の季節テーマ（貯金箱と、投げ銭の後ろに出る小物）を提案して作って出す手順。いま適用するならどれかを数案出し、あやとが選んだものを ChatGPT（EC2 の Chrome）で描き、コマ送りの貯金箱・金額4段の小物・締めの群れにして、録画を見せてから本番に出す。期間が終われば豚に戻る。トリガー語:「季節テーマ」「アラートの季節」「貯金箱を季節に」「ハロウィン仕様」「クリスマス仕様」「投げ銭アラートを刷新」「alert-season」。
---

# 投げ銭アラートの季節テーマ

最初の1本はハロウィン（#1022 / PR #1023）。ここはその手順を次の季節でも同じに回すための紙。

## 0. 決まっていること（#1022、あやと 2026-10-23）

| | 決め |
| --- | --- |
| 何を変えるか | **貯金箱**（豚の代わりの器。溜まる色も季節の色）と、**投げ銭の後ろに出る小物**（キャラの絵より奥。最後に何かが群れで横切って締める） |
| 小物の量 | **金額で4段**: 〜999 / 1,000〜4,999 / 5,000〜9,999 / 10,000〜（superchat は `jpy`） |
| 名簿の絵文字の花火・雨 | **両方出す**（季節のものは後ろ） |
| 効果音 | **変えない**（`Coins.mp3`） |
| 期間外 | **豚に戻る**（今の豚と画素まで同じであること） |
| 背景 | **塞がない。** 中央は空ける。ベタ塗りしない |
| 誰が選ぶか | **こちらが提案し、あやとが選ぶ**（どの季節を作るかは仕様なので、こちらで決めない） |
| 見せ方 | **録画で見せる**（あやとが録画で確認したいと言った） |

## 1. 提案する（issue で）

1. `app/alertbox/themes.ts` の `THEMES` を読み、**いま効いているテーマと、次に切れる日**を出す
2. 今日から先 6〜8 週の季節の候補を、表で出す（期間（JST）・器 → 溜まる色・小物・締め）。
   作るのに 1 日、録画で直して 1〜2 日かかるので、**始まりまで 1 週間を切るものは「今年は間に合わせ」と書いて分ける**
3. `/ask-ayato` の形で issue に書き、通知を飛ばす。**返事を待つあいだは止まらない**（下の 2 の道具の手入れ・去年の絵の点検など）
4. **去年と同じ季節なら、絵は使い回せる**（`public/alert/themes/<id>/`）。その場合は「去年の絵で日付だけ足す / 描き直す」を選択肢として並べる

## 2. 描く（ChatGPT、EC2 の Chrome）

操作は `/chatgpt`・`/chatgpt-image`。**1つの会話で続けて描かせる**（絵柄が揃う）。
タッチは LINE スタンプ風・太めの焦げ茶の輪郭線・かわいく、怖くしない（アラートは島の外なので
`docs/island-design.md` §2 の「輪郭線を引かない」は当てない）。

置き場 `public/alert/themes/<id>/`、すべて透過 PNG:

| ファイル | 中身 | 作り方 |
| --- | --- | --- |
| `bank-fill-0..3.png` | 満タンの器の**動きの4コマ**（外形はほぼ同じで、表情・灯り・ヘタなどで動かす）。横長 約 2.1:1、幅 1200 | ChatGPT に**1枚のシート（2×2 か 4×1）**で描かせ、`alert_theme.py frames` で切って位置を揃える |
| `bank-base-0..3.png` | 空の器 | **描かせない。** `alert_theme.py base` で fill から作る（透明度を1画素も変えないので、溜まる境目がずれない） |
| `fx-*.png` | 小物（長辺 332 前後） | シートで描かせて `split` → `item` |
| 締めの2コマ（例 `fx-bat-0/1.png`） | 横切る群れの羽ばたき | 同上。2コマを同寸法・同位置に |
| `manifest.json` | 寸法と、bank の中身の外接矩形 | `alert_theme.py manifest` |

```bash
python3 tools/alert-theme/alert_theme.py frames <シート.png> public/alert/themes/<id>/bank-fill --grid 2x2 --width 1200
for i in 0 1 2 3; do python3 tools/alert-theme/alert_theme.py base public/alert/themes/<id>/bank-fill-$i.png public/alert/themes/<id>/bank-base-$i.png; done
python3 tools/alert-theme/alert_theme.py split <小物シート.png> <scratch>/fx --grid 3x2
python3 tools/alert-theme/alert_theme.py item <scratch>/fx-0.png public/alert/themes/<id>/fx-<名前>.png --long 332
python3 tools/alert-theme/alert_theme.py manifest public/alert/themes/<id>
python3 tools/alert-theme/alert_theme.py preview public/alert/themes/<id> <scratch>/prev   # 紺と緑の地・4コマの GIF・溜まり見本
```

**合格**: 白いフチ・にじみが無い（`preview` の紺と緑で目視）／ base と fill の透明でない範囲が一致／
4コマを重ねて外形が跳ねない／合計 2MB 以下。

## 3. 定義を足す（`app/alertbox/themes.ts`）

`THEMES` に1件足すだけで動く。ハロウィンの定義を写して変える:

- `from` / `until` は **JST**、`until` は含まない（10/31 まで → `"2026-11-01T00:00"`）。
  **年を持っている。** 来年も同じ季節を出すなら、来年の日付で1件足す（絵の `dir` は使い回してよい）
- `bank.sequence` は**等間隔にしない**。ふだんの顔で長く休み、ときどき動く
- `text` は器の色の上で読める色（ハロウィンはオレンジの額に濃紫の縁）
- `slots` は四隅と下端だけ。中央に寄る枠を作らない
- `tiers` は4段。枠の数・出る小物・締めの数で段差がはっきり分かるように
- 向きのある絵は `FxDef` で反転の可否を持つ（正面の絵は反転しない）

テスト `app/alertbox/__tests__/season.test.ts` に、**新しいテーマの境界の日時**と段の境界を足す。

## 4. 確かめる・録る

```bash
npx jest app/alertbox                       # roster.test.tsx の時間切れ 1〜3件は master でも落ちる（2026-10-23）
npx expo export --platform web --output-dir <scratch>/web
python3 -m http.server 4310 --directory <scratch>/web &
cd tools/sprites
for a in 500 3000 7000 20000; do node alert-record.mjs --base http://localhost:4310 --amount $a --theme <id> --out <scratch>/rec/<id>-$a.mp4; done
node alert-record.mjs --base http://localhost:4310 --mode bank --fill 100 --rise 8 --size 960x540 --seconds 11 --theme <id> --out <scratch>/rec/<id>-bank.mp4
```

（`--theme` の既定は `halloween`。新しいテーマでは必ず付ける）

見るところ:

- **期間外と `theme=none` が master の豚と画素差 0**（`?preview=bank&fill=…` を master と並べて撮る）
- 小物がキャラの後ろ・中央が空いている・締めがアラートの消える前に終わる
- **貯金箱が出た直後に絵が欠けるコマが無い。** CSS の opacity でコマを替えると、Chrome が
  タイルを描き終える前に出して欠ける（#1022 で 1,650 コマ中 5 コマ）。コマ送りは JS で
  `visibility` を切り替える形のまま触らない

試し表示の URL（本番でも外へは繋がない）:
`/alertbox?preview=1&theme=<id>&amount=7000` ／ `/alertbox?preview=bank&theme=<id>&fill=50&rise=8`

## 5. 見せる → 出す

1. 録画（4段＋溜まる様子）をチャットに `SendUserFile` で送り、issue に「録画を出した」と書く
2. 基準に届いているかを**こちらで決めて**、`/island-ship` で出す（`app/` と `public/` なので
   `Firebase Hosting Deploy`）。期間の始まりより前に出しておけば、その日の 0:00 にひとりでに切り替わる
3. 本番で `?preview=1&theme=<id>` を開いて、絵が 200 で返るかを見る
4. 期間が終わると豚に戻る。**終わったテーマは消さない**（来年の使い回し）
