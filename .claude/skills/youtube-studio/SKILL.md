---
name: youtube-studio
description: YouTube Studio（studio.youtube.com、あやとのチャンネル UCCwutAH6ieHNvdyJAfSld7w）を、EC2 のログイン済み Chrome から読む・操作する共通の土台。動画の一覧・収益化の状態・著作権の申し立て・動画の編集を、画面が裏で送る youtubei の要求から読み書きする。トリガー語:「YouTube Studio」「Studio」「スタジオ」「動画の一覧」「申し立て」「著作権」「収益化の状態」「youtube-studio」。
---

# YouTube Studio を触る（共通の土台）

**EC2 と Chrome の触り方は `ec2-chrome` に書いてある。** ここは、その上で Studio を扱うための道具と躓きだけ。
用事ごとのスキルはこれに乗る（ライブアーカイブの収益化は `youtube-live-ads`）。

## 0. 公式の API では足りない（2026-10-10 に調べた）

| 口 | 何ができるか | 何ができないか |
| --- | --- | --- |
| YouTube Data API v3 | 動画の一覧・ライブの開始時刻・公開設定 | **申し立て・収益化のオン/オフ** |
| Content ID API | 申し立ての管理 | **権利者（申し立てる側）専用。** 申し立てを受ける側は使えない |
| 公式の MCP | 無い（出てくるのは他社製だけ） | — |

なので、**Studio の画面が裏で送っている `studio.youtube.com/youtubei/v1/...` を、ページの中から送る。**
画面の字を読むより確実で、30件ずつ送らなくても全件が JSON で取れる（822本を40秒）。

## 1. 道具（`yt_studio.py`、EC2 の `/home/ubuntu/cdp/` に置く）

```bash
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/ec2-chrome/cdp.py /home/ubuntu/cdp/cdp.py
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/youtube-studio/yt_studio.py /home/ubuntu/cdp/yt_studio.py
```

| 関数 | 何をするか |
| --- | --- |
| `studio(url)` | **新しいタブを1枚作り、ほかを全部閉じて**開く（下の「固まるタブ」）。`up("ytstudio")` を通るので、列 `ytstudio` の札をそのプロセスで取る（ほかの人が持っていれば空くまで待つ。`ec2-chrome` 2.5） |
| `current()` | 前の send-command で開いたタブの続き（ダイアログを開いたまま次の手を打つとき）。固まっていれば `None` |
| `capture(t, url=…, act=…)` | 開く／押すあいだに出た youtubei の要求と返事を全部拾う。**知らない画面はまずこれ** |
| `api(t, endpoint, body)` | youtubei を叩く。`context` と認証（SAPISIDHASH）はページの中で補う |
| `list_videos(t, flt, stop=…)` | 一覧を新しい順に全部たどる。`stop(v)` で途中で止める（差分だけ見る） |
| `get_videos(t, ids)` | id を指定して取り直す |
| `summarize(v)` | 1本を棚卸しの列（開始・長さ・公開・収益化・申し立ての理由・編集中か）にする |
| `claims(t, id)` / `claim_summary(c)` | その動画の申し立て（曲名・方針・一致した最長区間・取れる対応） |
| `claim_segments(t, id, claim)` | 申し立てが一致した区間（ミリ秒） |
| `resolve_claim_ui(t, id, 曲名, how)` | 申し立て1件に**画面を押して**対応する。`how` は `erase`（曲だけ消し、声は残す）か `mute`（区間を全部無音）。**元に戻せない**。1本90秒ほど |

EC2 で回すときの形:

```sh
cd /home/ubuntu/cdp && timeout 280 python3 - <<'PY'
import sys; sys.path.insert(0, "/home/ubuntu/cdp")
from yt_studio import *
t = studio(url_of("videos/live"))
rows = [summarize(v) for v in list_videos(t)]
dump(rows, "/home/ubuntu/shots/live_all.json")
PY
```

## 2. 知らない画面を触るときの手順

1. `capture(t, url_of("video/<id>/claims"))` で、開いたときに読んでいる要求を拾う
2. 書き込みは**1回だけ画面で押し**、`capture(t, act=押す関数)` でそのとき飛んだ要求を写す
3. 写した要求を関数にして `yt_studio.py` に足す。以後は画面を押さない

画面を押すときの決まり:

- ボタンは字で探す: `[...document.querySelectorAll('ytcp-button, button')].find(e => e.innerText.trim() === '次へ')`
- 開いているダイアログは `[...document.querySelectorAll('ytcp-dialog')].find(e => e.offsetParent && e.innerText.includes('…'))`。
  **非表示の `ytcp-dialog` が何枚も DOM に残っている**ので、`offsetParent` で見えているものに絞る
- ラジオは `tp-yt-paper-radio-button` の `aria-checked`、チェックは `ytcp-checkbox-lit` の `checked` 属性で、
  **押したあとに選ばれたかを読んで確かめる**

## 3. 分かっている要求（2026-10-10 に写した）

| 何を | endpoint | 要るもの |
| --- | --- | --- |
| 一覧 | `creator/list_creator_videos` | `filter`（ライブは `LIVE_FILTER`）・`order`・`pageSize`・`mask`・`pageToken` |
| 1本ずつ | `creator/get_creator_videos` | `videoIds`・`mask` |
| 申し立て | `creator/list_creator_received_claims` | `videoId` |
| 一致した区間 | `copyright/get_creator_received_claim_matches` | `videoId`・`claimId`・`channelId` |
| 申し立てに対応（曲の消去） | `video_editor/edit_video` | `claimEditChange.addRemoveSongEdit`。曲だけ消す＝`claimId` と `method: REMOVE_SONG_METHOD_WAVEFORM_ERASE_ML` だけ／区間を全部ミュート＝`REMOVE_SONG_METHOD_MUTE` に `muteSegments`（`get_creator_received_claim_matches` の区間）と `allKnownMatchesCovered: true` |

**書き込みは `api()` から送っても効かない。** `video_editor/edit_video` を画面と同じ本文で送ると、200 の空 `{}` が返って
何も起きない（2026-10-12 に49本ぶん踏んだ）。`context.user` の委任と、画面が付けているヘッダー
（`X-YouTube-Delegation-Context` ほか）を足しても同じだった。**書き込みは画面を押す**（`resolve_claim_ui`）。
読み取り（一覧・申し立て・区間）は `api()` でよい

列の読みかた（`summarize` が使っているもの）:

- `monetization.adMonetization.effectiveStatus` — `MONETIZING` / `MONETIZING_WITH_REVSHARE`（権利者と分け合い）/
  `NOT_MONETIZING_INELIGIBLE`（申し立てで対象外）/ `NOT_MONETIZING_OFF`（スイッチがオフ）
- `allRestrictions.restrictions[].copyright.detail` — `M10N_TRACK_POLICY_YPP`（収益化だけ止まる）/
  `PARTIAL_BLOCK_M10N_INELIGIBLE`（一部の国で見られない＋収益化が止まる）
- `inlineEditProcessingStatus` — `PROCESSING` なら「動画編集が進行中です…」。**このあいだ次の申し立てに触れない**
- 一覧の `videosTotalSize` は推定値（`ACCURACY_ESTIMATION`）。数は最後までたどって数える

## 4. 躓いたところ

- **固まるタブ。** 前の send-command で開いたタブに繋ぎ直すと、`Page.enable` も `Runtime.evaluate` も
  返らないことがある（2026-10-10 に2回。ダイアログは出ていなかった）。`Target.closeTarget` なら閉じられるので、
  `studio()` は毎回新しいタブを作る。続きを触りたいときだけ `current()` を使い、`None` なら最初からやり直す
- **最初の `up("ytstudio")` だけプロファイルを複製する。** 拡張・Google ドキュメントのオフライン・サービスワーカーは
  写さない（約35MB・数秒。2026-10-22 までは 1.2GB をまるごと写して数分かかっていた。#1013）
- **EC2 のメモリは 3.8GB しかない。** ほかのセッションの Chrome（`cdp-suzuri` など）と並ぶと空きが 300MB まで落ち、
  タブが固まりやすくなる。よその Chrome は落とさない。混んでいるときは時間をずらす
- **書き込みは元に戻せないものがある。** 曲の消去は「一度適用された編集内容は恒久的」と画面が言う。
  `mute_claim` の前に、何本・どの区間に送るかを `--dry` で出してから流す

## 5. お金の額（外貨の精算額）は、どこまで読めるか（2026-10-18 に調べた）

**外貨のスパチャを YouTube が「円いくら」で精算したか**を知りたくて調べた（#951 の D 案）。
**公式の口からは読めない。** 同じことをもう一度調べないように、見た先を残しておく。

| 見た先 | 何が出るか | 円の、1件ごとの額は |
| --- | --- | --- |
| Data API `superChatEvents.list` | `amountMicros` + `currency` + `displayString`、**購入通貨のまま**。直近30日ぶんだけ | **出ない**（換算後の欄が資源に無い） |
| Analytics API（チャンネル向け） | `estimatedRevenue` / `estimatedAdRevenue` / `grossRevenue` / `cpm` ほか | **出ない**（Supers 単体の指標が無い。既定は USD） |
| Reporting API のチャンネル用一括 | 視聴・到達・端末などだけ | **出ない**（収益の報告書が1本も無い） |
| **Paid features report** | 1取引ごと（日・種類・国・動画ID・小売価格・税・取り分・収益） | **USD で出る。円ではない。**しかも **Content Manager を使うパートナー限定**で、パートナーマネージャー経由でしか開けない |
| Studio → 収益化 → **Supers** → 「すべて表示」 | 購入の一覧。**直近30日ぶんだけ** | **列が何かは公式に書かれていない。画面を見るしかない** |
| Studio → アナリティクス → 収益 | 収入源ごと（Supers・メンバーシップ…）の**推定収益**。月ごと。取引は**件数**だけ | **出ない**（出るのはこちらの取り分であって、視聴者が払った額ではない） |
| AdSense（確定額） | 前月ぶんが翌月 7〜12日に残高へ | 月の合計。**1件ごとではない** |

**遅れ:** 収益が Analytics に出るまで約2日。そのあと**2回**直る（1週間後と、翌月の半ば）。
確定するのは AdSense だけで、翌月の 7〜12日。**だから「10/31 の月末ランキング」には、
10月ぶんの確定額はどうやっても間に合わない**（月末2日ぶんは推定すら出ていない）。

**基準が違うことにも注意。** 島の貢献額は `スパチャ ÷ 2`、つまり
**視聴者が払った額**を半分にしたもの（`docs/island-money.md` 1章）。
YouTube が出すのは**こちらの取り分**（税を引いた小売価格の約70%）なので、
精算額をそのまま使うと、その行だけ他の547件と**違う物差し**になる。
D 案で本当に要るのは「精算額」ではなく「**視聴者が払った額の、円換算**」。

**まだ見ていないもの:** Studio の Supers の一覧に円が出るかどうか。
EC2 の Chrome で `studio.youtube.com/financials` / 収益化 → Supers を開いて、
`capture()` で裏の要求を写せば分かる（2章の手順）。**直近30日しか残らない**ので、
過去の分（2026-01-09・2026-05-07）はどちらにせよ取れない。
