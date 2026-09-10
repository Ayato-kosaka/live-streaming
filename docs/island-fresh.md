# 何が機械で新しくなり、何が人しか新しくできないか

島に出ている数字と言葉は、`site/content/*.ts` に**焼き込んである**。
配り直しても動かない（Hosting の `npm run build:web` は python を1行も通らない）。
だから「新しくする」は**焼き直して commit する**ことを指す。

ここに書くのは**その仕分けだけ**。何をいつやるかの手順は `/island-fresh` にある。

---

## 1. 仕分けの軸は「BigQuery を読めば答えが出るか」

| | 答えの出どころ | 誰が新しくするか |
| --- | --- | --- |
| **① 機械だけで決まる** | BigQuery だけ | 毎晩ひとりでに焼く |
| **①b 焼けるが、上流が人** | BigQuery ＋ 人の書いた表 | 人が上流を書いたあと、続けて焼く |
| **② 人しか決められない** | 人の頭の中 | 人が書く。機械に決めさせると嘘になる |

**①b を毎晩に入れない理由**は、入れても変わらないからではなく、
**変わらないのに緑が付く**から。「今日も回った」が並ぶと、上流（`countries.ts` など）が
止まっていることが隠れる。動かないものを動かしても、止まっていることは直らない。

**ただし「上流が人」だけでは外す理由にならない**（2026-09-10）。見るのは
**上流が止まっているあいだ、下流も止まるか**。`cityStreams.ts` は止まらない——
街の一覧が増えなくても、いまいる街の配信は毎晩増える——ので、①に上げた。
下の3章に、外に置いたままの3本との違いを書いてある。

## 2. ① 機械だけで決まる — 毎晩ひとりでに焼く

`.github/workflows/rebake.yml` が **01:00 UTC**（日本時間の朝10時ごろ）に回す。
取り込みの実測が 21:49〜23:32 UTC なので、その後ろに置いてある。
変わっていれば master に入れて、Hosting も配る。

| 焼くもの | スクリプト | 何が変わると動くか |
| --- | --- | --- |
| `chapterStats.ts` `chapterStreams.ts` | `build_chapter_stats.py` | 配信が増える／章が閉じる |
| `residents.ts` | `build_residents.py` | 直近90日が1日ずれる（**毎日動く**） |
| `streamPeaks.ts` | `build_stream_peaks.py` | 取り込めた配信が増える |
| `onThisDay.ts` | `build_on_this_day.py` | 配信が増える |
| `cityStreams.ts` | `build_city_streams.py` | 配信が増える（街の一覧が増えるのは人待ち） |

**前の4本は入力が BigQuery だけ。** 人が何も決めなくても正しい答えが出る。

`cityStreams.ts` だけ上流に人の書く `countries.ts` がある。それでも毎晩に入れたのは、
**上流が止まっても下流が止まらない**から。ジョージアの滞在は `to: ""` で開いていて、
街の一覧が増えなくても、配信が増えればトビリシもカズベキも増える。

**そして、入れなかったからこそ嘘が半年残った**（2026-09-10）。
一度も焼き直されないまま手で書いたものが置かれていて、**36街89本**しか入っておらず、
拾えていない街が画面で「配信はのこっていない」を名乗っていた。焼き直して**49街322本**。
`docs/island-misses.md` #12 に経緯がある。

`build_on_this_day` は `streamPeaks.ts` を読むので、**`build_stream_peaks` のあと**に回す。
順番はワークフロー側で固定してある（入力の並びではなく allowlist の並びで回る）。

### 毎晩ひとりでに回すものには、止め金がいる

`ACTIVE_FRIENDS`（直近90日の常連の数）が **61 → 174** になったことがある。
読めなかった日を全員の出席に足していたので、1回来ただけの人が72人まぎれ込んだ
（`python/build_residents.py` の docstring に実測が残っている）。
**あのときは目で見て止めた。毎晩ひとりでに回すなら、その目はいない。**

いま止め金は2つある。どちらも **commit の前**に効く。

1. **`ACTIVE_FRIENDS` が 1.5倍の幅を超えて動いたら落とす。**
   一晩で常連が 1.5倍になるのは、人の出入りではなく数え方が変わったときだけ
2. **焼いた TS で `next build` が通らなければ落とす。**
   通らないまま入れると、赤くなるのは master ではなく**次の Hosting のデプロイ**で、
   次に誰かが配るまで誰も気づかない
3. **`countries.ts` の滞在を1件でも読み落としたら落とす**（`build_city_streams.py` の
   `read_stays()` と `build_on_this_day.py` の `read_countries()`。**この2本だけが
   `countries.ts` を正規表現で読む**）。読み落としは例外を出さず、
   **国と街が黙って減るだけ**だった。減った街は画面で「配信はのこっていない」と
   言い切るので、**落ちて赤くなるほうがずっといい**

## 3. ①b 焼けるが、上流が人 — 人が書いたあとに、続けて焼く

| 焼くもの | スクリプト | 待っているもの |
| --- | --- | --- |
| `countryStats.ts` | `build_country_stats.py` | `countries.ts` の街と滞在期間 |
| `kitchenTalk.ts` | `build_kitchen_talk.py` | `recipes.ts` と、手で選んだ引用 |
| `legendDays.ts` | `build_legend_days.py` | `legends.ts` に足された伝説 |

**上流が止まっていれば、下流も止まる。** `countries.ts` は「どの街にいつからいつまで
いたか」で、本人しか知らない。そこが増えるまで、国の数字も料理の引用も動かない。

**この3本は BigQuery を引かない。** ここが `cityStreams.ts` との違いで、
毎晩に入れなかった理由でもある。

| | BigQuery を引くか | 引かないなら、元は何か |
| --- | --- | --- |
| `build_country_stats` | **引かない** | `python/data/country_stats.json` |
| `build_kitchen_talk` | **引かない** | `python/data/kitchen_*.json`（3つ） |
| `build_legend_days` | **引かない**（`bigquery` を import すらしていない） | `python/data/legend_*.json`（2つ） |

**先にその JSON を取り直さないと、回しても同じものが焼き直るだけ。**
取り直す SQL は各スクリプトの `--sql` が出す。だから毎晩に入れると、
本当に「変わらないのに緑が付く」ことになる。

（`cityStreams.ts` は 2026-09-10 に①へ移した。上の2章。）

## 4. ② 人しか決められない — 機械に決めさせると嘘になる

| 何 | なぜ機械にできないか |
| --- | --- |
| `recipes.ts` | 料理名・種類（7種）・**スタンプの絵を `food-*` 105枚から1枚選ぶ**。しかも同じ絵を2品で使わない。配信の題名から料理名は決まらない（「北欧旅まであと２日！トトロクッキング！」） |
| `kitchenTalk.ts` の `talk` | 引用を手で選ぶ（`python/kitchen_talk_picks.json`）。機械だと「こんばんは」が並ぶ |
| `voices.ts` | 他己紹介の抜粋を手で選ぶ（`python/voices_picks.json`） |
| `countries.ts` | 歩いた国と滞在期間。本人しか知らない |
| `chapters.ts` | 章（島）の区切り |
| `legends.ts` | どれを伝説と呼ぶか |
| `plans.ts` `apps.ts` | 企画・アプリの選定 |
| `shorts.ts` | **BigQuery にショートが1本も入っていない。** 出どころは `python/data/shorts.json` だけ |
| `voice.ts` `chatter.ts` `site.ts` `themes.ts` `directory.ts` | 画面に出る言葉 |

**「選ぶ」が入っているものは、全部ここ。** 数える・並べる・絞るは機械にできるが、
**どれを載せるかは載せる理由がいる。** 理由は BigQuery に入っていない。

### 機械にやらせて壊れたところ

`recipes.ts` の `icon` には「同じ絵を2品で使わない」という決まりがある。
スタンプ帳は**押した数だけ違う絵が並ぶ**から図鑑に見える。同じ皿が2つ並んだ瞬間、
絵ではなく飾りになる。105枚あるので使い回す理由もない。
**この「2度使わない」は、料理名からは導けない。**

## 5. 焼き直したかどうかは、commit 日では分からない

別の理由で触られた日が付くだけで、中身は古いままのことがある。**中身の最新を見る。**

| ファイル | どこを見るか |
| --- | --- |
| `chapterStats.ts` `chapterStreams.ts` | 冒頭の「数えた日」 |
| `onThisDay.ts` | `LATEST_DAY` |
| `recipes.ts` `countries.ts` ほか | 中の日付のいちばん新しいもの |

突き合わせる相手は BigQuery の `videos` の最新日。
引き方は `/island-fresh` の1章にある。

---

**関連**: [`island-db.md`](island-db.md) 3章（どのファイルを誰が書くか）、
`.github/workflows/rebake.yml`（毎晩の焼き直し）、`/island-fresh`（人の側の手順）。
