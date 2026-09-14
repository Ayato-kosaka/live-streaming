---
name: nightly-check
description: 毎晩の取り込み（Fetch YouTube Chat Data）を見届ける手順。走ったかを確かめ、island_stats の各ステップのログを読み、本番の件数まで突き合わせる。緑でも中身を見る。トリガー語:「取り込み」「毎晩のジョブ」「取り込みを見届ける」「島の集計」「nightly」。
---

# 毎晩の取り込みを見届ける

`.github/workflows/schedule_fetch_chat.yml`（`Fetch YouTube Chat Data`）は、
島の数字・投げ銭の台帳・あやと島カード・その日の名簿を**まとめて作り直す1本**。
ここが静かに壊れると、翌朝あやとが気づく手段が無い。**緑でも中身を読む。**

## 1. いつ走るか

cron は `0 20 * * *`（20:00 UTC）だが、**GitHub のスケジュールは常に遅れる。**
実測で 21:49 / 21:53 / 21:59 / 22:26 UTC。**2時間半ずれても異常ではない。**

「まだ走っていない」と判断するのは日付が変わってからでよい。
それでも来なければ `workflow_dispatch` で手動起動する。

> **手動起動の前に、スケジュールと重ならないことを確かめる。**
> `fetch_chat_data` は最後に `YOUTUBE_COOKIES` シークレットを書き換える。
> 2本が続けて走るとクッキーの更新が競合し、**壊れると毎晩落ちる。**

`mcp__github__actions_list` は数分古い値を返すことがある。
「無い」と決める前に一度置いてから引き直す。

## 2. 何を見るか

### まず、**2本とも**の結果を並べる（ここを飛ばさない）

毎晩走るのは**2本**ある。**1本目が緑だと、そこで終われてしまう。**

```
mcp__github__actions_list  method=list_workflow_runs  resource_id=schedule_fetch_chat.yml       perPage=1
mcp__github__actions_list  method=list_workflow_runs  resource_id=fetch_doneru_donations.yml    perPage=1
```

| ワークフロー | 何が入る | 落ちると |
| --- | --- | --- |
| `schedule_fetch_chat.yml` | YouTube のコメント・スパチャ・名簿・カード | 島の数字が止まる |
| `fetch_doneru_donations.yml` | **Doneru の投げ銭** | **貯金箱が増えなくなる。減らないので気づけない** |

**2本の結論（success / failure）を先に書き出してから、中身に入る。**

> 2026-09-14 に実際にやった。`schedule_fetch_chat` だけ見て緑を確認して終わり、
> **`fetch_doneru_donations` が前の晩から落ちていたのに気づかなかった**
> （Doneru のセッション切れ。#294）。見つけたのは別件で issue を棚卸ししていたときで、
> 偶然だった。**「本体」を見たら終わり、にしない。**


```
mcp__github__actions_list  method=list_workflow_runs  resource_id=schedule_fetch_chat.yml  perPage=1  minimal_output=true
mcp__github__actions_list  method=list_workflow_jobs  resource_id=<run id>  minimal_output=true
mcp__github__get_job_logs  job_id=<island_stats の job id>  return_content=true  tail_lines=130
```

**`list_workflow_runs` は `minimal_output=true` を付けても `head_commit.message`
が丸ごと返る**（2026-09-08 に実測。数万トークン持っていかれた）。避けられないので、
**run id を取るために1回だけ呼んで、あとは jobs 側で作業する。** 何度も引き直さない。

`list_workflow_jobs` のほうは `minimal_output=true` が効く。**こちらには必ず付ける。**

`island_stats` は8つのスクリプトが順に走る。ログの読みどころ:

| ステップ | 見る数字 | おかしいと分かるの |
| --- | --- | --- |
| あやと島の数字を更新 | — | |
| YouTube のプロフィール写真 | `更新しました N件` | `continue-on-error` 付き。落ちても後ろは動く |
| チャンネルIDと名前の辞書 | 変わった人だけ書く | 毎日数千件書いていたら異常 |
| 投げ銭の台帳 | `BigQuery: N件` / `入れる / 直すもの: N件` | 0件が続くなら取り込みが死んでいる |
| カードを作る | `あるべきカード: N枚` | **画像 × 台帳。0枚なら誰にも渡っていない** |
| その日いた人の名簿 | `YYYY-MM-DD: N人` | 空の日が続いたら `nordicDays` が死んでいる |
| Doneru を名簿に足す | `渡せる / 紐付け待ち / 新規` | **新規がいると終了コード1で赤くなる。異常ではなく呼び出し** |

### Doneru のぶんの札（2026-09-12 から）

`Fetch Doneru Donations` の**最後の step**（「Doneru のぶんが、いつまで
入っているかを写す」）も見る。`islandDoneruHealth/last` を書いていて、
島の「応援する」が**3日以上止まったときだけ**「Doneru のぶんは、◯月◯日まで
入っています」と出す元になっている（#294）。

**この step は `continue-on-error` 付き。** 転んでも**緑のまま**なので、
**step の色を見ずにログの字を読む。** 通っていれば1行だけ出る。

```
INFO DONERU_HEALTH ok
```

出ていなければ写せていない。**そのときは島が黙る側に倒れる**（古い札が残るか、
札が無ければ何も出ない）ので嘘にはならないが、**止まっても誰も気づかなくなる。**

札そのものを見るなら:

```
run_admin_script  script=firestore_read  args={"collection":"islandDoneruHealth","doc":"last"}
```

`okDay` が**今日**なら健康。何日も前のままなら、Doneru の cookie が切れている
（#294。**DevTools でしか入れ直せないので、旅のあいだは誰も直せない**）。

台帳のステップは**0時をまたいだ配信を名指しで出す**。

```
**0時をまたいだ配信**（始まった日と投げ銭の日が違う）:
  q30MlzefQ8c  開始 2026-09-06 → 投げ銭 2026-09-07
```

これは不具合ではない。境目を日本時間0時に決めた結果（#201・#202）で、
拾いきれないぶんは `islandStreamEvent.videoIds` に動画IDを手で足して救う。
**機械で寄せない。**

## 3. 本番と突き合わせる

**ログが緑でも、出ているものを見る。** キャッシュに必ず当たるので
**キャッシュバスタを付ける**（付けないと `x-cache: HIT` で古い返事を読んで、
「0件だ」と誤報する。実際に1回やった）。

```bash
B="https://live-streaming-d3cac.web.app/island-api"; C="cb=$(date +%s)"
curl -s "$B/cards?$C" | python3 -c 'import sys,json
for c in json.load(sys.stdin)["cards"]: print(c["day"], c["photoId"], c["channelId"], c["streamEventId"])'
curl -s "$B/streamevents?day=2026-09-11&$C"
```

**同じ写真から出たカードの `day` がそろっているか**を見る。
割れていたらそれは不具合（2026-09-07 に実際に割れていた。#209 で直した）。
画面は `day` で企画名を引くので、割れたほうは企画名が出ない。

## 3.5 素性が1つも出ていないか（毎晩やる）

**このリポジトリは公開で、Actions のログも誰でも読める。**
毎晩の取り込みは「その晩コメントした人」を扱うので、1人ずつ出すと
**「誰が、いつ、いくら出したか」に等しいもの**が毎晩積まれる。
2026-09-13 の晩に、実際に約25人ぶんが出ていた（`docs/island-misses.md` #83）。

4ジョブぶんのログを落として、数える。

```bash
python tools/logident.py --selftest        # まずこれ。通らない道具の 0 は証拠にならない
python tools/logident.py <落としたログ>
```

`--selftest` を先に回すのは、**探し方が壊れていても 0 と出る**から。
実際に `UC` + 23文字（正しくは22）と、ASCII の文字クラス（日本語のハンドルで切れる）で
2回 0 を出した。

**合格は「全ジョブ 0」。** 0 でないものが出たら、それは直すもの。
「これは あやと本人のIDだから」のような例外を作らない。
例外を覚えていられるうちはよいが、そのうち見落としになる。

ログの落としかたは `mcp__github__get_job_logs` を `return_content: false` で呼ぶと
署名付きの URL が返るので、`curl` で手元に落として数える（本文を文脈に載せない）。

> いま 0 になっていないもの: discover ジョブの `YOUTUBE_CHANNEL_ID`。
> Python ではなく **Actions 自身**が step ごとに env の一覧を echo している。
> secrets に移せば Actions が伏せる（#298 の4つ目でお願いしてある。
> ワークフローは secrets 優先・無ければ vars に落ちる形にしてあるので、
> 入っても入らなくても取り込みは止まらず、入った晩から自動で消える）。

## 4. 落ちていたら

1. `mcp__github__get_job_logs` で **落ちたステップの直前の行**を読む
2. 直す。直したら**ブランチに push してから** `run_admin_script.yml` を
   そのブランチで `workflow_dispatch` する（`actions/checkout` が ref を見るので、
   master にマージする前に本番データで試せる）
3. `python/admin/*.py` は**既定が dry-run**。`{"apply": true}` を渡すまで書かない。
   **必ず dry-run の件数を読んでから apply する**
4. 直したら `island-ship` スキルの手順で本番へ

BigQuery の元データが生きているかは、ここで1回引けば分かる（無料枠、`__TABLES__` は 0 バイト）:

```sql
SELECT table_id, row_count FROM `live-streaming-d3cac.youtube_chat.__TABLES__`
```

`chat_messages` / `videos` / `doneru_donations` / `doneru_ingest_runs` の4つ。
`doneru_donations` が消えていると台帳のステップで落ちて、**後ろのカードと名簿が丸ごと skip される。**

## 5. 見届けたあと

次の回まで**何も始めない**。あやとの指示（2026-09-06）で磨き上げループは止めてある。
手を付けてよいのは「あやとが言ったこと」か「測って見つかった不具合」の2つだけ。

長く待つときは `send_later`（claude-code-remote MCP）で起こす。
バックグラウンドの `sleep` はコンテナが入れ替わると消える（実際に消えた）。
