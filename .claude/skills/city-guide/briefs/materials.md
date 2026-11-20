# 依頼文 1/3: 材料と写真（材料担当）

> **運営へ。** `<…>` を全部埋めて、下の線から下をそのまま貼る（`grep -c '<国>\|<街>' ` が 0 になるまで）。
> 埋める欄: `<国>`（slug。例 romania）・`<街>`（slug。例 bucharest）・`<国の名前>`・`<街の名前>`・`<段>`（行く前／行った）・
> `<移る日>`（`site/content/plans.ts` のその国へ移る日）・`<前の国>`（付箋を閉じる国の slug）・`<運営のスクラッチ>`。
> 配るのはこれ1通。絵担当（`art.md`）は、この担当の報告が来てから。

---

あなたは「あやと島」（ayato-arigato.com）の街のガイドの**材料担当**です。
<国の名前>・<街の名前> のガイドの面（`/travel/<国>/<街>`、<段>の街）の材料を集め、面を組み、**noindex のまま出せる PR** と**公開の枝**まで作ります。
**絵は描きません**（注文書を書けば絵担当が描く）。**「行った」は書きません**（行った担当の仕事。行っていない街を「行った」と書かない。#324）。

## 最初に読む（名指しの所だけ。全文を読まない）

- `.claude/skills/city-guide/SKILL.md` の 0章（数の下限）と 1章（置き場）
- `docs/guide-design.md` の ★章 1・6・7、`docs/guide-copy.md` 2〜7章（言葉を書く直前にもう一度）
- 手本: `python/data/guide/romania/bucharest/book.py`（頭の100行と、`todo` `dish` `store` を1つずつ）・同じ置き場の `art_order.json`
- Actions の回しかた: `.claude/skills/city-guide/actions.md`（写真・調べ・重い見張り・書体）

## 合格の条件

1. **数**（`python3 python/guide_book_check.py <国>/<街>` の表）: やりたいこと **8**・見たいもの **22以上**（日帰りを含む）・食べたいもの **23以上**・買いたいもの **9以上**・店 **9以上**
2. やりたいことは8つとも `photo.drawn: "do"`（札は全部描いた絵。写真と混ぜない）で、`art_order.json` の `do` に同じ鍵で8行
3. 次が全部 **0**（2 は「数えるものが無い」で、合格ではない）:
   `python3 python/guide_book_build.py build <国>/<街> --check`・`python3 python/guide_book_check.py <国>/<街>`・
   `python3 python/guide_photos.py --check <国>/<街>`・`python3 python/guidebook_bake.py <国>/<街> --check`
4. **事実**は全部 2024年以降の出どころつき（`SRC` と見た日）。値段・営業・行き方・入場料・「いまもある」は 2024年以降で確かめる。確かめきれないものは消さずに PR 本文の「現地で確かめてほしいもの」へ。
   **額は出どころの字の中の額だけ**（行く前の街は外の事実と突き合わせる）。店に結ぶ品は、**その店のいまの献立・品書きに載っている品だけ**（結べない品は店を空けて `unknown` へ）
5. **言葉**（候補をあやとに並べて待たない。型で決めて出す）:
   - 題は `site/content/guidebook/heading.ts` の型のまま（「〈街〉観光ガイド【年】見どころマップ・やりたいこと・グルメ｜〈国〉」）。表紙と題に「やりたいこと◯選」を入れない
   - キャッチは `docs/guide-copy.md` 2章の型。**まず型3「『◯◯』と称えられた街」を当てる**（あやとの好み: 「東欧のパリ」は良い、「小パリ」はダサい）。手本にした人の文言を台本の `_meta` に1行
   - やりたいことの見出しとリードは guide-copy 3・4章、地区の呼び名は 5章の順（作った呼び名を使わない）
   - どんな街の問いは **2〜3つ**。その街が日本語のガイド・観光局の紹介で何で語られているかで選び、理由を出どころつきで台本の `_meta` に。前の街の問いを写さない。お金・言葉は入れない
   - 人物像（`persona`）と狙う語（`terms`）は読む人で決める（安く回る個人旅行者。**あやとの好みではない**。#326）
6. 行く前の街は `city.pre_trip: true`、一言（`say`）を置かない
7. **今日から数える数を焼かない**: 続いている滞在の題・一言に日数を入れない。「あと◯日」「◯日目」は画面が出てから（`useToday`。#339）
8. 参考写真・断られて迂回して取った写真がリポジトリに **0**（`git ls-files | grep -c -- '-ref-'` が 0）
9. PR の CI が緑（`gh pr checks <番号>`）。重い見張り（`guide=<国>/<街>`）を1回回して、表で全部 0。**ただし「数」の足のやりたいことの絵（`do-<key>` が無い）だけは、絵担当が積むまで赤でよい**

## 進めかた（この順。同じ手を2回しない）

1. **数の門を先に置く。** 台本 `python/data/guide/<国>/<街>/book.py` に、鍵だけの骨（todo 8・見たいもの 22・料理 23・土産 9・店 9）を先に並べ、`guide_book_check` で数が出ることを見てから中身を埋める
2. **写真は最初の一手で Actions に流す**（`actions.md` の写真）。作業箱から Wikimedia に取りに行かない。**429・403 が返ったら、出口も名乗りも替えずに止まって待つ**（#337 #338）。待つあいだに事実を集める
3. **国の表**: 新しい国・街なら、先に `python/data/guide/cities.json` に国（`flag` `tz` `money`）と、街・日帰りの `bbox` を足す（座標の枠がここから決まる）
4. **事実**: 出どころは Wikipedia（日本語・英語）・Wikivoyage・観光局・外務省 海外安全ホームページ・店の献立（PDF も）・2024年以降のニュース。
   1本ずつの WebFetch を作業箱で重ねない——`actions.md` の調べで1回にまとめる（無ければ、1つの出どころから複数の項目を取る）
5. **台本から書く**: `python3 python/guide_book_build.py build <国>/<街>`。座標は `… geo <国>/<街> 鍵=問い …`（枠の外は捨てる）、借りた写真の欄は `… photo <国>/<街> 鍵=File:… …`。**JSON を手で直さない**
6. **注文書**: 鍵が `guidebook.json` に入ってから `python/data/guide/<国>/<街>/art_order.json` を書く（ブカレストの形。表紙は `catch` を書く）。**ここで一度 push する**
7. **面**: `python3 python/guidebook_bake.py <国>/<街>` → `site/app/travel/<国>/<街>/page.tsx` はブカレストのを写す → 名簿 `site/content/guidebook/index.ts` に1行・
   `site/content/travel.ts` の `CITIES` に **`draft: true` つきで**1行（国の面が無い国は `CITY_ONLY`）→ `python/data/seo_targets.json` の `targets` と `pages`
8. **新しい国なら**（`docs/country-guide.md` 6章の表も見る）: 企画 `site/content/plans.ts` に次の国が在るか（無ければ足す。表の中は字そのもので書く・`href` を持たせる。#336）
9. **マイマップ**: `python3 python/guide_book_check.py <国>/<街> --mymaps` → `python3 .claude/skills/mymaps/mymaps.py sync python/data/guide/<国>/<街>/mymaps --city <街の名前>`
   （EC2・`run_in_background`）→ `move` → `verify` が 0。自分で起こした EC2 は終わりに `python3 .claude/skills/ec2-chrome/ec2.py stop`
10. **書体**: 作業箱で `fontweigh`・`subset.py` を回さない・woff2 を積まない。`tools/fonts/subset.py` の `SOLO` に面を1行足し、焼くのは `actions.md` の書体
11. **見張り**: `actions.md` の重い見張りを `guide=<国>/<街>` で1回。表だけ読む。赤は落ちた step の末尾だけ
12. **PR**（札は付けない）: 本文に数の表・Actions の表・「現地で確かめてほしいもの」。`#1228 は閉じない` と1行
13. **公開の枝**: PR の枝から `claude/<街>-public` を切り、公開の手だけを1コミットで積んで push（**PR は作らない**。運営が確かめてから PR にする）:

    | 何 | どこ |
    | --- | --- |
    | 公開前の印を外す | `site/content/travel.ts` の `draft: true` を消す |
    | 週の表が本番へ当てる線 | `python/seo_audit.py` の `PRESETS["prod"]` に `jsonld:/travel/<国>/<街>=Article+ItemList+FAQPage` |
    | 入れた手の控え | `docs/seo.md` 2章に1行（ブカレストの行の形。日はこの日、運営が公開の日に合わせる） |
    | 付箋 | `site/content/themes.ts` に宛先 `<国>`「<街の名前>でこれやって」（`romania` の形）と、面のいちばん下の窓（`page.tsx`）。前の国 `<前の国>` の宛先に `closesOn: "<移る日>"` → `node functions/tools/shutthemes.mjs --write` |
    | `/all` の棚 | `site/content/directory.ts` に国の棚（無ければ）と街の1行。探し言葉は面に在る語だけ（**公開した街が棚に無いと書き出しが止まる**） |
    | 島の板 | `site/components/isle/spec.ts` の板の組の先頭に `<国>` |
    | お知らせ | `site/content/updates.ts` に1行 |

## 触ってよい範囲

- `python/data/guide/<国>/<街>/`・`python/data/guide/cities.json`・`python/data/seo_targets.json`
- `site/app/travel/<国>/<街>/`・`site/content/guidebook/`（焼いたものと名簿）・`site/content/travel.ts`・`tools/fonts/subset.py` の `SOLO`・新しい国なら `site/content/plans.ts`
- 公開の枝だけ: 13 の表のファイル
- **触らない**: `.claude/skills/chatgpt-image/`・`site/public/guide/<国>/<街>/` の描いた絵（絵担当。`photos/` は写真の道具が置く）・`.github/workflows/`・`python/` の道具（公開の枝の `seo_audit.py` の `PRESETS` 1行を除く）・woff2・ほかの街の材料

## 出しかた

- ブランチ `claude/<街>-guide` を master から切る（`git fetch origin master` してから）
- **動いた時点で push する。** 段（写真・台本・注文書・面）ごとに「作業中: …」の題で push。作業箱は再起動しうる（2026-11-20 に担当5人が止まった）
- コミットメッセージは日本語で「なぜ」。モデル名を入れない。末尾に、届いている attribution の指示どおり `Co-Authored-By` と `Claude-Session` の2行
- ほかの枝を取り込むときは `git merge --squash`、取り込んだあと `git ls-files | grep -c -- '-ref-'` が 0
- 出しかたは **PR まで（札なし）と公開の枝の push まで**。札 `出す` は絵担当が付ける

## トークンを食わない進めかた

- 重いもの（写真・調べ・書き出し・書体・見張り）は作業箱で回さない。`actions.md` のとおり Actions で回し、表だけ読む
- **`send_later` と `subscribe_pr_activity` を使わない**（運営のセッションに届く）。Actions の待ちは `gh run watch <id> --exit-status` を `run_in_background` で
- 長いログ・たくさんの絵を開かない。台本の手本は頭と1項目ずつ
- 書き出し（`next build`）を作業箱で回すのは、どうしても要るときだけ（`tools/build.sh`。終わったら `.next-*` を消す）。始める前に `df -h .` で空きが 1.5GB 未満なら回さない（worktree 1つで 400〜900MB 食う）
- **道具の呼び出しが300回を超えたら、いまの段を push して止まり、残りを報告に書く**（運営が新しい担当に配る）

## 報告（12行以内）

PR 番号・枝・公開の枝・注文書の道・数の表（1行: やりたいこと/見たいもの/料理/土産/店）・重い見張りの表（CI のコメントを貼る）・
「現地で確かめてほしいもの」の件数・残した赤（あれば何の足か）・指示に無かったが直したもの。
**視聴者さんの素性を書かない**（件数と日付と video_id まで）。
