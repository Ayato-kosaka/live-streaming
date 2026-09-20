---
name: island-daily
description: 配信が終わった日の棚卸し。キャラクター（最優先）→ 切り抜き候補 → 日誌 → いまどこ → 取り込みの見届け、の順で回す。トリガー語:「今日も無事完走」「無事つきました」「本日分」「今日の分まとめて」「daily」「まいにちの」。
---

# まいにちの棚卸し

**順番を変えない。キャラクターが頭。**

2026-09-19 に3回続けて怒られたのは、日誌から始めてキャラクターを落としたから。

> いや、日誌だけじゃないやろ？君の仕事。いちいち言わないとわからないの？
> は？キャラクターやろ。まいにちのタスクが何かすら管理できてないのお前
> なぜ、えびっちが漏れてる？頭悪いの？何回やらせるねん

**この5つを、この順で、毎回ぜんぶ。** 1つ飛ばしたら、飛ばした理由を報告に書く。

| | 何を | 落としたときに起きること |
| --- | --- | --- |
| 1 | キャラクター | 出してくれた人が、島に居ないまま次の日になる |
| 2 | 切り抜き候補 | その日のうちに切れない（アーカイブの熱が冷める） |
| 3 | 日誌 | その日が島から消える |
| 4 | いまどこ | 島が昨日の国を指したままになる |
| 5 | 取り込みの見届け | 翌朝、数字が全部止まる |

## 0. その日の配信を特定する

**BigQuery にはまだ入っていない。** 取り込みは 20:00 UTC の予定で、実際は
1時間49分〜3時間32分遅れて走る。だからチャンネルの一覧から拾う。

```bash
curl -s "https://www.youtube.com/channel/UCCwutAH6ieHNvdyJAfSld7w/streams" -o /tmp/ch.html
grep -o '"videoId":"[A-Za-z0-9_-]\{11\}"' /tmp/ch.html | sed 's/.*://;s/"//g' | awk '!s[$0]++' | head -8
curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json"
```

**1日に何本あるか数える。** 8日目（2026-09-19）は3本あった。しかも
**後ろ2本のタイトルが同じ「part 2」**で、タイトル順に並べると入れ替わる。
並べるのは `actual_start_time`（翌日以降なら `youtube_chat.videos` で引ける）。

## 1. キャラクター（最優先）

### 1-1. 投げ銭してくれた人を、2つの出どころから集める

**BigQuery だけ見ない。当日ぶんは入っていない。** ここで えびっち を落とした。

| 出どころ | 何のぶん | どう引くか |
| --- | --- | --- |
| BigQuery `chat_messages`（`event_type='PAID'`） | **前の晩まで** | ここから直に引く |
| BigQuery `doneru_donations` | **前の晩まで** | 同上 |
| Firestore `streamChatMessages` | **今日のぶん** | `characters_gap` で**数だけ** |

BigQuery はこのセッションから直に引ける（`execute_sql_readonly` /
projectId `live-streaming-d3cac`）。**Actions を通さないので、公開のログに残らない。**

```sql
SELECT DATE(published_at) AS d, author_name, author_channel_id,
       STRING_AGG(DISTINCT purchase_amount_text, ' / ') AS amt
FROM `live-streaming-d3cac.youtube_chat.chat_messages`
WHERE event_type = 'PAID' AND published_at >= TIMESTAMP('2026-09-11')
GROUP BY 1,2,3 ORDER BY d DESC
```

```sql
SELECT DATE(donated_at) AS d, donor_name, amount
FROM `live-streaming-d3cac.youtube_chat.doneru_donations`
WHERE DATE(donated_at) >= '2026-09-11' ORDER BY d DESC
```

⚠ 時刻の欄は **`published_at`**。`timestamp` という列は無い。

当日ぶんは `characters_gap` で数える。

    Actions > 管理スクリプトを実行 > script = characters_gap / ARGS = {"days": 14}

読むのは3行だけ:

- `Firestore（配信中のぶん）: 投げ銭らしい行から N人。うち BigQuery にまだ居ないのが M人`
  → **M が 0 なら、今日出してくれた人は全員すでに BigQuery が知っている人。**
    名前を引き直さなくていい。
- `調べた人数 … / **まだ無い K人**` → K が 0 でなければ、その人を探す
- `名前でしか当たらなかった L人` → L が 0 でなければ `characters_link` を回す

**M が 0 でないときだけ、当日ぶんの名前が要る。** そのときは今晩の取り込みを
待つか、あやとに聞く。**当日ぶんの名前を Actions のログに出させない**
（このリポジトリは公開で、Actions のログも誰でも読める）。

### 1-2. 1人ずつ図鑑に当てる

⚠ **`?channel=` は チャンネルID の欄ではない。名前で引く欄。**
`UC…` を渡すと全員 `null` で返ってきて、**「誰もキャラクターが無い」に見える。**

```bash
q() { python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1"; }
curl -s "https://live-streaming-d3cac.web.app/island-api/characters/lookup?channel=$(q '@まこも-z3i')"
curl -s "https://live-streaming-d3cac.web.app/island-api/characters/lookup?alias=$(q 'もっと豆挽けコーヒー商店')"
```

スパチャは `?channel=`（YouTube の表示名）、Doneru は `?alias=`（呼び名）。

**両方 `null` でも、そこで「無い」と言わない。** 名前では当たらないが
`channelId` では当たる人がいる（`islandDonors` を経由して結んである）。
Doneru の「ayato arigato」が実際にそれで、**名前で引くと出てこないが、
島にはもう居る。** 最後に効くのは `characters_gap` の数のほう。

### 1-3. 図鑑の穴を見る

`characters_gap` が毎回出している。**「書類がある＝できている」ではない。**

| 穴 | どうする |
| --- | --- |
| 絵文字が空 | 絵を見て決めて入れる（下） |
| `scene` が無い | 絵が要る。あやとに投げる |
| `channelId` が空 | `characters_link` を `{"apply": true}` で回す |

絵文字を入れる:

    script = firestore_write
    ARGS = {"collection":"islandCharacter","doc":"<書類ID>","data":{"emoji":"🦌"}}

**先に空いているか見る。** 絵文字はいまのところ1人1つで、かぶると見分けがつかない。

```bash
curl -s "https://live-streaming-d3cac.web.app/island-api/characters" | python3 -c "
import sys,json
cs=json.load(sys.stdin); cs=cs.get('characters') or cs
print(''.join(sorted({c.get('emoji','') for c in cs if c.get('emoji')})))"
```

**絵を見てから決める。** `lookup` が返す `plain.sizes.256` を落として開く。
名前から想像して付けると、トナカイに🎅を付けるようなことになる。

入れたら `lookup` をもう一度叩いて、**本番で変わったことを確かめる。**

### 1-4. 視聴者さんからの声を拾う

カードやキャラクターについての報告・要望は、**配信のチャットに混ざって流れる。**
切り抜き候補（2章）のコメントを読むときに一緒に拾う。専用の口は無い。

## 2. 切り抜き候補

    script = clip_cuts / ARGS = {"source":"live","video":"<id>","top":12,"sec":150}

`source: "live"` は Firestore（配信中に溜めたぶん）を見る。**当日はこれ。**
翌日以降なら `source` を省いて BigQuery。詳しくは `/clip-cut`。

出すときは**上から5本**、それぞれ「何が起きている区間か」を1行で添える。
`yt-dlp --download-sections` の字はログにそのまま出ているので、写して渡す。

## 3. 日誌（`site/content/nordic.ts` の `NORDIC_LOG`）

**`docs/island-misses.md` #153 の決めごとを、書く前に読む。**

1. **字幕（ショートの説明文）が出ている日は、そちらを正にする**
2. **移動した日をコメントだけから書くときは、先に数える**（何本乗ったか・
   どこで降りたか・どの街に寄ったか）
3. **1件のコメントを、地名や出来事に結びつけない**
4. 「動かない日」と「移動した日」で、コメントの使えかたが違う

⚠ **当日ぶんのチャットは BigQuery に無い。** 数えられるのは今晩の取り込みのあと。
字幕も来ていないなら、**その日は書かずに翌朝書く。** コメントの山だけで書くと
骨格ごと外す（5日目が実際にそれで、本番に出してから全部書き直した）。

数えるのは**エージェントに配る。** 渡すもの:

- **合格の条件** — 何本乗ったか／地名を全部／国境の時刻／山場3つ／
  食べたもの／泊まったところ／到着の時刻
- **各項目に、別の人のコメントを2件以上。** 1件しか無いものは
  「1件しか無い」と書かせる。**推測で埋めさせない**
- **触ってよい範囲** — 読むだけ。ファイルを1つも編集させない

上がってきた下書きは**そのまま使わない。** 事実の節に根拠の無い文が
混ざっていることがある（7日目の下書きに、チャットのどこにも無い
「ボードを置き忘れた」「SIM が使えなくなった」が入っていた）。
**下書きの1文ずつを、根拠の節と突き合わせてから落とす。**

出すのは `/island-ship`。**Hosting は手で起動する**（`push` トリガーは効いていない）。

## 4. いまどこ

    Actions > island_update.yml（workflow_dispatch）
    place / word / week / refresh_stats: true

⚠ **確かめるのは `place` の欄そのもの。** 文字列で探すと、前の日の `word`
（「あしたはタリンまで308km」）に当たって「もう入っている」に見える。

```bash
curl -s "https://live-streaming-d3cac.web.app/island-api/state" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['current']['place'])"
```

## 5. 取り込みの見届け

`/nightly-check`。緑でも中身を読む。

**`conclusion` だけ見ない。** 「表に無い どねID が投げ銭してきた」晩は
最後の step が `exit 1` で終わるが、**データは入っている。** あれは失敗ではなく
呼び出しで、あやとが `/me` から紐付けるまで毎晩赤くなる。

## 報告の形

**1→5 の順のまま書く。キャラクターが頭。**

- やったことは、**本番で確かめた値**と一緒に書く（「直した」だけにしない）
- やらなかったことは、**なぜやらなかったか**を書く
- 判断したことは、**判断として**書く。可否をあやとに預けない
