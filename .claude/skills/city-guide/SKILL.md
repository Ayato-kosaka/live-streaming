---
name: city-guide
description: 街のガイドの面（ガイドブック型。`/travel/<国>/<街>`）を、ソフィアとスコピエで固まった形のまま次の街で作る手順。材料（好みを人物像にしない・事実は2024年以降・行った街は配信の facts が正）→ 言葉（guide-copy の型）→ 絵（案2 大人の画集）→ 見どころマップ（D2 の下絵に地区名を焼く）→ マイマップ3枚 → 検索 → 見張り → noindex のまま出す → あやとに見せる → OK で公開 → インデックス登録 → 週の表、の順。あやとに見せるのは2回。トリガー語:「街のガイド」「次の街」「ガイドブック型」「街の面を作る」「ソフィアの型で」「スコピエの型で」「city-guide」。
---

# 街のガイドの面を、次の街で同じ形・同じ順番で作る

あやと（2026-11-18、#1228）「ソフィアがフィックスしたら、永続化させて、スコピエにも反映してほしい」。
ソフィア（行く前の街）とスコピエ（行ったあとの街）で、あやとに何度も見せ直して固まった形を、次の街で**見せる回数2回**で回すための順番と道具。

**決めごとの本体は文書が持つ（拘束力あり）。ここは順番と呼び方だけ。** 食い違ったら文書が勝つ。
**数はここに書かない**（面の数・品の数・地区の数）。面の中の数はデータから作り、島の数は `python3 python/counts.py` が数える。

## 0. 先に開く（作る前に1回）

| 何 | 何のため |
| --- | --- |
| `docs/guide-design.md` の ★章 | 面の形（骨組みはガイド・肉付けは体験・やりたいこと・どんな街・地図・札の印）。**★章が下の0〜9章より勝つ** |
| `docs/guide-copy.md` | キャッチ・やりたいことの見出しとリード・地区の呼び名（軸 A/B）。**言葉を書く直前にもう一度** |
| `docs/guide-blog.md` | 行った箱（「あやとの旅の記録」）の感想。**あやとの一人称・です／ます**、その日の事情 → まず思ったこと → 良かった・困った → 次に行く人へ |
| `docs/country-guide.md` | 写真（1-2-1）・通貨のいま（1-3）・国の面を足す場所（6章）・字の束（6-2）・出す前に測る6つ（7章） |
| `docs/island-misses.md` #323 #326〜#333 | ガイドの面で外したこと（4章に1行ずつ） |
| `docs/seo.md` | 狙う語の決めかた・入れた手の控え・週の表の読みかた |
| 本番の `/travel/bulgaria/sofia` と `/travel/north-macedonia/skopje` | 手本。行く前の街はソフィア、行ったあとの街はスコピエを開いて並べる |

**次の街は、スコピエの道で作る**（材料 → 組み立て → 焼く）。ソフィアは手で組んだ TS（`site/content/guidebook/bulgaria-sofia.ts`）で、
焼く道具に載っていない。写すのはスコピエの置き場:

| 置き場 | 何 | 誰が書く |
| --- | --- | --- |
| `python/data/guide/<国>/<街>/guidebook.json` | 骨組みと事実（出どころつき）・行った事実（facts の行への結び） | 材料の担当 |
| `python/data/guide/<国>/<街>/compose.json` | 組み立て（題・説明・人物像・狙う語・カード・一言・地区の色と並び） | 面の担当。**事実は書かない** |
| `.claude/skills/chatgpt-image/guide/<国>/<街>.json` | 絵の頼み書き（表紙・見どころマップ・料理・土産・やりたいこと） | 絵の担当 |
| `python/data/guide/<国>/<街>/mymaps/` | マイマップの CSV と `mids.json` | 道具が焼く・作る |
| `site/content/guidebook/<国>-<街>.ts` | 焼いた中身。**手で直さない** | `guidebook_bake.py` |
| `site/app/travel/<国>/<街>/page.tsx` | 面（スコピエのを写す。字は1つも書かない） | 面の担当 |
| `site/content/travel.ts`（`TRAVEL_CITIES`）・`site/content/guidebook/index.ts`（`GUIDEBOOKS`） | 名簿 | 面の担当 |

## 1. いつ使うか

- 「次の街のガイドを作る」「◯◯もソフィアの型で」「ガイドブック型の面」
- 行った街に「行った」を乗せ直す（行く前の面 → 行ったあとの面）。手で組んだ面（ソフィア）は、行った箱だけを `guidebook_went.py` で焼いて乗せる（5章）
- **使わないとき**: 配信から「実際に行った」を抜くだけ → `/guide-facts`。1つの話の記事（物価など）だけ → `python/guide_article.py`。
  国の面だけ → `docs/country-guide.md` 6章。絵だけ描き直す → `/chatgpt-image` 6

## 2. 段取り（この順で回す）

**あやとに見せるのは ①言葉の候補 と ②仕上がり の2回だけ。** 形（絵の方向・地図の型・札の印・並び・地区名の軸）は
ソフィアで決まっているので聞かない。①の答えを待つあいだ、絵とマイマップを先に回す（どちらも言葉に依らない。
地区名は ChatGPT ではなくこちらの道具が最後に焼くので、地図の絵も先に描ける）。

### 2-1. 材料

1. **人物像と狙う語を先に決めて、`compose.json` の `persona` `terms` に書く**（#323 の決めごと4）。
   サジェストと上位の顔ぶれの取りかたは `docs/seo-2026-11/G_skopje_intent.md` の「測りかた」。読む人は「安く回る個人旅行者」で、
   **あやとの好みではない**（#326）
2. **行った街なら、配信の facts が正。** `/guide-facts` で抜いて確かめ、街ごとの下書きを読む。行っていない所も骨組みから消さない
3. **骨組み（見たい・食べたい・買いたい・やりたい・基本情報）は出どころつきの外の事実。**
   「いまもある・やっている」・値段・行き方・入場料は **2024年以降の出どころ**で確かめる（#328）。確かめきれないものは消さずに、
   PR か issue に「現地で確かめてほしいもの」として箇条書き。通貨は現地のいまを引く（`docs/country-guide.md` 1-3）
4. 実在の場所の写真は Commons から（Actions「写真の候補を探す」→ 必ず目で選ぶ）。行った所は、その日のあやと島カード
5. **合格**: `guide_book_check.py <国>/<街>` が 0（出どころの無い事実・座標の無い店・facts に辿れない「行った」・行っていない街の「行った」が 0）。
   道具にスコピエ固定の所があるので、次の街では先にそこを直す（5章の「穴」）

### 2-2. 言葉 → 見せる①

`docs/guide-copy.md` を開いてから書く（型の外で書かない）。

| 何 | 決まり |
| --- | --- |
| キャッチ | guide-copy 2章の型のどれか。1案ずつ「手本にした人の文言」を添える（添えられない案は出さない）。読点で割らない・調べた細部を入れない |
| やりたいこと | **8つまで**、街の大きさで。名所の紹介ではなく「その街といえばのベタな欲求」（#327）。題は「〜したい！」20字まで。リードは25字前後で1つだけ。窓の中は出どころの事実だけ |
| 見出し・リード | 同じ止めかたを3つ続けない。調べた細部はリードと窓へ |
| どんな街 | 短い問い（「歴史は？」）と2〜3文の答え。大きな数の札を作らない。**問いは2〜3つ、その街が日本語のガイド・観光局の紹介で何で語られているかを調べて選ぶ**（前の街の問いを写さない。お金・言葉は基本情報と同じ話なので置かない。#333）。選んだ理由を出どころつきで①のコメントに添える |
| 地区の呼び名 | guide-copy 5章の順: 日本語のガイドの地名（A）→ 目印＋周辺（A）→ 見どころの無い所だけ性格でまとめる（B）→ 札を立てない。札は9字目安。**作った呼び名を使わない**（#329） |

候補は guide-copy 6章の「書かない」の表と7章の当てに1案ずつ通してから、**#1228 の 11-16〜11-18 の形で1コメントに番号で並べる**
（「B=3、C=2」と答えられる形。キャッチは5〜7案・見出しとリード・地区の名前は2案ずつ、出どころつき）。
通知は 2-10 と同じ `call_ayato.yml`。**答えを待つあいだ止まらない**（2-3・2-5 へ進む）。

### 2-3. 絵

- **案2「大人の画集」**（あやと 2026-11-16）。頼み書きはスコピエのを写して `scene`・品ごとの `desc`（英語）と `alt` を書き換える。
  `style_ref` はソフィアの1枚のまま（トーンをそろえる）
- **実在の場所は本物の写真**（#1228 の Q1 は A）。描くのは表紙・見どころマップ・料理・土産と、行っていないやりたいこと
- **料理と土産の絵に布を描かせない**（ナプキン・ハンカチ・テーブルクロス。`docs/guide-design.md` 4-2 の「布」）。道具が頼み文に入れるので、`desc` に布を書かない
- **表紙には題を焼く**（#333）。頼み書きの頭に `title`（街の名前・「観光ガイド」・キャッチ・国）、`cover` `cover_tall` に札の置き場 `title` と `file`。
  札は街の主役（建物・像）を隠さない所へ。`finalize` が焼く。**横 240px に縮めて街の名前が読めるか**を自分で見る（縮めかたは5章「地図・表紙の 240px」）
- **og と記事の絵は字の無い表紙から**（`finalize` が og の 1200x630 と Article の 16:9・4:3・1:1 を切る。#332 の決めごと3）。題を焼いた絵は面の表紙だけ。
  主役が切れる比は頼み書きの `cover.share`（スコピエの 4:3 は縦から）
- **札の絵は描いた絵・借りた写真のまま。その日のあやとのカードは窓の中の行った箱に**（`compose.json` の `cards`。2026-11-19 に改めた。
  あやと「やりたいことの札の絵は、あやと島カードの写真に替えなくていい」。`docs/island-misses.md` #335）
- 回しかたは `/chatgpt-image` 6（`plan` → `layout` → `run` → `status` は `send_later` で待つ → `fetch` → `finalize` → `sheet`）。
  見るのは `sheet` の2枚だけ。新しい街は `sheet --with bulgaria/sofia` でトーンを混ぜて見る

### 2-4. 見どころマップ（どんな街の地図）

- **D2**（家と木を描かない水彩の地図＋目印の小さな絵）。下絵は `layout` が OpenStreetMap から作る
- **地区の色と名前は絵に焼く**（#1262。画像検索に出るのは絵だけ）。字は ChatGPT に描かせず `finalize` が焼く。
  札の行は頼み書きの `areamap.areas[].label`、名前の出どころは `areas[].source` の1本目
- **題の帯と目印の名前も焼く**（#332。画像検索の上位の地図は全部そうしている）。`areamap.title`（「〈街〉」＋「見どころマップ」）と
  `areamap.names[]`（描いてある目印だけ・名前は面の見たいものの字・目印の絵の真下か脇）。**番号の点は足さない**
- 描いたあとで地区を足すときは描き直さない。`districts` に `paint: true` で足すと `finalize` が色を重ねる（`guide_layout.wash`。スコピエのデバル・マーロ）
- 役目は**概要だけ**（地区の名前・雰囲気のひとこと・地図の外の矢印）。写真のピン・番号・詳しい一覧は置かない（#327）
- **合格**: 横240pxに縮めた1枚で題と地区名が全部読める（縮めかたは下の5章「地図・表紙の 240px」）。ファイル名・alt・すぐ上の見出しが「<街>の見どころマップ（地区分け）」

### 2-5. マイマップ3枚

見たい・食べたい・買いたい。CSV は材料から焼く（地図の上で手で直さない）→ `/mymaps` の `sync` で作る（mid が `mids.json` に入る）→
`move` で Drive のフォルダへ → `verify`。**見たいもののマイマップは、その節の札より上**。

### 2-6. 面を組む

1. `compose.json` を書く（題・説明・人物像・狙う語・カード・一言は節に1つ・地区の色と並び）
2. `guidebook_bake.py <国>/<街>` で焼く（止まったら材料か組み立ての食い違い。焼いた TS を手で直さない）
3. `page.tsx` はスコピエのを写す（行く前の街なら、行った箱・動画の欄が空のまま出るかを書き出しで見る）
4. 名簿: `GUIDEBOOKS` に1行、`TRAVEL_CITIES` に **`draft: true` つきで**1行。新しい国なら `docs/country-guide.md` 6章（国の面）も
5. 字の束を焼き直す（`docs/country-guide.md` 6-2。足した面だけ `ONLY=` で測って差し込む）

### 2-7. 検索

| 何 | 決まり |
| --- | --- |
| 題 | **「〈街〉観光ガイド」が頭**・`〈街〉観光ガイド【2026年】見どころマップ・やりたいこと・グルメ｜〈国〉`（字は `content/guidebook/heading.ts`。#332・#333）。**題と表紙の字に「やりたいこと◯選」を入れない**（節の見出しにだけ） |
| 説明・h1 | h1 は「〈街〉観光ガイド」＋面が答える語（部品 `Cover.tsx` が出す）。説明は「観光ガイド」「見どころマップ」を1回ずつ |
| 構造化データ | 見たいものの `ItemList`（座標つき）・見どころマップの `ImageObject`・埋めたショートの `VideoObject`・どんな街の `FAQPage`。どれも部品が出すので、page.tsx をスコピエから写せば入る |
| 書き手と記事の絵 | 面のいちばん下に記事と同じ書き手の枠（`Writer`。署名は「あやと島案内鳥」、行った街は facts のいちばん早い日）。Article の `image` は字の無い表紙の 16:9・4:3・1:1（`manifest.json` の `cover.ld`）。どちらも page.tsx をスコピエから写せば入る |
| 入口 | `/travel` と国の面のカード・sitemap（画像のサイトマップも）は、`draft` を外すとひとりでに出る。国の面が無ければ作る（前のブルガリアは 404 だった） |
| 狙う語の控え | `python/data/seo_targets.json` の `targets` と `pages` に街の語と面を足す（週の表はここだけを読む） |

### 2-8. 見張り（出す前。書き出しは1本だけ、道具は同じ書き出しに当てる）

```bash
tools/build.sh 3130
python3 -m http.server 4130 --directory site/.next-3130 &
python3 python/guide_watch.py --dist site/.next-3130 <国>/<街>                           # 額・一言・口調・節の一言・場面・出どころ
DIST=site/.next-3130 SPORT=4130 PAGE=/travel/<国>/<街> node tools/sprites/guidebook.mjs   # 札の大きさ・4:3・縦1列・札の印・どんな街・地図
python3 python/seo_audit.py --dist site/.next-3130 --no-site --detail /travel/<国>/<街>  # JS を切った目で見出しの木と JSON-LD
```

- 終了コードで読む（0=通った / 1=見つかった / 2=数えるものが無い。2 を合格と読まない）
- **48px割れ（`reachwatch`）・最初の1画面の重さ（`firstload`。上限は道具の `MAX_DEFAULT`、2026-11-18 は 810KB）・
  画面で仕様を説明する字（`nospec`）は、枝で Actions の「重い見張り」（`heavy_watch.yml`）を押して表だけ読む**
- 出す前に、390px・dpr 2 でやりたいことの節とどんな街の節を撮って、**自分で「ワクワクするか」を見る**。
  その語で調べた初めての人として読み、上位3件より勝つ所を1行で言えなければ出さない（#323 の決めごと5）
- 終わったら配った箱を落とし、`site/.next-3130` を消す

### 2-9. noindex のまま出す

`draft: true` のまま PR に札 `出す`（`/island-ship`）。ship.yml のコメントの1行目を読む。
「出しきれませんでした」は出ていない（`docs/island-misses.md` #325）。本番の URL を開いて、骨組みの節が揃っているかを見る。

### 2-10. あやとに見せる②

#1228 の形で1コメント（本番の URL・入れたもの・地区名と出どころ・**まだ粗い所**）→ 通知は `call_ayato.yml`
（自分のトークンで書いた `@` は飛ばない。`/ask-ayato`）。末尾は「OK なら、公開前の印を外して検索に出します」。
答えを待つあいだは次の仕事へ。返事はセッションの頭で `待ち-システム` の札から拾う（`docs/island-misses.md` #330）。

### 2-11. OK で公開（印を外す PR）

`TRAVEL_CITIES` の `draft: true` を消す（記事があれば `TRAVEL_ARTICLES` のも）。**旗を倒すと道が変わる**——robots・sitemap・
`/travel` と国の面のカード・`/llms.txt`・IndexNow。倒した値で書き出して `seo_audit.py --dist … --detail` と `crawl.mjs` を1回通してから
札を付ける（`docs/island-misses.md` #331）。同じ PR で `python/seo_audit.py` の `PRESETS["prod"]` に
`jsonld:/travel/<国>/<街>=Article+ItemList+FAQPage` を1本足す（ソフィアと同じ線。週の表が毎週本番へ当てる）。
出したら `docs/seo.md` 2章に1行（日・何を・見張り）。

### 2-12. Search Console でインデックス登録

EC2 の Chrome（札 `ytstudio`。`/ec2-chrome`）で Search Console の URL 検査 →「インデックス登録をリクエスト」。街の面と国の面。
押す前の状態（「URL is unknown to Google」など）を控えて #1262 に1行。**道具は無い**（5章）。

### 2-13. 週の表で追う

`seo_weekly.yml` が月曜の朝に #1262 へ表を出す。読みかたと「効いた／効いていない」の線（2週・4週・8週）は `docs/seo.md` 3〜4章。
**1週の上下で決めない。** 親の街の面が2週の線を越えるまで、子の記事（物価・名物）を増やさない。

## 3. あやとに聞くこと／聞かないこと

| | 聞く | 聞かない（こちらで決めて報告） |
| --- | --- | --- |
| 仕様（何を作るか） | 揺れたら **issue で**（チャットで聞かない。`/ask-ayato`）。いま動いているものを数えてから、選択肢と数字を並べる | — |
| 言葉 | キャッチ・やりたいことの見出しとリード・地区の名前を、**候補を番号で並べて選んでもらう**（2-2） | guide-copy の型と「書かない」の表に当てて、候補をどこまで絞るか（型の外の案は候補に出さない） |
| 形 | — | 絵の方向（案2）・地図（D2）・札の印・並び（4:3 縦1列）・節の名前と絵・地区名の軸（A/B） |
| 品質 | — | 出すか出さないか。基準に届いていなければ出さない（「前より良い」は基準ではない） |
| 公開 | **仕上がりを見て OK か**（2-10）。最初の公開だけ | 公開したあとの直し・検索の手（`docs/seo.md` 4章） |

## 4. 外しやすいところ（`docs/island-misses.md` から1行ずつ）

- **好みで外さない**（`docs/island-misses.md` #326）: 好みは人物像ではない。豚・酒の定番を外さず、窓の中のアイコンで知らせる。安さの観点は残す
- **題に打たれない語を詰めない**（`docs/island-misses.md` #327）: やりたいことは名所の紹介でなく欲求から。大きな数の札・詳しすぎる地図も同じ根
- **札の印は3種だけ**（`docs/island-misses.md` #328）: その国ならでは・値段・季節。「イラスト」「必見」・豚と酒は札に出さない。「いまも」は2024年以降の出どころで
- **AI 臭い言葉・作った呼び名**（`docs/island-misses.md` #329）: 人の書いたガイドの型の外で書かない。地区は日本語のガイドの字（「おしゃれ地区」「歴史地区」も作った呼び名）
- **返事を拾い忘れる**（`docs/island-misses.md` #330）: 要約の「〜待ち」を信じず、issue を開いて確かめる
- **段の旗を倒したときの道具**（`docs/island-misses.md` #331）: `draft` のように旗で道が分かれる道具は、倒した値で1回通してから倒す
- **題と表紙を面の中身で立てる・問いを真似しない**（`docs/island-misses.md` #332・#333）: 題と h1 は「〈街〉観光ガイド」、表紙の絵に題を焼く。どんな街の問いは、その街が何で語られているかを調べて2〜3つ
- **行った感想を三人称の記録にしない・facts から品を作らない**（`docs/island-misses.md` #335）: 行った箱は `docs/guide-blog.md` の型で、あやとの一人称。
  品はガイドの品だけ（防寒具・自炊の買い出しは「ガイドブックになっていない」）で、体験はその品の窓に肉付けする
- ほかに: ガイドを配信の事実の並びにしない（`docs/island-misses.md` #323）・行っていない街を「行った」と書かない（`docs/island-misses.md` #324）

## 5. 道具の呼び方（`<国>/<街>` を取る。2026-11-18 にスコピエで1つずつ確かめた）

| 段 | 呼び方 | 確かめかた | 穴（次に作る人へ） |
| --- | --- | --- | --- |
| facts | `python3 python/guide_facts.py pending --country <国>`／`city --country <国> --city <街> -o <scratch>/<街>.md`。抜くのは `python3 python/guide_extract.py --pending --country <国> --out <scratch>/guide --jobs 3`（`claude -p`） | `pending`・`city` は乾いた実行 0。`guide_extract` は `--help` | — |
| 材料の確かめ | `python3 python/guide_book_check.py <国>/<街>` | 乾いた実行 0 | **座標の枠（`BBOX`）とショートの国旗（🇲🇰）がスコピエ固定**。次の街の前に、材料か国の表から読むように直す |
| 材料を集める | **無い** | — | 11-15 に「1回の `claude -p` に決まった形で書かせ、道具で出どころを確かめる」と決めたが、道具はまだ。いまは担当が集める |
| 人物像と狙う語 | **無い** | — | サジェストは curl（`G_skopje_intent.md` の測りかた） |
| 写真（Commons） | `gh workflow run commons_photos.yml -f 'queries={"<料理>":"<1語>"}' -f limit=10`（artifact `photos`）→ `python3 python/guide_photos.py --lookup "File:<名前>.jpg" …`（材料の写真の欄を組む。外に出る）／`--check <国>/<街>` | `--check` 0・ワークフローは `gh workflow view` で入力を見た | — |
| カードの写真 | `python3 python/guidebook_bake.py <国>/<街> --photos` | `--help` | 外に出る |
| 行った（手で組んだ街） | `python3 python/guidebook_went.py <国>/<街>`（組み立ては `python/data/guide/<国>/<街>/went.json`。`--photos` でカード・`--check` で比べる）。焼いた `<国>-<街>-went.ts` を面の TS が id で当てる | `guidebook_went_selftest.py`（崩した組み立てを1点ずつ止める） | ソフィアだけ。材料を焼く道に移したら要らない |
| 焼く | `python3 python/guidebook_bake.py <国>/<街>`（`--check` で焼かずに比べる） | `--check` 0 | **通貨がスコピエ固定**（`デナル`・`eur_mkd`・レートの日付）。行く前の街（facts の無い街）を焼いたことはまだ無い |
| 面 | **無い**（スコピエの `page.tsx` を写す） | — | — |
| 絵 | `python3 .claude/skills/chatgpt-image/guide_art.py <国>/<街> plan｜layout｜run｜status｜fetch｜finalize｜sheet｜check --work <scratch>/guide-art/<国>/<街>` | `plan`・`check` 0 | — |
| 地図・表紙の 240px | **無い**。`python3 -c "from PIL import Image; im=Image.open('<…>-1200.webp'); im.resize((240, round(240*im.height/im.width)), Image.LANCZOS).save('<scratch>/am240.png')"`（表紙は `<街>-観光ガイド-1600.webp` と `-縦-1600.webp`） | 乾いた実行 0 | — |
| マイマップの CSV | `python3 python/guide_book_check.py <国>/<街> --mymaps` | 乾いた実行 0（差分 0） | — |
| マイマップ | `python3 .claude/skills/mymaps/mymaps.py sync python/data/guide/<国>/<街>/mymaps --city <街の名前>`／`move <dir>`／`verify <dir>` | `verify` 0 | `sync` `move` は EC2（`run_in_background`） |
| 記事 | `python3 python/guide_article.py <国>/<街>/<話> --check` | 乾いた実行 0 | — |
| 面の見張り | `python3 python/guide_watch.py --dist site/.next-<port> <国>/<街>` | 書き出し無しで 2 | — |
| 形の見張り | `DIST=… SPORT=… PAGE=/travel/<国>/<街> node tools/sprites/guidebook.mjs` | 配っていない口で 2 | **Actions に乗っていない**（`heavy_watch.yml` に無い）。手元の書き出しで回す |
| 重い見張り | `gh workflow run heavy_watch.yml --ref <枝>`（reachwatch・firstload・nospec。`apply` は付けない＝見るだけ） | `gh workflow view` で入力を見た | — |
| 検索の作り | `python3 python/seo_audit.py --no-site --detail /travel/<国>/<街>`（本番）／`--dist site/.next-<port>`（出す前。置き場に `sitemap.xml` が要る） | 本番で 0・`--dist` も 0 | — |
| 字の束 | 街の面を `tools/fonts/subset.py` の `SOLO` に足す（その面の字だけの1本。ソフィア 1,206.6 → 332.2KB）→ `ONLY=/travel/<国>/<街>.html OUT=… DIST=… SPORT=… node tools/sprites/fontweigh.mjs` で測って表へ差し込む → `python3 tools/fonts/subset.py --export site/.next-<port>` → `DIST=site/.next-<port> node tools/sprites/fontbudget_selftest.mjs`（書き出しを渡すと、表の古さまで見る） | `--help`・構文 | — |
| あやとを呼ぶ | `gh api -X POST repos/Ayato-kosaka/live-streaming/actions/workflows/call_ayato.yml/dispatches -f ref=master -f 'inputs[issue]=<番号>' -f 'inputs[text]=<何を決めてほしいか>'` | `gh workflow view` で入力を見た（押すと通知が飛ぶので押していない） | 字は公開のログに出る |
| インデックス登録 | **無い**（EC2 の Chrome で手で） | — | — |
| 週の表 | 月曜の朝にひとりでに。手で見るなら `gh workflow run seo_weekly.yml -f dry_run=true`（issue に書かずに要約へ） | `gh workflow view` で入力を見た | — |

## 6. 1つの街のトークンの目安

**作業箱で 30万トークン以内**（2026-11-15 の決め。ソフィアとスコピエは担当1人で 30万〜65万。大半は1回きりの部品づくりと、
道具が無くて手で回した仕事だった）。

| 仕事 | どこで回す | 作業箱の見込み |
| --- | --- | --- |
| facts（行った街） | `claude -p`（`guide_extract.py`。1本 約6万は作業箱の外） | 表を読むだけ |
| 絵 | EC2 の ChatGPT（`guide_art.py`） | 頼み書き 5〜8万＋回す 1〜2万（`/chatgpt-image` 6） |
| マイマップ | EC2（`mymaps.py`） | 終わりの表だけ |
| 書き出しと重い見張り | Actions（「重い見張り」・`ship.yml`） | PR のコメントの表だけ |
| 材料・言葉・組み立て | 担当 | 残りの大半。言葉は guide-copy の型に当てるだけにして、調べ直さない |

- 担当には `/hand-off` の型で配る。分けかたは **材料／絵／面** の3人（worktree を分ける。絵の担当は頼み書きと `site/public/guide/<国>/<街>/` だけ、
  面の担当は `compose.json`・`page.tsx`・名簿）。報告は15行以内
- 待つときはポーリングしない（PR は `subscribe_pr_activity`、ChatGPT とマイマップは `send_later`）。長いログ・たくさんの絵を読まない
- **同じ仕事を2回したら道具にする。** 5章の「無い」は、次の街で手で回したら、その街の PR で道具にする
