# 依頼文 3/3: 行った（行った箱と記事。行った担当）

> **運営へ。** その街を出て、その街の配信の議事録がそろってから（`python3 python/stream_notes.py pending` に残っていない）、
> `<…>` を全部埋めて下の線から下を貼る。埋める欄: `<国>`・`<街>`・`<国の名前>`・`<街の名前>`・`<場所>`（記事にしたい場所の slug。空なら「担当が決める」と書く）。
> 記事が多い街（6本を超える）は、場所で分けて2人に配る（同じファイルを踏む名簿の行は、後の人が master を取り込んでから足す）。

---

あなたは「あやと島」（ayato-arigato.com）の街のガイドの**行った担当**です。
<国の名前>・<街の名前> のガイドの面（`/travel/<国>/<街>`）に、配信で実際に行ったこと（行った箱「あやとの旅の記録」）を肉付けし、
厚い所（目安800字以上）は記事 `/travel/<国>/<街>/<場所>` にします。対象: <場所>。

## 最初に読む（名指しの所だけ）

- `docs/guide-blog.md` の 0〜6章（型・書かない・どこに書くか）
- 手本の記事（あやと「めっちゃいい」）: 台本 `python/data/guide/north-macedonia/skopje/matka.json`・面 `site/app/travel/north-macedonia/skopje/matka/page.tsx`
- `.claude/skills/guide-facts/SKILL.md` の 1章（facts を抜く道具）

## 合格の条件

1. **材料がそろっている**: `python3 python/guide_facts.py pending --country <国>` に残りが無く、`python3 python/guide_facts.py check --country <国>` が 0
2. **作り話が0**: 一文ずつ、結んだ facts の行に辿れる。材料はその日の facts の「そのまま出せる行」だけ——`[verify]`・`[chat]` の行と、本人の思い込みかもしれない断定は使わない。数は結んだ行に在る数だけ
3. **調子**: あやとの一人称・です／ます（`docs/guide-blog.md` 2〜4章）。口述された例文は句読点のほかは変えずに使い、`said` に控える
4. **行った箱**: ガイドの品にだけ肉付けする（facts から品を作らない）。1節に一言は1つ。**札の絵は替えない**（その日のカードは窓の中の箱に）
5. **記事**（matka と同じ型）: 1節に一言は1つ・**表紙の写真を本文に置かない**・「◯日まで」を書かない（日付のある文は過去形で言い切る）・
   icon は `site/components/ui/icons/index.ts` の `IconName` に在る名前だけ（使う名前ごとに grep で在るかを見る。焼く道具は無い名前を通してしまう）・
   その日のあやと島カードが無ければ、街のガイドが借りている Commons の写真を使う。窓には要約2〜3行と「続きを読む」だけを残す
6. 次が全部 **0**: `python3 python/guide_article.py <国>/<街>/<場所> --check`（記事ごと）・
   `python3 python/guidebook_bake.py <国>/<街> --check`（ソフィアのように手で組んだ街は `python3 python/guidebook_went.py <国>/<街> --check`）・
   `python3 python/text_expires_watch.py`・
   `python3 python/selftest_runner.py python/guide_article_selftest.py python/guide_watch_selftest.py python/guidebook_went_selftest.py python/guide_facts_selftest.py python/text_expires_watch_selftest.py`
7. **出た先を自分で開いて見出しと合っているか**: 街の面の窓・国の面（「行った街」には街だけ。記事は街の札の下の畳み。#340）・サイトマップ。重い見張り（`guide=<国>/<街>`。`.claude/skills/city-guide/actions.md`）の表で 0

## 配線（1記事ごと。この表の7か所。名簿を手で書くのはここだけ）

| 何 | どこ |
| --- | --- |
| 台本 | `python/data/guide/<国>/<街>/<場所>.json`（matka.json を写す。`_meta` に persona と terms） |
| 焼く | `python3 python/guide_article.py <国>/<街>/<場所>` → `site/content/travel/<国>/<街>-<場所>.ts` |
| 面 | `site/app/travel/<国>/<街>/<場所>/page.tsx`（matka のを写す。字を書かない） |
| 名簿 | `site/content/travel.ts` の `ARTICLES` に1行・`site/content/travel/articles.ts` に import と1行 |
| 窓の「続きを読む」 | 組み立ての `items[].article`（台本の街は `book.py` を直して `python3 python/guide_book_build.py build <国>/<街>`。JSON の街は `compose.json`。手で組んだ街は `went.json`） |
| 書体 | `tools/fonts/subset.py` の `SOLO` に1行。**焼くのは `actions.md` の書体**（作業箱で `fontweigh`・`subset.py` を回さない・woff2 を積まない）。測る面は最初から3つ渡す: 記事・街の面・国の面（`/travel/<国>/<街>/<場所>.html,/travel/<国>/<街>.html,/travel/<国>.html`。国の面を漏らして1回落ちた） |
| 見張りの表 | `python/dead_stream_watch.py` の表（記事の焼いたファイルの行と、並びの行の2か所） |

書き換えるときは JSON の書式を崩さない（`json.dump(..., ensure_ascii=False, indent=1)` で、前と同じ形か `git diff` で見る）。

## 触ってよい範囲

- 上の配線の表のファイルと、`streams/<年>/<月>/*.facts.json`・`python/data/guide/cities.json` の `places` `trips`
- `python/data/guide/<国>/<街>/` の行った箱の字（facts だけを持つ字・`story`）
- **触らない**: 骨組みの字（出どころつきの外の事実。混ぜない）・描いた絵・woff2・`.github/workflows/`・`python/` の道具・ほかの街

## 出しかた

- ブランチ `claude/<街>-went` を master から切る（`git fetch origin master` してから）
- **記事が1本焼けるたびに push する**（作業箱は再起動しうる）
- コミットメッセージは日本語で「なぜ」。モデル名を入れない。末尾に、届いている attribution の指示どおりの2行
- PR を作り、本文に場所ごとの表。`#1228 は閉じない` と1行。合格の条件が全部そろったら札 `出す` を付けてよい（街の面がもう公開されていれば、記事も公開で出る）
- 札を付けたあとは、その枝で重い見張りを手で回さない・push しない（ship.yml が待ったまま止まる。#1329）。確かめは札を付ける前に

## トークンを食わない進めかた

- facts を抜くのは道具（`guide_extract.py`。`claude -p` で作業箱の外）。1本ずつ自分で字幕を読まない。読むのは `guide_facts.py city` の束だけ
- **`send_later` と `subscribe_pr_activity` を使わない**（運営のセッションに届く）。Actions の待ちは `gh run watch <id> --exit-status` を `run_in_background` で
- 書体・書き出し・見張りは Actions。表だけ読む
- 道具の呼び出しが300回を超えたら、焼けた記事までを push して止まり、残りの場所を報告に書く

## 報告（15行以内）

場所ごとの表（場所・前の字数・後の字数・配信の本数・記事にしたか）・PR 番号・selftest と `--check` の終了コード・
重い見張りの表（CI のコメントを貼る）・使わなかった facts の行の件数（確かめが要る行・チャットの行）。
**視聴者さんの素性を書かない**（件数と日付と video_id まで）。
