---
name: island-fresh
description: 島の焼き込み（site/content/*.ts）のうち、人の判断が要るものを新しくする手順。どこまで焼けているかを BigQuery と突き合わせ、料理・引用・声・国を足して、焼き直して出す。トリガー語:「スタンプ帳が古い」「料理を足して」「焼き直して」「最新化」「島のデータが止まってる」「island-fresh」。
---

# 焼き込みを新しくする（人の判断が要るぶん）

島の数字と言葉は `site/content/*.ts` に**焼き込んである。配り直しても動かない。**
新しくする＝焼き直して commit する。

**機械だけで決まる4本（`chapterStats` `residents` `streamPeaks` `onThisDay`）は
毎晩ひとりでに焼ける**（`.github/workflows/rebake.yml`、21:30 UTC）。
**ここでやるのは、機械に決めさせると嘘になるぶん。**
仕分けの全体は `docs/island-fresh.md`。

**この箱に BigQuery の ADC は無い。** `bigquery.Client` を作るスクリプト
（`build_residents` `build_stream_peaks` `build_on_this_day` `build_chapter_stats`
`build_city_streams` `build_country_stats`）は**ここでは走らない。Actions で回す。**
SQL は MCP から流す（`mcp__Google_Cloud_BigQuery__execute_sql_readonly`、
project `live-streaming-d3cac`、dataset `youtube_chat`）。
**`--sql` で SQL を出して MCP で流し、返った行を `--rows <file>` に渡せば、
この箱でも焼ける**（`build_country_stats` `build_on_this_day` `build_city_streams`）。
取り置きの JSON から焼くもの（`build_kitchen_talk` `build_voices` `build_shorts`
`build_legend_days`）は**ここで走る。**

---

## 1. いまどこまで焼けているか

**2つ並べて、差を見る。** 片方だけ見ても遅れは分からない。

### 焼き込みの側

```bash
cd /home/user/live-streaming
python3 - <<'PY'
import re, pathlib
C = pathlib.Path("site/content")
def t(n): return (C / (n + ".ts")).read_text(encoding="utf-8")
def one(pat, n):
    m = re.search(pat, t(n)); return m.group(1) if m else "—"
def last(n):
    ds = sorted(set(re.findall(r"20\d\d-\d\d-\d\d", t(n)))); return ds[-1] if ds else "—"
def num(pat, n): return len(re.findall(pat, t(n), re.M))

rows = [
    ("chapterStats.ts",   one(r"数えた日: ([\d-]+)", "chapterStats"), ""),
    ("chapterStreams.ts", one(r"数えた日: ([\d-]+)", "chapterStreams"), str(num(r'^    \["', "chapterStreams")) + "本"),
    ("onThisDay.ts",      one(r'LATEST_DAY = "([^"]+)"', "onThisDay"), str(num(r'"v":', "onThisDay")) + "本"),
    ("streamPeaks.ts",    "—", str(num(r'"k":', "streamPeaks")) + "本"),
    ("residents.ts",      "—", "常連 " + one(r"ACTIVE_FRIENDS = (\d+)", "residents") + "人 / 分母 " + one(r"STREAM_DAYS = (\d+)", "residents") + "日"),
    ("recipes.ts",        last("recipes"), str(num(r"^    slug:", "recipes")) + "品"),
    ("kitchenTalk.ts",    "—", str(num(r'^  "', "kitchenTalk")) + "品ぶん"),
    ("countries.ts",      last("countries"), ""),
    ("cityStreams.ts",    last("cityStreams"), ""),
    ("legends.ts",        last("legends"), ""),
    ("legendDays.ts",     last("legendDays"), ""),
    ("voices.ts",         last("voices"), ""),
    ("shorts.ts",         last("shorts"), ""),
]
for a, b, c in rows: print("%-20s %-12s %s" % (a, b, c))
PY
```

**`git log` の日付では見ない。** 別の理由で触られた日が付くだけで、中身は古いままのことがある。

### BigQuery の側

```
mcp__Google_Cloud_BigQuery__execute_sql_readonly
  projectId=live-streaming-d3cac
  query=SELECT COUNT(*) AS videos, COUNTIF(status='SUCCEEDED') AS chat_ok, FORMAT_TIMESTAMP('%Y-%m-%d', MAX(actual_start_time), 'Asia/Tokyo') AS latest FROM `live-streaming-d3cac.youtube_chat.videos`
```

2026-09-10 の実測は **762本 / チャット取り込み済み 671本 / 最新 2026-09-09**。
これに対して `recipes.ts` は 8/21、`cityStreams.ts` は 8/17 で止まっていた。

**`status` を必ず見る。** `SUCCEEDED` でない配信は**チャットが1行も無い。**
引用も人数も出せないので、料理を足しても `kitchenTalk` が空のまま焼ける。
その配信は**取り込めるまで待つ**（`/nightly-check`）。

---

## 2. 料理を1品足す（いちばん使う）

### 2-1. 遅れているクッキング配信を見つける

```
mcp__Google_Cloud_BigQuery__execute_sql_readonly
  projectId=live-streaming-d3cac
  query=SELECT FORMAT_TIMESTAMP('%Y-%m-%d', actual_start_time, 'Asia/Tokyo') AS d, video_id, title, status FROM `live-streaming-d3cac.youtube_chat.videos` WHERE actual_start_time >= '2026-08-20' AND REGEXP_CONTAINS(title, r'クッキング|作ろ|つくろ|料理|作りま|ごはん|ご飯') ORDER BY d
```

`>= '2026-08-20'` は **`recipes.ts` の最終日**（1章で出したもの）に置き換える。

返ってきた `video_id` のうち、まだ入っていないものだけを残す:

```bash
cd /home/user/live-streaming
for v in YjiWI5reVCo 5-1bHix5X1s TGO_a-3ZwHM l5ODV6hfCLQ; do
  grep -q "$v" site/content/recipes.ts && echo "$v 済" || echo "$v **未**"
done
```

**題名から料理名は決まらない。** 「北欧旅まであと２日！トトロクッキング！」で
何を作ったかは、配信を見ないと分からない。**推測で埋めない。**
分からなければ、そこで止めてあやとに聞く（`docs/island-standards.md` 3）。

### 2-2. スタンプの絵を、まだ使っていない `food-*` から選ぶ

**1品につき1枚。同じ絵を2品で使わない**（`recipes.ts` の `icon` のコメント）。
スタンプ帳は押した数だけ違う絵が並ぶから図鑑に見える。
同じ皿が2つ並んだ瞬間、絵ではなく飾りになる。

**料理が写っているものを選ぶ。器だけ・容器だけの絵を選ばない。**
`food-*` には**中身の無い食器**が混じっている——`food-plate-deep`（空の白い皿）・
`food-pan`（空の鍋）・`food-frying-pan`（空のフライパン）・`food-bowl`・
`food-tajine`・`food-glass-wine`・`food-mug`・`food-pizza-box`・
`food-cutting-board-japanese`。名前は料理に見えるので、**名前だけで選ぶと必ず踏む。**
図鑑にそれが並ぶと、その品だけ「まだ何も作っていない」に読める。
**閉じた容器**（`food-dim-sum` のせいろ、`food-steamer` の蒸籠）も、
中身が1つも出ていないので同じ。**中身が見える絵だけを選ぶ。**
色が1つしかない絵（`food-cheese` の黄色い塊、`food-mincemeat-pie` の
のっぺりしたオレンジの六角形、`food-onion` のテラコッタ色の多角形）も、
輪郭しか情報が無いので落ちる。**2色以上あるかを見る。**
（2026-09-19。`docs/island-misses.md` #178）

**`sprites.json` の引き算だけで「空き」を数えない。** あの表は素の置き場
（`site/public/sprites/`）の名簿で、料理の面が読む `hero/` の名簿ではない。
`/kitchen/<品>` は `HeroArt` 経由で `/sprites/hero/<名前>.webp` を読み、
そこに焼いてあるのは**いま主役に指定されている絵だけ**。つまり
**「まだ使っていない絵」は、どれも hero が無い。hero の空きは常に 0 枚。**
引き算の数字（「73枚空いている」）だけで選ぶと、選んだ瞬間に 404 が確定する
（2026-09-19 に `food-mortar-pestle` でそうなった。`sprites.json` に在る／
素の置き場にも在る／**hero だけ無い**）。

**選ぶのは素の置き場から。ただし、選んだら焼くまでが1組。**

```bash
cd /home/user/live-streaming
python3 - <<'PYEOF'
import json, re, pathlib
d = json.load(open("site/content/sprites.json"))
food = sorted(k for k in d if k.startswith("food-"))
used = set(re.findall(r'icon: "(food-[a-z0-9-]+)"', pathlib.Path("site/content/recipes.ts").read_text(encoding="utf-8")))
hero = pathlib.Path("site/public/sprites/hero")
free = [f for f in food if f not in used]
ready = [f for f in free if (hero / (f + ".webp")).exists()]
print(f"{len(food)}枚中 {len(used)}枚 使用ずみ / 素の置き場に {len(free)}枚 空き")
print(f"そのうち hero の実体が在るもの {len(ready)}枚 … **ふつう 0。焼くところまでが仕事**")
print("\n".join("  " + f for f in free))
PYEOF
```

絵は `site/public/sprites/<名前>.webp`。**選ぶ前に見る。**
名前だけで決めると、料理と関係ない皿が並ぶ。

#### 選んだら hero を焼く。**やらないと面が 404 になる**

何を焼くかは `manifest.mjs` の `heroNames()` が決めている——`recipes.ts` /
`legends.ts` / `streamTypes.ts` の `icon:` を読んで `hero/<名前>` を焼く。
だから **先に `recipes.ts` へ書いてから**回す。

```bash
cd /home/user/live-streaming/tools/sprites
python3 -m http.server 8904 &                        # render.html を配る
node bake.mjs ../../site/public/sprites <選んだ名前>   # 素のぶんと hero/ の2枚
python3 meta.py                                       # 余白を切って webp・sprites.json を書き直す
```

`models/` と `vendor/` は git に入っていない（`.gitignore`）。**worktree を
切った先には無い**ので、元の clone から借りる（`ln -s`）。借りた印は
commit しない。

そろったかどうかは、巡回（`crawl.mjs`）を待たずにここで分かる:

```bash
node tools/sprites/heroicon_selftest.mjs   # 0=実体がそろっている / 1=足りない
```

### 2-3. `recipes.ts` に足す

**いちばん下の `];` の直前**に足す（並びは作った順）。

```ts
  {
    slug: "takikomi-gohan",         // URL になる。英小文字とハイフンだけ
    name: "炊き込みご飯",
    emoji: "🍚",
    icon: "food-rice-ball",         // 2-2 で選んだ、まだ使っていないもの
    country: "georgia",             // countries.ts の slug
    kind: "rice",                   // KINDS の7種から。rice/flour/meat/fish/soup/side/sweet
    date: "2026-08-28",             // 完成した日（JST）
    note: "…",                      // 1〜2文。その日そこで何があったか
    streams: [
      { label: "調理", date: "2026-08-28", videoId: "YjiWI5reVCo", title: "ジョージアで炊き込みご飯、茶碗蒸し、ポトフ作ります" },
    ],
  },
```

- `label` は `企画会議` / `買い出し` / `調理` / `リベンジ` / `配信` の5つだけ
- `title` は**YouTube の題名をそのまま**。引用なので書き換えない
- **`recipeNo`（図鑑の番号）は `date` の順で自動。** 手で番号を振らない
- 1本の配信で3品作った日は、**品ごとに1件**。`streams` に同じ `videoId` が3回出てよい

### 2-4. その日の台所（`kitchenTalk.ts`）を焼く

`build_kitchen_talk.py` は BigQuery を引かない。**先に取り置きの4つを足す。**

```bash
python /home/user/live-streaming/python/build_kitchen_talk.py --sql   # 4本の SQL が出る
```

`{vids}` に足した `videoId` を `'…'` で並べて MCP から流し、返った行を足す。
**キーの名前が違う。書き写すときに直す。**

| 置き場 | 形 | 注意 |
| --- | --- | --- |
| `python/data/kitchen_video_stats.json` | 配列 | SQL の `video_id` を **`v`** に直して足す |
| `python/data/kitchen_residents.json` | `{videoId: "chan,chan,…"}` | `{chans}` には `residents.ts` の `channel` を並べる |
| `python/data/kitchen_icons.json` | `{アカウント名: URL}` | 引用した人のぶんだけ。`{names}` に名前を並べる |
| `python/data/kitchen_no_chat.json` | 配列 | **チャットがもう来ないと分かっている配信**（取り込みが `SKIPPED`/`FAILED` かつ `NO_CHAT_FILE`）。ここに在る品は、数字も引用も空のまま行を残す。**行ごと落とすと、見張りが「まだ焼いていない」と読んで永久に赤い**（`docs/island-misses.md` #138） |

引用は `python/kitchen_talk_picks.json` の `picks` に、**slug をキーにして**足す:

```json
"takikomi-gohan": [
  { "v": "YjiWI5reVCo", "name": "@reim改", "t": "炊き込みご飯好きやな。今はビリヤニが流行ってんで" }
]
```

**引用は手で選ぶ。機械に選ばせない。** 同じ配信を長さで機械的に切ると、実際にこうなる:

```
@ビスケット-t2f  こんばんは:cookie:
@ゆずたつ-q3n    こんばんはクッキング楽しもうぜ
@清志郎-n1s      こんばんわ:carrot::onion::garlic:
```

採るのは**料理の話として、初めて読む人にも意味の通るもの**だけ。
**本文は1文字も直さない**（誤字も全角カンマもそのまま。直した瞬間に引用ではなくなる）。
候補はこれで読む:

```
mcp__Google_Cloud_BigQuery__execute_sql_readonly
  projectId=live-streaming-d3cac
  query=SELECT author_name, message_text FROM `live-streaming-d3cac.youtube_chat.chat_messages` WHERE video_id = 'YjiWI5reVCo' AND event_type = 'TEXT' AND author_name != '@あやとグルメアプリ' AND CHAR_LENGTH(message_text) BETWEEN 12 AND 80 ORDER BY published_at LIMIT 200
```

足したら焼く:

```bash
cd /home/user/live-streaming && python python/build_kitchen_talk.py --build
```

### 2-5. 確かめる

```bash
cd /home/user/live-streaming/site && npx tsc --noEmit ; echo "tsc=$?"
git --no-pager diff --stat site/content/recipes.ts site/content/kitchenTalk.ts
```

**焼いたものを撮って、自分の目で見る。** スタンプ帳は絵が並ぶ面なので、
数字が通っただけでは出せない（`docs/island-standards.md` 1）。

```bash
cd /home/user/live-streaming/site && NEXT_DIST_DIR=.next-verify npx next build
python3 -m http.server 4321 --directory .next-verify &
cd ../tools/sprites && node crawl.mjs        # 全ページの 絵・h1・JSエラー・横あふれ・リンク切れ（0=通った/1=見つかった/2=数えるものが無い）
```

見るのは3つ。**足した絵が他と重なっていないか。番号が飛んでいないか。
その日の台所が空になっていないか**（空なら 2-4 の JSON が足りていない）。

終わったら開発サーバーは落とす（`lsof -ti:4321 | xargs -r kill -9`）。

---

## 3. `voices.ts` / `shorts.ts` / `countries.ts`

どれも**選ぶのは人**。焼くのは機械。

### `voices.ts`（他己紹介）

```bash
cd /home/user/live-streaming
python python/build_voices.py --sql --since 2026-08-20    # 候補を引く SQL
# → MCP で流して、返った行を /tmp/voices_rows.json に置く
python python/build_voices.py --dump /tmp/voices_cand.json --rows /tmp/voices_rows.json
```

読んで選び、`python/voices_picks.json` の `picks` に**行をそのまま**足す
（`d` `v` `e` `a` `i` `m`）。**`a`（名前）と `i`（アイコン）は手で書かない。**
並び順がそのまま画面に出る順。**同じ人ばかりにならないように見る**（いま11件で最多3件）。

```bash
python python/build_voices.py --build
```

### `shorts.ts`（ショート）

**BigQuery にショートは1本も入っていない。** 出どころは `python/data/shorts.json` だけで、
そこはあやとが本人のチャンネルから書き出した表。**増やせるのはあやとだけ。**

```bash
cd /home/user/live-streaming
python python/build_shorts.py --dates    # 足したぶんの公開日を YouTube から埋める
python python/build_shorts.py --build
```

`chapter` は `chapters.ts` の slug（`before-stream` だけは章ではなく、配信を始める前の6週間）。

### `countries.ts`（歩いた国と滞在期間）

**本人しか知らない。**「どの街にいつからいつまでいたか」を機械は当てられない。
書いたら**必ず4章へ**（下流が2つある）。

いま滞在中の国は `to: ""` で開けておく（`georgia` の2つ目の `stays` がそう）。

---

## 4. `countries.ts` を触ったら、下流も焼き直す

**上流だけ直して終わらない。** `countries.ts` を読んでいるのは2本ある。

| 焼き直すもの | 走らせ方 | ここで走るか |
| --- | --- | --- |
| `cityStreams.ts` | `python python/build_city_streams.py` | **走らない**（BigQuery を引く。Actions か `--rows`） |
| `countryStats.ts` | `python python/build_country_stats.py` | **走らない**（同上） |
| `onThisDay.ts` | `python python/build_on_this_day.py` | **走らない**（同上） |

**この3本はもう `countries.ts` を自分で読まない。** 滞在は `python/stays.py` が
1か所で持っていて、**歩き終わった国（`countries.ts`）と、いま歩いている旅
（`nordic.ts` の旅程）を足して**答える。だから旅のあいだも止まらない。

どれも `--sql` で SQL を出し、MCP で流した行を `--rows <file>` に渡せば
この箱でも焼ける。`python/data/country_stats.json` は**引いた結果の写し**なので、
手で取り直す必要はもう無い（焼くと一緒に置き直される）。

**3本とも毎晩ひとりでに焼ける**（`rebake.yml`）。`countries.ts` を触ったあと
自分で押さなくても、翌朝には入っている。急ぐなら Actions から
`dry_run: false` で押す。

---

## 5. 出す

**ここから先は `/island-ship` に渡す。** 手順を二重に書かない。

渡す前に、この2つだけ足しておく:

- **焼いた `site/content/*.ts` を名指しで `git add`。** `git add -A` を使わない
  （取り置きの `python/data/*.json` と `*_picks.json` も、足したなら一緒に）
- **`rebake.yml` が毎晩焼く4本は、こちらで commit しない。**
  `chapterStats.ts` `chapterStreams.ts` `residents.ts` `streamPeaks.ts` `onThisDay.ts`
  に差分が出ていたら、それは自分の変更ではない。`git checkout --` で戻す

Hosting を配って初めて画面に出る（焼き込みは配り直さないと入れ替わらない）。
