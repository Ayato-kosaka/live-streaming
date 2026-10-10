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
| `studio(url)` | **新しいタブを1枚作り、ほかを全部閉じて**開く（下の「固まるタブ」） |
| `current()` | 前の send-command で開いたタブの続き（ダイアログを開いたまま次の手を打つとき）。固まっていれば `None` |
| `capture(t, url=…, act=…)` | 開く／押すあいだに出た youtubei の要求と返事を全部拾う。**知らない画面はまずこれ** |
| `api(t, endpoint, body)` | youtubei を叩く。`context` と認証（SAPISIDHASH）はページの中で補う |
| `list_videos(t, flt, stop=…)` | 一覧を新しい順に全部たどる。`stop(v)` で途中で止める（差分だけ見る） |
| `get_videos(t, ids)` | id を指定して取り直す |
| `summarize(v)` | 1本を棚卸しの列（開始・長さ・公開・収益化・申し立ての理由・編集中か）にする |
| `claims(t, id)` / `claim_summary(c)` | その動画の申し立て（曲名・方針・一致した最長区間・取れる対応） |
| `claim_segments(t, id, claim)` | 申し立てが一致した区間（ミリ秒） |
| `mute_claim(t, id, claim)` | 申し立て1件を「区間のすべての音をミュート」で対応する。**元に戻せない** |

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
| 申し立てに対応（曲の消去） | `video_editor/edit_video` | `claimEditChange.addRemoveSongEdit`（`method` は `REMOVE_SONG_METHOD_MUTE`＝区間を全部ミュート／`REMOVE_SONG_METHOD_WAVEFORM_ERASE_ML`＝曲だけ消す） |

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
- **最初の `up("ytstudio")` は数分かかる。** 既定のプロファイル（1.2GB）を複製するから。120秒を超えるので
  `run_in_background` で回す。2回目からは数秒
- **EC2 のメモリは 3.8GB しかない。** ほかのセッションの Chrome（`cdp-suzuri` など）と並ぶと空きが 300MB まで落ち、
  タブが固まりやすくなる。よその Chrome は落とさない。混んでいるときは時間をずらす
- **書き込みは元に戻せないものがある。** 曲の消去は「一度適用された編集内容は恒久的」と画面が言う。
  `mute_claim` の前に、何本・どの区間に送るかを `--dry` で出してから流す
