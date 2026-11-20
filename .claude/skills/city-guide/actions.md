# 街のガイドを Actions で1本回す（`heavy_watch.yml` の `guide`）

作業箱で写真・焼き・書体・見張り・撮影を回さない。**押して、PR の1コメント（表1枚）だけ読む。**
ログは開かない。赤い行に「落ちた所」の1行が付いているので、それで分からないときだけ開く。

## 押しかた（1手）

```bash
gh workflow run heavy_watch.yml --ref <PR の枝> -f guide=<国>/<街> -f pr=<PR の番号>
```

- 押す前に、材料（`python/data/guide/<国>/<街>/guidebook.json`、台本があれば `book.py`）と面（`page.tsx`）を枝に push しておく
- 枝と PR が合っていないと、1つも回さずに止まる（積み戻す先を取り違えないため）。master では押せない
- 待つときはポーリングしない。`subscribe_pr_activity` でコメントを待つ
- 札 `出す` を付けたままでも押してよい。ship.yml は終わるまで待ち、終わったら起き直る（#1329）

## 何が回るか（この順）

| 段 | 何をするか | 生まれるもの |
| --- | --- | --- |
| 1 写真 | `guide_photos.py --gentle`。1枚ごとに60秒。**429 が返ったら止めて表に書く。迂回しない** | `site/public/guide/<国>/<街>/photos/` |
| 2 焼く | 台本があれば `guide_book_build.py build` → `guidebook_bake.py` → 記事（`streams` と `h1` を持つ台本）ぜんぶ `guide_article.py` → `guide_book_check.py --mymaps` | 材料の JSON・`site/content/guidebook/`・マイマップの CSV |
| 3 書き出す | `next build` | — |
| 4 書体 | **全部の面**を測り（`fontweigh.mjs` FAST）、表に無い字を描いた面だけ差し込む（`python/font_table.py`）。差し込んだら焼き直して書き出し直す | `tools/fonts/`・`site/public/fonts/`・`site/app/css/fonts.css` |
| 5 見張り | 街の面・国の面・記事の面に、guide_watch・guidebook.mjs（390幅を撮る）・seo_audit・fontbudget・fontfall・crawl・preclaim・記事の `--check --dist`・guide_thumb（240px） | artifact `guide-shots` |
| 6 積み戻す | 上の置き場の外が変わっていたら**1つも積まない**。積んだら、その head で Selftests を起こす | 枝に1コミット |
| 7 表 | PR に1コメント。何度押しても同じ1つを書き換える | — |

同じ run の `browserwatch`（datebake・preclaim の全面・nextempty・firstload・nospec ほか）と `reachwatch`（48px）は、
**積み戻したあとの head** で走る。表の「重い見張り」の行は、終わるまで ⏳。終わると同じコメントが書き換わる（20〜40分）。

## 表の読みかた

| 印 | 意味 | すること |
| --- | --- | --- |
| 🟢 | 通った | なし |
| 🔴 | 見つかった | 「落ちた所」の1行を直して、もう一度押す |
| 🟡 | 数えられなかった（終了コード 2） | **合格と読まない。** 道具か置き場のほう（材料が無い・書き出しが落ちた） |
| ─ | 回さなかった | 落ちた所の欄に理由（積むものが無い・記事が無い・表に差し込む面が無かった） |
| ⏳ | 重い見張りがまだ走っている | 待つ |

頭の行に赤と黄の数。「積み戻し」に、積んだコミットと数（写真・書体・焼いたもの）。

## 止まったときの直しかた

| 表に出たこと | 直しかた |
| --- | --- |
| 写真が 🔴「429 が返ったので、この回はここで止める」 | 置き場が締め出している。**数時間あけてもう一度押す**（置いた写真は取り直さないので、残りだけ取る）。取れたぶんだけで出さない（`docs/island-misses.md` #337） |
| 面の中身が 🔴「置き場に無い」 | 写真が揃っていない。写真の行を先に緑にする |
| 書き出すが 🟡 | 面か材料の型が崩れている。手元で `python3 python/guidebook_bake.py <国>/<街> --check` |
| 積み戻すが 🔴「許す置き場の外が変わった」 | 焼く道具が想定外のファイルを書いた。道具のほうを直す（積む場所を広げない） |
| 積み戻すが 🔴「push できなかった」 | 押しているあいだに枝が進んでぶつかった。枝を最新にして押し直す |
| 入力で止まった（表が出ない） | run の「入力を確かめる」の `::error::` の1行。枝と PR の番号が合っているか |

書体だけを測り直したいほかの面（街のガイド以外）は、今までどおり `-f fonts=/next.html,…`（`fontbake`。artifact `fonts`）。
