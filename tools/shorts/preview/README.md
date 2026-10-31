# ショートの下見を渡す（あやとがスマホで開ける URL）

書き出したショートを、あやとがスマホで開いて見られる URL にする。**7日で見られなくなる。**
1つのページに動画を並べる（題・長さ・`<video playsinline controls>`）。

**なぜこの形か。** 前は EC2 の Chrome からあやとの Google ドライブへ上げていて、作業箱 → EC2 の
転送（SSM の小分け）で3本95MB に約35分かかった。あやと（2026-10-16）「ドライブに置く →
Firebase storage か GCS に置いたら？ パブリックバケット作っても良いし」「動画のレビューは
非公開に無理にする必要ないので issue に書いて良い」。

**Actions で書き出した本番の段（`tools/shorts/render/remote.py`）は、下見も report の job が同じ配り方で置く**
（URL は要約 `summary.json` の `preview`。#1011）。`put.py` を使うのは、手元で書き出したものを見せるときだけ。

## 使い方（作業箱で）

```bash
# 置く。ページの URL と、1本ずつの URL を --urls のファイルに書く
python3 tools/shorts/preview/put.py up --name yk-v3b \
  --key <スクラッチパッド>/keys/ref_private.pem \
  --out <スクラッチパッド>/preview --urls <スクラッチパッド>/preview/v3b_urls.txt \
  <書き出した>/B.mp4

# 投稿が済んだら消す（消さなくても7日で見られなくなる。同じ回の新しい版を置けばひとりでに消える）
python3 tools/shorts/preview/put.py delete --name yk-v3b \
  --key <スクラッチパッド>/keys/ref_private.pem --out <スクラッチパッド>/preview

# チャンネルを数える（sha256・作った時刻・消える時刻・札。--known は sha256 → {name} の手元の記録）
python3 tools/shorts/preview/put.py list --key <同じ> --out <同じ> [--known <json>]
# sha256 で指して、いくつも消す（依頼にチャンネル名を書かない）
python3 tools/shorts/preview/put.py delete --key <同じ> --out <同じ> --sha256 <64桁> --sha256 <64桁>
```

- `--name` は英数字と `. _ -`。**同じ名前でもう一度 up すると、新しいチャンネル（新しい URL）になる**
  （前のチャンネルは、新しいほうの確かめが通った時点で消える。下の「片づけ」）
- **名前は `<回>-v<版>` にする**（`edinburgh-p2B-v8`）。下書きは終わりに `d1` `d2` …（`leeds-p3-v1d1`・
  `edinburgh-p2B-d2`）を付けると1日で消える。形の違う名前は、回が分からないので片づけの対象にならない
- 題は同じフォルダの `post_<名前>.json`（投稿文）の YouTube の題を拾う。
  無ければ `--label B.mp4=題`。ページの見出しは `--title`
- 結果は `--out/preview/<name>/` に開く（`urls.json`・`run.json`・スマホ幅で撮った `phone.jpg`・`timing.json`）。
  `--out` と `--urls` はリポジトリの外にしか置けない
- URL は **制作 issue に貼ってよい**。リポジトリには平文で入れない
- master に入ったあとは `--via dispatch` で workflow_dispatch から起こせる（既定は依頼ファイルを作業枝に積む形）

## 流れ（いまの置き場は Firebase Hosting のプレビューチャンネル）

```
作業箱 put.py                     作業枝 claude/…                     Actions shorts_preview.yml（serve.py → host.py）
 依頼を積む ───────────────→ shorts/preview/<name>.json ─push→ 起きる。RSA 鍵をその場で作る
                               shorts/.work/preview/<name>/inbox.json ←─ 公開鍵を置く（firebase-tools を入れ始める）
 動画＋meta.json を包んで積む ─→ …/<name>/upload/（45MB ずつ）  ──→ 開く・sha256 を依頼と突き合わせる
                                                                       一時の場所に動画と index.html だけ置いて
                                                                       期限切れを消す（上限が近ければ下書き・古い版も）
                                                                       hosting:channel:deploy sp-<乱数> --expires 7d
                                                                       札（回・版・種類）を付ける
                                                                       落とし直し sha256・Range 206・スマホ幅で再生
                                                                       通ったら、同じ回の古い版のチャンネルを消す
                               …/<name>/manifest.json ほか   ←── URL をこちらの公開鍵で包んで置く
                                                                       （同じ commit で依頼・inbox・upload を下ろす）
 開いて URL を書く・暗号文を下ろす
```

- **本番のサイト（live チャンネル）には触らない。** 配るのは `hosting:channel:deploy` だけで、
  チャンネル名は `sp-` ＋乱数20桁の形しか通さない。本番の `firebase.json`・`public/` は使わず、
  ランナーの一時の場所（リポジトリの外）に置いた設定（noindex・no-referrer の見出しだけ）で配る
- **動画を包む鍵はランナーがその場で作り、ランナーと一緒に消える。** 長く生きる鍵で公開の
  履歴を守らない。作業箱からは Hosting にも artifact にも届かず、届くのは git だけなのでこの形
- 作業箱からは `*.web.app` に届かない（proxy が 403）。だから**落とし直しの sha256・範囲の要求（206）・
  スマホ幅（390px）のヘッドレスの Google Chrome での再生は、配った直後にランナーで見る**
  （`playcheck.mjs`。Playwright の Chromium は H.264 を再生できないので使わない）。
  ランナーには和文の書体が無いので、`phone.jpg` の見出しは豆腐になる（スマホでは出る）
- ログに出すのは名前・数・秒・成否だけ。firebase-tools の出力はファイルにだけ受ける。artifact にはしない

### かかった時間（2026-10-16 の実測。v2 の3本・96MB）

| 段 | 起動からの秒 |
| --- | --- |
| 依頼を積む | 3 |
| ランナーが起きて受け取り口を開く | 26 |
| 包む（3秒）・積む（14秒） | 42 |
| ランナーが受け取る → 配る（7秒）→ 落とし直す（9秒）→ スマホ幅で再生（11秒）→ 結果が戻る | 82 |
| URL を書いて暗号文を下ろす | **85** |

前の道（EC2 経由でドライブ）は約35分。小さな動画1本（1.6MB）で95秒（ランナーが起きるのに49秒）。
ランナーが起きるまでの秒は混み具合で変わる。

## 片づけ（チャンネルの上限は50本。`channels.py`）

**2026-10-31 に、両方の道（書き出しの report と put.py）で配りが続けて落ちた。** 字は
`HTTP Error: 429, Couldn't create channel on … : channel quota reached.`。そのとき下見のチャンネルは
**50本**（＋本番の live）で、49本のときは作れた。版を直すたびに7日のチャンネルを作り、前の版を残していた。
50本の中身は、記録で確かめられた同じ回の古い版が19本、**期限を過ぎたのにまだ数に入っているもの**が11本
（Hosting は期限のあと約1日たってから消す）、残りが最新の版と、記録の無いもの。

だから、配るたびに次をやる（書き出しの report も put.py の道も `host.place` → `host.settle` を通る）:

| いつ | 何を消す |
| --- | --- |
| 配る前に、いつも | 期限を過ぎたもの。もう誰にも見えないのに、消えるまで上限に数えられる |
| 配る前に、配ったあとの数が `CAP − ROOM`（50 − 5）を越えそうなとき | 下書き → 札の上で古い版になっているもの、の順に古いものから |
| 配って、落とし直し・範囲・スマホ幅の再生が全部通ったあと | **同じ回の、それより古い版で、それより前に作ったもの** |

- 下書き（名前の終わりが `d1` `d2` …）は**1日**で置く
- チャンネル名は乱数（URL を推されないため）なので、名前からは回も版も読めない。配った直後に
  **札（labels: 下見の名前・回・版・種類）**を付けて、片づけはその札で選ぶ。札の無いもの（この仕組みより前に
  作ったもの・札を付けられなかったもの）は、期限切れのほかは消さない
- 消せるのは `sp-<20桁>` の形だけ（`channels.Api.delete` が、live と形の違う名前を通信の前に断る）
- 片づけが落ちても配りは止めない（ログに ::warning:: と数だけ出す）

**なぜこの形か。**

- **古い版は、新しい版の確かめが通った時点で要らなくなる。** あやとが見るのはいつも最新の版で、
  10/31 の50本のうち19本がそれだった。確かめで落ちた版は前の版を消さない（見られるものを残す）
- **後から作ったものは消さない。** 同じ版を2本同時に書き出すことがある（10/31 の leeds-p3-v1 は2本が5秒違いで
  終わった）。互いに消し合うと両方消える
- **上限が近いときも、最新の版は消さない。** 古いものから黙って消すと、あやとが見ている版が消える。
  消してよいものが無ければ、そのまま配って上限の字（とそのときの数）で落ちる
- 寿命を全部短くする案は取らない。あやとの見るのが何日か後になることがあり、1時間に10版出す日には効かない
- 回ごとに1つのチャンネルへ版を上書きする案も取らない。issue では「v6 の URL」で話していて、同じ URL の
  中身が黙って変わると、どの版を見ているかが分からなくなる（CDN に前の版が残ることもある）

**見張り:** `channels_selftest.py`（決まり。消しすぎと消さなすぎの両方）と `host_selftest.py`
（2つの道が決まりを通るか）。どちらも Hosting に触らない（偽の API と偽の firebase-tools）。
足を書き換えたら `python3 python/mutation_drill.py tools/shorts/preview/channels_selftest.py
tools/shorts/preview/host_selftest.py` で、守っている実物を壊して赤くなるかを見る。

**録画を受け取るページ（`tools/shorts/upload/serve.py`）も同じ上限を食う。** あちらは下見ではないので
この片づけを通らず、7日で消えるのを待つ（期限切れは、下見を配るときにここが消す）。

手で消すとき:

- `put.py list` で数えて、`put.py delete --sha256 …` で消す（依頼にはチャンネル名を書かず、
  sha256 で指す。ランナーが一覧から探して消し、ページが 404 になるまで見る）。1本なら `put.py delete --name`
- 作業枝の依頼・受け取り口・荷物・結果は、put.py とランナーが使い終わったその場で下ろす。
  途中で止めたときは `shorts/preview/<name>.json` と `shorts/.work/preview/<name>/` を git rm する

## GCS の道（非公開バケットの署名付き URL。2026-10-17 から使える）

`put.py up --place gcs`。Actions が `live-streaming-d3cac-shorts-preview`（us-central1・公開アクセス防止を強制・
均一アクセス・14日で消える）にファイルごとの上げる URL（PUT・1時間）と見る／消す URL（7日）を作り、
作業箱はそこへ**直に上げる**。落とし直した sha256 と、署名なしの道が 403 になること（非公開）を毎回見る。
v2 の3本（96MB）で**起動から見る URL まで37秒**（1本 0.7〜1.3秒で上がった）。Hosting の85秒より速い。
見る URL は1本ずつの mp4 で、並べたページは無い（ページが要るときは hosting）。

Actions のサービスアカウントはプロジェクト全体の Storage には何もできない（2026-10-16 の実測）。
このバケットだけ、あやとが Cloud Shell で作って管理者を付けた（#938）:

```bash
gcloud storage buckets create gs://live-streaming-d3cac-shorts-preview --project=live-streaming-d3cac --location=us-central1 --uniform-bucket-level-access --public-access-prevention --soft-delete-duration=0
gcloud storage buckets add-iam-policy-binding gs://live-streaming-d3cac-shorts-preview --member=serviceAccount:github-action-live-streaming@live-streaming-d3cac.iam.gserviceaccount.com --role=roles/storage.admin
```

14日の寿命の決まりは、`gcs.py` が最初に使うときに足した（buckets.update が付いているので）。
同じバケットを、書き出しを Actions で並べる道（`tools/shorts/render/remote.py`）の受け渡しにも使う。
あやとが上げる録画（`uploads/`、`tools/shorts/upload/`）は30日置くので、14日の決まりは
`preview/` `render/` だけに掛けてある（寿命の決まりは「どれか1つに当たれば消す」）。
EC2 へ動画を渡す受け渡し（`transfer/`、依頼の place が `transfer`。`tools/shorts/post/send.py`）は
1日で消える決まりを `transfer/` だけに足した。見る・消す URL は3時間（URL が EC2 の SSM のログに載るので短くする）。

## 落ちたときの見方

1. `put.py` の最後の行（`!! …`）。Actions で落ちたときは暗号化した `run.json` の `error` を開いて出す
2. Actions の「ショートの下見を置く」のログ（何の段で落ちたか・権限の ○/✕）
3. 受け取り口が来ない → ランナーが起きていない（混み具合）か、依頼の形で落ちた（ログの1行目）
4. `firebase hosting:channel:deploy が通らなかった（終了 1）: …` → `:` のあとが firebase-tools の理由の字
   （URL・チャンネル名・アカウント・トークン・長い字は伏せてある。`channels.safe_reason`）。
   書き出しの report では「下見: !! 落ちた（…秒）: …」の行。`channel quota reached` なら上限
   （上の「片づけ」。`put.py list` で数える）
