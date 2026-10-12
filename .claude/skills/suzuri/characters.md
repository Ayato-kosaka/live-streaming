# ② 住人グッズ（島のキャラクター）を足す・直す

**先に [`ops.md`](ops.md) を読む。** ここは「誰を作るか」と「題・本文」だけ。

## 1. 突き合わせる

```bash
python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && python3 characters.py') 950
```

| 出てくるもの | 意味 | すること |
| --- | --- | --- |
| `new` | 島に居て、グッズになっていない人 | `create()` で作る |
| `changed`（島で絵が描き直された） | 同じ絵文字で、絵の相関が 0.9 未満 | `swap()` で島の絵に差し替える（#731 Q2: A） |
| `changed`（絵文字が変わった） | 同じ絵が別の絵文字で居る | 消さずに残し、題を新しい絵文字に直して `finish()`（#731 Q1: A。🧘 → 🧘‍♂️） |
| `gone` | SUZURI に在って、島に居ない | **消す**（#731 Q3: A。島に居る人だけにそろえる） |
| `opaque` | 背景なしの絵に透過が無い | **作らない**（#731 Q5: A）。島の絵が直ってから。下の 3 |
| `short` | 品目が5つそろっていない住人（途中で止まった・手で品目を外した など） | `finish(t, id, src)` で缶バッジとパネルを足して5品目にする（下の 5） |

`characters.py` は島の口（`/island-api/characters`）から全員を取り、背景なしの元絵（`plain.full`）を
`/home/ubuntu/suzuri/plain/` に落とし、透過を確かめ、余白を落とした版を `prep/` に作る。
結果は `/home/ubuntu/suzuri/diff.json` にも書く。

**`gone` と `changed` は、消す・差し替える前に一覧をあやとに見せる必要はない**（決めごとは #731 で済んだ）。
ただし `gone` が一度に3件を超えるときは、島の口が欠けて返っていないかを先に疑う（`island` の人数を見る。2026-10-09 は 100人）。

## 2. 題と本文

```python
TITLE.format(emoji=e)          # 「カサ・アヤトの住人 🦄」（絵文字の前に空き1つ）
DESCRIPTION.format(emoji=e)    # あやとの指定の本文（あやと島の文）。字の間の空きもそのまま
```

絵文字は**島の絵文字をそのまま**使う（異体字セレクタも含めて。⭐️ と ⭐ は別の字）。
特別な絵の題（「カサ・アヤトの住人 🦔 一周年㊗️」）は、絵文字の後ろをそのまま残す。

## 3. 透過は毎回確かめる（あやと 2026-10-09）

`transparent(path)` が「ふち（外周1px）の2割以上が透明」かつ「全体の5%以上が透明」を見る。

- 🃏 は「背景なし」の絵が白い四角の地のまま入っていた（RGB で透明が0）→ 作っていない
- 四隅だけで見ると、足元が角まで届く 🎃 や、裾が3辺にかかる ⛰️ を誤って落とす

透過が無い人が出たら、グッズは作らずに、**島の絵（オーナー画面の背景なし）を直す issue** を立てる。
島を歩く絵も同じ背景なしを使っているので、島の側でも四角が出ている。

## 4. 作る

```python
import json
d = json.load(open("/home/ubuntu/suzuri/diff.json"))
t = fresh_tab(); known = set(list_ids(t))
for c in d["new"]:
    mid = retrying(lambda t: create(t, c["src"], TITLE.format(emoji=c["emoji"]), DESCRIPTION.format(emoji=c["emoji"]), 300, known))
    known.add(mid)   # 結果は log の JSON に1件ずつ書く（ops.md 7）
```

作ったら `sheet()` で見本を並べて目で見る（ops.md 6）。**作った人の絵文字とデザインの id を、
島の issue（あれば）に書いて閉じる。**

## 5. いつ回すか

**毎晩ひとりでに、ワークフロー `SUZURI API` が作る**（あやとの決め #732: C 案）。取り込みの完了に繋いであり、
島に居て題に絵文字の付いた住人グッズが無い人を、**5品目・大きさまで入れて**作る（大きさは `layout()`）。
透過の無い人は飛ばす。大きさが入らなかったら、作りかけを消して赤で止まる（次の晩にもう一度）。
結果は Actions の Summary に、作った人と商品ページの URL が並ぶ。

`/island-daily` の 1-5 では、**作られたものを目で見る**（`sheet()`）のと、`changed` `gone` `opaque` を片づける。
`short`（品目が足りない住人）が出たら `finish(t, id, src)` で5品目にそろえる。
