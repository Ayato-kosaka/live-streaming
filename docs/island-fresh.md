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

## 2. ① 機械だけで決まる — 毎晩ひとりでに焼く

`.github/workflows/rebake.yml` が **21:30 UTC**（取り込みの後ろ）に回す。
変わっていれば master に入れて、Hosting も配る。

| 焼くもの | スクリプト | 何が変わると動くか |
| --- | --- | --- |
| `chapterStats.ts` `chapterStreams.ts` | `build_chapter_stats.py` | 配信が増える／章が閉じる |
| `residents.ts` | `build_residents.py` | 直近90日が1日ずれる（**毎日動く**） |
| `streamPeaks.ts` | `build_stream_peaks.py` | 取り込めた配信が増える |
| `onThisDay.ts` | `build_on_this_day.py` | 配信が増える |

**4本とも入力が BigQuery だけ。** 人が何も決めなくても正しい答えが出る。

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

## 3. ①b 焼けるが、上流が人 — 人が書いたあとに、続けて焼く

| 焼くもの | スクリプト | 待っているもの |
| --- | --- | --- |
| `cityStreams.ts` | `build_city_streams.py` | `countries.ts` の街と滞在期間 |
| `countryStats.ts` | `build_country_stats.py` | 同上 |
| `kitchenTalk.ts` | `build_kitchen_talk.py` | `recipes.ts` と、手で選んだ引用 |
| `legendDays.ts` | `build_legend_days.py` | `legends.ts` に足された伝説 |

**上流が止まっていれば、下流も止まる。** `countries.ts` は「どの街にいつからいつまで
いたか」で、本人しか知らない。そこが増えるまで、街の配信も国の数字も動かない。

この4本には、もう1つ落とし穴がある。**BigQuery を直に引くのは `build_city_streams` だけ。**

| | BigQuery を引くか | 引かないなら、元は何か |
| --- | --- | --- |
| `build_city_streams` | 引く | — |
| `build_country_stats` | **引かない** | `python/data/country_stats.json` |
| `build_kitchen_talk` | **引かない** | `python/data/kitchen_*.json`（3つ） |
| `build_legend_days` | **引かない**（`bigquery` を import すらしていない） | `python/data/legend_*.json`（2つ） |

下の3本は、**先にその JSON を取り直さないと、回しても同じものが焼き直るだけ。**
取り直す SQL は各スクリプトの `--sql` が出す。

`cityStreams.ts` は `rebake.yml` の allowlist に**入れていない**。いまの中身は古い版の
スクリプトで焼かれていて、焼き直すと選び方の決まりごと総取り替えになる（トビリシは
滞在窓に配信が119本あるので、並びごと変わる）。**「新しくなる」ではなく「別物になる」。**
入れる前に、選び方がどう変わるかを確かめる必要がある。

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
