---
name: mymaps
description: 街の案内の面に埋める Google マイマップ（見たい・食べたい・買いたいの3枚）を、EC2 のログイン済み Chrome（~/cdp-ytstudio）から取り込み直す・新しく作る・リンクで共有する・あやとの Drive のフォルダへ移す・この箱から curl で確かめる。CSV は材料から焼いたもの（bulgaria_mymaps.py / guide_book_check.py --mymaps）。mid は取り込み直しても変えない。パスワードは打たない。トリガー語:「マイマップ」「My Maps」「mymaps」「地図を取り込み直す」「マイマップを作る」「mid」「埋め込みの地図」。
---

# マイマップを EC2 の Chrome から作る・取り込み直す

なぜマイマップか・面に埋めるときの決まり（`&hl=ja`・`loading="lazy"`・`ll` と `z`）は `docs/mymaps.md`。
Chrome を触る土台は `ec2-chrome`（起こす・札・止める）。ここに残すのはマイマップに固有のことだけ。

## 1. 回しかた

```bash
M=.claude/skills/mymaps/mymaps.py
python3 $M sync python/data/bulgaria/mymaps                                   # 3枚を取り込み直す（mid はそのまま）
python3 $M sync python/data/guide/north-macedonia/skopje/mymaps --city スコピエ # mids.json が無ければ3枚を作って mids.json を書く
python3 $M move python/data/bulgaria/mymaps python/data/guide/north-macedonia/skopje/mymaps   # Drive のフォルダへ
python3 $M verify python/data/bulgaria/mymaps python/data/guide/north-macedonia/skopje/mymaps # この箱から curl で確かめる
```

- **CSV を先に焼く。** ソフィアは `python3 python/bulgaria_mymaps.py`、ガイドブック型の街は
  `python3 python/guide_book_check.py <国/街> --mymaps`。ピンを地図の上で手で直さない（面と地図が食い違う）
- 1枚 1〜2分。3枚で 120秒を超えるので、Bash は `run_in_background` で回し、終わりの表だけ読む
- **途中で落ちても、もう一度同じ sync を流せば続きから。** 済んだ手（作った mid・取り込んだ CSV の sha・共有）は
  EC2 の `/home/ubuntu/mymaps/<街>/state.json` に書いてある。同じ CSV なら取り込みは飛ばす。
  わざとやり直すなら `--force`
- 札は `ytstudio`（Google にログイン済みのプロファイルと同じ名前）。道具が持って、終われば返す。
  **EC2 は道具では止めない。** 自分で起こしたなら終わりに `python3 .claude/skills/ec2-chrome/ec2.py stop`
  （使っている人が居れば断られる。そのときは置いておけば30分で見張りが止める）

## 2. 何をしているか（画面の手。2026-11-15 に1手ずつ確かめた）

| 手 | 画面 | 躓き |
| --- | --- | --- |
| 作る | マイマップの一覧の「新しい地図を作成」→「ドライブに上がる」の確かめに CREATE → 題の字を押して題を付ける | **mid を控えてから題を付ける。** 題で落ちて控えずに抜けると、次の回がもう1枚作る（「無題の地図」を3枚溜めて、それを引き取った）。題の箱の真ん中は「表示回数」の行で、押しても開かない |
| 取り込む | `#map-action-add-layer` → `#lyN-layerview-import-link` → ファイル選び（`docs.google.com/picker` の iframe）の「アップロード」→ 隠れた `<input type=file>` | ファイル選びは同じサイトなので別のタブにならない。`DOM.getDocument(pierce)` で input を拾い、`setFileInputFiles` に backendNodeId で渡す |
| 列を選ぶ | 「目印を配置する列」で 緯度 に印 → 吹き出しで 緯度 → 経度 に印 → 吹き出しで 経度 → 続行 →「タイトル」で 名前 → 完了 | **吹き出しを選ばずに次の列の印を押すと、前の列の印が外れる** |
| 古いレイヤを消す | レイヤの「レイヤ オプション」→「このレイヤを削除」→ 削除 | **足してから消す。** 先に消して取り込みが落ちると、地図が空のまま面に出る |
| 名前を付け直す | 「このレイヤの名前を変更」 | 取り込んだレイヤはファイル名（`見たいもの.csv`）になる。CSV を `<見たいもの>.csv` の名前で送り、終わりに `.csv` を取る |
| 共有 | `#map-action-share` → `#linksharing` を押す → 閉じる | **入っているかはスイッチで読まない。** ログインしていない側から KML が 200 か（403 なら非公開）で決め、非公開のときだけ押す。スイッチの `checked` は開き直すと入っていても「切」と読め、それを信じて押して2枚の共有を切った（2026-11-15）。`#discoverability`（検索で見つかる）は触らない |
| フォルダへ移す | ドライブで題を検索 → 地図の札を選ぶ → 上の「Move」→ 移動先 → Move | 地図の Drive の id は mid と同じ。移動のダイアログは表の枠の `[role=dialog]` ではない（見出し「Move “…”」から Cancel のある箱まで登って、その中だけを触る）。下の 3 |

- **押すのは本物のマウスで、押す点にその要素が居るのを確かめてから**（`press()`）。レイヤが増えると左の板が送られ、
  測った直後の座標が隣の箱を指して「インポート」が開かなかった。ファイル選びの「アップロード」は JS の `click()` では開かず、
  字は葉の要素に入っていない（字の節の位置を Range で測り、枠の位置を足して押す）
- **要素を返す式を `returnByValue` で読まない。** `{}` になって Python では偽に読め、待ちが全部「待ちきれない」で落ちた
- **埋め込みは非公開でも 200 を返す。** 公開かどうかは中に題が在るか・KML が 200 か（`verify` が見る）
- **好みの印で色を分けたスタイル（「スタイル: 印」）は、取り込み直すと消える。** 印の列はもう無い（`docs/island-misses.md` #326）
- **ログインが切れていたら止まる。** accounts.google.com に飛ばされた時点で `LOGIN_NEEDED` を出して抜ける
  （押さない・パスワードは打たない・本人確認の画面は開かない）。そこから先は `ec2-chrome` の 3

## 3. Drive のフォルダ

あやと 2026-11-15「マイマップはここに格納すること」:
<https://drive.google.com/drive/folders/1ldXPVCYmbhLOXfptFZnB12YdlWARA-MG>（`mymaps.py` の `FOLDER`）。

- **ほかのファイルには触らない。** フォルダには前からほかの街のマイマップが入っている。道具が動かすのは mids.json の mid だけ
- フォルダの名前は「GoogleMyMap」（My Drive > Travel の下）。移すのはドライブの画面（マイマップの「⋮」には「フォルダに追加」が無い。2026-11-15）
- `move` は終わりにフォルダの中身の題を出す

## 4. 確かめる（この箱から）

`verify` が mids.json の mid ごとに curl で見る（ブラウザが要らない。マイマップの埋め込みと KML はこの箱から届く）:

- `https://www.google.com/maps/d/embed?mid=<mid>&hl=ja` が 200 で、中に地図の題が在る（非公開でも 200 が返るので、題で見る）
- `https://www.google.com/maps/d/kml?mid=<mid>&forcekml=1` のピンの数が CSV の行と同じで、名前が全部ある
- 前の取り込みの残り（`印` の列・「あやとの好みに合う」「たぶん合う」「注意（…）」・◎○⚠△・`query=<緯度>,<経度>`）が 0
