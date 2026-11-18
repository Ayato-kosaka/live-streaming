# A. ルーティングの棚卸し（事実の表）

- 調べた日: 2026-11-13（リポジトリ `17469bf`、master。書き換え・git 操作は 0）
- 確かめかた: コードを開いて読む／grep。数は `python3 python/counts.py` と、本番の `sitemap.xml` の突き合わせ
- 本番を curl したのは 10本: `sitemap.xml` `robots.txt` `/` `/island/balkans` `/bulgaria` `/map/poland` `/nordic/poland` `/island/albania`（301 だけ）`/alertbox` `…firebaseapp.com/bulgaria`
- ビルドは回していない。**「未確認」と書いたものは、コードから読めなかったもの**
- `site/app/bulgaria` `site/content/bulgaria*` は中身の良し悪しに触れていない（道・リンク・head だけ見た）

---

## 0. 先に数だけ

| 何 | いくつ | 出どころ |
| --- | --- | --- |
| Next の道の型（`page.tsx`） | **40**（静的 30 ＋ 動く段 10） | `find site/app -name page.tsx` |
| Next が書き出す面 | **156**（静的 30 ＋ 動く段 126）＋ 404 が 1 | 下の表1。動く段の数は本番 sitemap と一致 |
| うち index してよい面 | **149**（＝本番 sitemap の一意な URL 数） | 156 − noindex 7 |
| sitemap.xml の行 | **150**（`/updates` が2回。一意は 149） | 本番 `sitemap.xml` |
| `public/`（Expo 側）の HTML | **10** | `find public -name "*.html"` |
| Expo の rewrite の面 | **4**（`/alertbox` `/daily_user_stats` `/ve-comment` `/ve-postit`） | `firebase.json` |
| Hosting の 301 | **17 行**（行き先は 5 種: `/`・`/nordic#day-N`・`/nordic/review`・`/cards`・`/board`） | `firebase.json:9-95` |
| Functions の口 | `/island-api/**`（77 口）＋ `/nanitabeyo-weekly-report-proxy` | `counts.py`・`firebase.json:96-108` |
| 章（島） | **6**（本線 5 ＋ 枝 1） | `site/content/chapters.ts:67-` |
| 国（`COUNTRIES`） | **24 行 ＝ 23 か国 ＋ `iran-border`**。歩いている最中 2（`AHEAD_COUNTRIES`）。「歩いた国」の数は 25 | `countries.ts:19, 603`・`counts.py` |
| 街 | **57 個の名前**（`stays[].cities`）。**街の面は 0・街の slug は 0** | 表2 |
| 日 | 北欧の旅だけ。旅程 17 行のうち面を持つのは **10**（出発・1〜9日目） | `nordic.ts:728, 1255` |
| 配信 | 842 本（`STATS_FALLBACK`）。**配信1本ぶんの面は 0**。議事録は `streams/` に 721 本（島には出ていない） | `site.ts:181`・`find streams -name "*_*.md"` |

---

## 1. 道の型の一覧表

誰向け: **初見**＝検索から来る人／**常連**＝いつもの視聴者さん／**本人**＝ログインした本人／**OBS**＝配信に映す道具／**運営**＝あやと・こちら。

canonical は `site/lib/share.ts:72`（`alternates.canonical = opts.canonical ?? opts.path`）が出す。**`share()` を通していない面は canonical を持たない。**
robots の指定が無い面は index（`robots.txt` は `Allow: /` だけ。`site/app/robots.ts:8`）。

### 1-1. Next（`site/app`）— 40 型 / 156 面

| # | 型 | 面 | 何の面か | 誰向け | sitemap | robots | canonical |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| 1 | `/` | 1 | 表紙。**いまいる章の島**＋紙4章（これから／いま／これまで／見にいく） | 常連（初見の入口でもある） | 在 | 指定なし | **無い**（`app/page.tsx` に metadata なし・`layout.tsx:39-69` に `alternates` なし。本番 `/` で `rel="canonical"` 0件。`og:url` だけ在る） |
| 2 | `/about` | 1 | あやとのこと（経歴・年表） | 初見・常連 | 在 | — | 自分 |
| 3 | `/all` | 1 | 島のなか ぜんぶ（行き先 148 の索引。字でしぼれる） | 常連・初見 | 在 | — | 自分 |
| 4 | `/apps` | 1 | アプリの一覧 | 初見・常連 | 在 | — | 自分 |
| 5 | `/apps/[slug]` | 3 | アプリ1本（nanikore / nanitabeyo / spelieve） | 初見 | 在 | — | 自分 |
| 6 | `/atlas` | 1 | 島の地図（章の連なり。矢印で島を渡る） | 常連 | 在 | — | 自分 |
| 7 | `/board` | 1 | やってほしいこと（付箋の掲示板） | 常連 | 在 | — | 自分 |
| 8 | `/bulgaria` | 1 | ブルガリア・ソフィアの歩きかた（**行く国の案内**） | 初見・常連 | 在 | — | 自分 |
| 9 | `/cards` | 1 | あやと島カード（その日の写真） | 常連 | 在 | — | 自分 |
| 10 | `/design` | 1 | デザインの見本 | 運営 | 無 | noindex, nofollow | 自分 |
| 11 | `/friends` | 1 | 住んでる人（視聴者さんのキャラクター図鑑） | 常連 | 在 | — | 自分 |
| 12 | `/goods` | 1 | あやとグッズ | 常連 | 在 | — | 自分 |
| 13 | `/goods/stickers` | 1 | ステッカー | 常連 | 在 | — | 自分 |
| 14 | `/island/[chapter]` | 6 | **章の島**（europe / middle-east / caucasus / iran-walk / nordic / balkans） | 常連・初見 | 在（6つとも） | — | 5面は自分。**いまいる章（balkans）だけ `/`**（`island/[chapter]/page.tsx:59` の `chapterHref(c)`。本番で確認） |
| 15 | `/island/[chapter]/streams` | 5 | その章の配信だけ（europe 128本・middle-east 113・caucasus 476・iran-walk 17・nordic 24）。**いまいる章には無い** | 常連・初見 | 在 | — | 自分 |
| 16 | `/kitchen` | 1 | クッキング・スタンプ帳（料理の一覧） | 初見・常連 | 在 | — | 自分 |
| 17 | `/kitchen/[slug]` | 48 | 料理1品 | 初見 | 在 | — | 自分 |
| 18 | `/legends` | 1 | 伝説の企画（一覧） | 初見・常連 | 在 | — | 自分 |
| 19 | `/legends/[slug]` | 9 | 伝説の企画1つ | 初見 | 在 | — | 自分 |
| 20 | `/map` | 1 | 歩いた国（年表と世界地図） | 初見・常連 | 在 | — | 自分 |
| 21 | `/map/[slug]` | 24 | **歩き終わった国の記録**（地図・街・出来事・料理） | 初見 | 在 | — | 自分 |
| 22 | `/me` | 1 | じぶんのこと | 本人 | 無 | noindex, nofollow | 自分 |
| 23 | `/me/desk` | 1 | 島の手入れ（OBS の URL 発行など） | 運営（あやと） | 無 | noindex, nofollow | 自分 |
| 24 | `/me/roulette` | 1 | ルーレットの操作側 | 運営 | 無 | noindex, nofollow | 自分 |
| 25 | `/months` | 1 | 月ごとのふりかえり（一覧） | 常連 | 在 | — | 自分 |
| 26 | `/months/[key]` | 10 | 1か月ぶん（2026-01〜2026-10） | 常連 | 在 | — | 自分 |
| 27 | `/next` | 1 | 企画（日にちの決まったもの・終わったもの） | 常連 | 在 | — | 自分 |
| 28 | `/next/new` | 1 | 畳んだ面。`/board` へ送るだけ | — | 無 | noindex, follow | **`/board`**（Hosting も 301） |
| 29 | `/nordic` | 1 | 北欧ヒッチハイクの旅そのもの（旅程・地図） | 初見・常連 | 在 | — | 自分 |
| 30 | `/nordic/[country]` | 6 | 北欧6か国の**行く前の案内**（見どころ・やってほしいこと） | 初見・常連 | 在 | — | 自分 |
| 31 | `/nordic/day/[n]` | 10 | 旅の1日ぶん（`depart`・`1`〜`9`） | 常連・初見 | 在 | — | 自分 |
| 32 | `/nordic/guide` | 1 | 旅のしおり（お金・通信・服…） | 初見 | 在 | — | 自分 |
| 33 | `/nordic/photos` | 1 | 畳んだ面。`/cards` へ送るだけ | — | 無 | noindex, follow | **`/cards`**（Hosting も 301） |
| 34 | `/north-macedonia` | 1 | 北マケドニアの**行く国の案内** | 初見・常連 | 在 | — | 自分 |
| 35 | `/now` | 1 | いまどこ（中身は `/island-api/state` から。焼いた字は「世界のどこか」） | 常連 | 在 | — | 自分 |
| 36 | `/privacy` | 1 | プライバシーポリシー（Google OAuth 審査に出す URL） | 審査・本人 | 在 | — | 自分 |
| 37 | `/roulette` | 1 | ルーレットの表示側（`?s=<id>`） | **OBS** | 無 | noindex, nofollow | 自分 |
| 38 | `/streams` | 1 | 配信（型ごとの入口と最近の配信） | 初見・常連 | 在 | — | 自分 |
| 39 | `/streams/[slug]` | 5 | 配信の型（cooking / making / meeting / monthly / walk） | 初見 | 在 | — | 自分 |
| 40 | `/updates` | 1 | 島をなおしたところ | 常連 | 在（**2回**。`sitemap.ts:28` と `:50`） | — | 自分 |
| — | 404（`not-found.tsx`） | 1 | この道の先には、なにも無い | — | 無 | — | 無 |

動く段の内訳: 3 + 6 + 5 + 48 + 9 + 24 + 10 + 6 + 10 + 5 = **126**。
sitemap に無い 7面 = `/design` `/me` `/me/desk` `/me/roulette` `/roulette` `/nordic/photos` `/next/new`（どれも noindex）。

### 1-2. `public/`（Expo の直下。`npm run copy-public` で `dist/` にそのまま入る）— 10 面

`<title>` だけ在って、**`robots`・`canonical`・`og:*` は10枚とも無い**（grep で確認）。sitemap にも無い。`cleanUrls: true` なので `.html` 付きは拡張子なしへ送られる。

| 道 | 何の面か | 誰向け | 島からのリンク |
| --- | --- | --- | --- |
| `/202608_monthly_review` `/202609_monthly_review` `/202610_monthly_review`（0.9〜2.3MB） | 月末の授賞式。`?role=view`／`?role=ctrl` | **OBS**・常連 | `/months` と `/months/<key>` から（`content/months.ts:86,98,110` が **`.html` 付き**で指す） |
| `/202610_monthly_review_v2` | 10月の組み直し | OBS | 未確認 |
| `/202601_donation_ceremony` | 1月の応援ありがとう | OBS（古い） | 無 |
| `/nordic/review`（219KB） | 北欧旅 9日間ふりかえり | 常連・初見 | `/nordic` から `<a>` で（`app/nordic/page.tsx:328`） |
| `/donut-progress` | 達成状況ドーナツ | OBS（古い） | 無 |
| `/nanitabeyo-improvement-theme-survey` | なに食べよのアンケート（**別サービス**） | アプリの利用者 | 無 |
| `/alert/probe` `/alert/perf` | アラートの計測用 | 運営 | 無 |

### 1-3. Expo の rewrite（→ `/expo-app.html`）— 4 面

| 道 | 何の面か | 誰向け | 備考 |
| --- | --- | --- | --- |
| `/alertbox`（`?k=<id>`） | 投げ銭アラート | **OBS** | 本番 200・22,217B・`<title>` 空・robots 指定なし |
| `/ve-comment` `/ve-postit` | コメント／付箋を絵にする道具 | 運営 | いまも使っているかは未確認 |
| `/daily_user_stats` | なに食べよの日次統計 | 別サービス | `app/daily_user_stats/` に route のファイルが無い（部品だけ）。**面として生きているかは未確認** |

### 1-4. Hosting の 301（`firebase.json:9-95`）

| 元 | 先 | 行数 |
| --- | --- | ---: |
| `/island/albania`（＋`/**`）・`/island/north-macedonia`（＋`/**`） | **`/`** | 4 |
| `/nordic/day/10`〜`/nordic/day/16` | `/nordic#day-N` | 7 |
| `/nordic_review.html` `/nordic_review` | `/nordic/review` | 2 |
| `/nordic/photos`（＋`/**`） | `/cards` | 2 |
| `/next/new`（＋`/**`） | `/board` | 2 |

---

## 2. 「場所」の持ちかたの実態

### 2-1. データ上の定義

| 単位 | どこに・どう定義 | 数 | 面 |
| --- | --- | --- | --- |
| **章（島）** | `content/chapters.ts:67` の `CHAPTERS`。`slug` `name` `from` `to` `countries[]`（＋`branchOf` `opensAt` `plannedDays`）。**いまいる章は日付で決まる**（`chapterNow`、:307） | 6 = 本線5（europe・middle-east・caucasus・nordic・balkans）＋枝1（iran-walk） | `/island/<章>` 6・`/island/<章>/streams` 5 |
| **国（歩き終わった）** | `content/countries.ts:19` の `COUNTRIES`。`slug` `name` `en` `flag` `region`（3種）`order` `stays[{from,to,cities[]}]` `summary` `highlights[]` | 24 行 = 23 か国 ＋ `iran-border`（国ではない。:635） | `/map/<slug>` 24 |
| **国（歩いている最中）** | `countries.ts:603` の `AHEAD_COUNTRIES`。**`slug` `name` `entered` だけ**（街・滞在・見どころは「歩き終わってから書く」決まり。:582-601） | 2（albania・north-macedonia） | **`/map/<slug>` は無い。** `/map` の年表に行が出るだけで、行き先は無し（`walked.ts:149` は `/map` を返す／`map/page.tsx:160` は旅の面が無ければ空） |
| **国（配信が始まる前）** | `countries.ts:538` の `BEFORE_STREAM`（uk・spain・italy・france） | 4行。spain・italy はここにしか居ない | 面なし（`/map` の中の1段） |
| **国（行く前の案内）** | 北欧: `content/nordic/index.json` の `countries`（＋国ごとの JSON 6本）。バルカン: `content/bulgaria.ts`・`content/northMacedonia.ts`（どちらも `python/data/**` から焼く） | 北欧 6・ブルガリア 1・北マケドニア 1 | `/nordic/<slug>` 6・`/bulgaria`・`/north-macedonia` |
| **街** | **文字列だけ。** `stays[].cities`（57 個）／`cityStreams.ts` の `CITY_STREAMS[国][街]`（58 鍵・375 本。うち2鍵は街ではなく国名＝albania・north-macedonia）／北欧の案内 `index.json` の `cities`（55 行。「全国」などを含む）／`VISIT_CITIES`（旅程から導出） | 57 | **街の面は無い。街の slug も無い**（下の 2-2） |
| **日** | 北欧だけ。`content/nordic.ts:728` の `DAYS`（17 行）、面を持つのは `DAY_PAGES`（:1255）。slug は `depart` と数字 | 10 面 | `/nordic/day/<n>`。10〜16日目は畳んで 301 |
| **月** | `content/months.ts` の `MONTHS`（`key` = `YYYY-MM`） | 10 | `/months/<key>` |
| **配信1本** | 面なし。カードは全部 `youtube.com/watch?v=` へ直に出る（`components/ui/Bits.tsx:32`） | 842 本 | 0 |

国→章の結びつきは `CHAPTERS[].countries`（歩き終わった国）と、`AHEAD_COUNTRIES.entered` の日付（歩いている最中。`walked.ts:137-152`）の2本立て。**バルカンは `countries: []` のまま**（`chapters.ts:190`）。

### 2-2. 街という単位の面は在るか — **無い**

- `/map/<国>` の中で街は `<details class="city">`（`map/[slug]/page.tsx:251`）。**`id` が無いので錨でも指せない**
- `/nordic/<国>` には錨が在る: `id={"city-" + encodeURIComponent(街)}`（`nordic/[country]/page.tsx:217, 338`）。URL にすると `#city-%E3%83%AF…`（日本語の percent-encode）
- `/bulgaria` は題が「ブルガリア・ソフィア — 歩きかた」で、中身は首都ソフィア1街。**実質は街の面だが、道の名前は国**（`bulgaria/page.tsx:93-98`）
- 街ごとの配信（`CITY_STREAMS`）は「代表」で、国の本数とは別物（`countryStats.ts` の注。ジョージアは街の表 51本／実数 394本）

### 2-3. 同じ国が、複数の系統の道に出ているもの

| 国 | 歩いた記録 `/map/<slug>` | 行く前の案内 | 章の島 | ほか | 相互リンク |
| --- | --- | --- | --- | --- | --- |
| ポーランド・リトアニア・ラトビア・エストニア・フィンランド・スウェーデン（6） | **在** | **`/nordic/<slug>` 在** | `/island/nordic` | `/nordic/day/<n>`・`/legends/nordic`・`/nordic/review`・`/months/2026-09` | **`/map/poland` ↔ `/nordic/poland` は互いにリンク 0**（コードと本番の両方で確認。`<h1>` はどちらも「ポーランド」） |
| 北マケドニア | 無 | `/north-macedonia` 在 | `/island/balkans`（いまは `/`） | 付箋の宛先 `north-macedonia`／`/island/north-macedonia` は 301 → `/` | 案内→章・配信のリンク 0 |
| ブルガリア | 無（**国の一覧のどれにも居ない**。`countries.ts` に `bulgaria` の字が 0件） | `/bulgaria` 在 | `/island/balkans` | 付箋の宛先 `bulgaria`・`/next#bulgaria` | 同上 |
| アルバニア | 無 | **無** | `/island/balkans` | `/island/albania` は 301 → `/` | — （配信 16本・`countryStats.ts`。**面が1枚も無い**） |
| アルメニア＋イラン国境 | `/map/armenia`・`/map/iran-border` | 無 | `/island/caucasus`・`/island/iran-walk` | `/legends/iran-walk`（`<title>` が `/island/iran-walk` と同じ「イランまで歩く｜あやと島」） | — |
| ジョージア | `/map/georgia` | 無 | `/island/caucasus` | `/legends/kazbegi` `/legends/roulette-georgia` `/legends/iwashi-festival`・`/next#georgia-bye` | — |
| エジプト | `/map/egypt` | 無 | `/island/middle-east` | `/legends/egypt-festival` | — |
| スペイン・イタリア | 無 | 無 | 無 | `/map` の中の1段だけ | — |
| 残り 13 か国 | 在 | 無 | `/island/europe` か `/island/middle-east` か `/island/caucasus` | — | — |

**「北欧の旅」という1つの出来事に、面が 29 枚**（`/nordic` 1・guide 1・国 6・日 10・review 1／`/island/nordic` 1・その配信 1／`/legends/nordic` 1／`/map/<6国>` 6／`/months/2026-09` 1）。canonical はどれも自分。

---

## 3. 時間で意味が変わる道

### 3-1. URL は同じで、中身が入れ替わる

| 道 | 何が入れ替わるか | 仕組み（根拠） |
| --- | --- | --- |
| **`/`** | **降り立つ島が、いまいる章のものに替わる。** caucasus（〜2026-09-11）→ nordic（09-12〜09-27）→ balkans（09-28〜。10-12 の統合までは `albania`／`north-macedonia` という slug の章だった）。`<title>`・description は章を名乗らない固定の字 | 焼くのは `NOW_CHAPTER = chapterNow(BUILT_AT)`（`chapters.ts:342`）、画面が出てから `Cover.tsx` が今日の章に入れ替え |
| `/` の「いま」の板 | 案内の行き先が **2026-11-12〜11-19 は `/bulgaria`、それ以外は `/north-macedonia`**。過ぎるとひとりでに戻る | `components/isle/spec.ts:461-482` の `GUIDES`・`app/page.tsx:254` |
| `/` の旅の札 | 北欧の旅のあいだだけ出る | `app/page.tsx:200` `TripToday` |
| `/now` | いまいる場所・国・ひとこと。**焼いた HTML は「世界のどこか」**（中身は API） | `content/site.ts:135-152` |
| `/next` | 「これから」と「もう行ってきた」の振り分け。企画は `/next#<id>` の錨 | `content/plans.ts:597-` `planPhase` |
| `/map` | 歩いている最中の国の行が日付で増える | `map/page.tsx:139-164` |
| `/all` | いまいる章の行だけ、行き先が `/` に化ける | `components/chain/AllIsleRow.tsx` |
| `/atlas` | まん中に出る島＝いまの島 | `components/chain/Isles.tsx` |
| `/nordic`・`/nordic/<国>`・`/nordic/guide` | **行く前の計画 → 旅の最中（いまここ）→ 終わった旅**。道は同じ | `content/trip.ts`・`components/nordic/TripNow.tsx` |
| `/bulgaria`・`/north-macedonia` | 行く前に調べた案内。付箋の宛先は国を出ると締め切り（`closed: true`） | `content/themes.ts:141-200` |
| 全面の足もと | 旅のあいだだけ `/nordic` への口が先頭に出る | `components/ui/TripDoor.tsx:22-35` |

### 3-2. 別の URL へ引っ越す／生える／消える

| # | 何が起きるか | 根拠 |
| --- | --- | --- |
| 1 | **`/island/<章>` ⇄ `/`。** いまいる章の島は canonical も `og:url` も内部リンクも `/`。章が終わった次のビルドから `/island/<章>` が自分を名乗る。コーカサスは 2026-09-11 まで `/`、いまは `/island/caucasus`。**バルカンはいま `/`、次の章が始まれば `/island/balkans`**。sitemap は6つとも載せ続けている | `chapters.ts:379` `chapterHref`／`island/[chapter]/page.tsx:52-60`／`sitemap.ts:76`／本番 `/island/balkans` の canonical = 原点 |
| 2 | **`/island/<章>/streams` は、章が終わってから生える。** いまいる章の配信は `/streams`（全部）にしか無い | `content/chapterStreams.ts:1-8`（鍵は過去の5章だけ） |
| 3 | **国は「行く前の案内」と「歩いた記録」で別の道に建つ。** 北欧6か国は旅のあいだ `/nordic/<国>` だけ → 2026-09-22 に `/map/<国>` が建った（古いほうも残る＝**引っ越しではなく、2枚に割れる**）。ブルガリア・北マケドニア・アルバニアも、歩き終わったら `/map/<slug>` を建てる前提 | `countries.ts:582-601`・`directory.ts:243`（「歩いて国の面（`/map/<国>`）ができたら、そちらもここへ並べる」） |
| 4 | `/island/albania`・`/island/north-macedonia` は章として在った → 2026-10-12 に `balkans` へ統合 → **301 で `/`** へ。理由は「国が増えるたびに島を建てていた」の取り消し | `docs/island-misses.md` #224／`firebase.json:10-29` |
| 5 | `/nordic/day/10`〜`16` は在った → 畳んで 301（`/nordic#day-N`） | `nordic.ts:1240-1257`／`firebase.json:30-64` |
| 6 | `/nordic/photos` → `/cards`（2026-09-10）、`/next/new` → `/board`（2026-10-01）、`/nordic_review(.html)` → `/nordic/review` | `directory.ts:76-77`・`next/new/page.tsx:17-43`・`firebase.json:65-94` |
| 7 | 企画は `/next#<id>` に居て、終わって語り継がれると `/legends/<slug>` に別の面が建つ（北欧: `/next#nordic` → `/nordic` → `/legends/nordic`） | `plans.ts:303-332`・`legends.ts:251` |
| 8 | 月末配信は毎月 `public/2026MM_monthly_review.html` が1枚増える（＋ `_v2`）。読む面は `/months/<YYYY-MM>` | `.claude/skills/monthly-review`・`months/[key]/page.tsx:33-40` |

**#4 の 301 は、いまは合っているが、次の章が始まった日から行き先が変わる**（`/` が別の島になる。`firebase.json` は日付を知らない）。

---

## 4. 動かせない道

### 4-1. OBS のブラウザソース・配信の道具

| 道 | 貼ってある先 | 根拠 |
| --- | --- | --- |
| `/alertbox?k=<id>` | OBS。**作り直すと、いま貼ってある URL が止まる** | `components/me/AlertBoxBox.tsx:135, 236`。`alert_watch.yml:161` も本番のここを開く |
| `/roulette?s=<id>` | スマホ版 OBS。「いちど貼れば、変わらない」 | `components/me/RouletteBox.tsx:115, 418, 539` |
| `/2026MM_monthly_review.html?role=view\|ctrl` | 月末配信の OBS と進行用スマホ | `public/202610_monthly_review.html:2517-2518`・`.claude/skills/monthly-review/SKILL.md:301` |
| `/alert/probe` `/alert/perf` | 計測のとき、ウィジェットの URL を一時的に向ける | `.claude/skills/alert-season/SKILL.md:73` |
| `/donut-progress` `/202601_donation_ceremony` `/ve-comment` `/ve-postit` | 古い道具。**いまも貼ってあるかは未確認** | `docs/nordic-fund.md:625`・`docs/island-character.md:40` |

### 4-2. ログイン・審査

- **Firebase Auth**: `authDomain: "live-streaming-d3cac.firebaseapp.com"`（`site/lib/firebase.ts:25`）、`signInWithPopup`（`site/lib/auth.tsx:404`）。戻り先は firebaseapp.com 側の予約パスで、**島の道には依存しない**。ドメインを替えるなら Auth の「承認済みドメイン」（コンソール。未確認）
- **Google OAuth 審査**: ホームページ URL ＝ `/`（所有権確認の meta が `layout.tsx:66-68`）、プライバシーポリシー URL ＝ `/privacy`（`privacy/page.tsx:15-21`・`sitemap.ts:51-52`）。**`/` と `/privacy` は動かせない**
- **Search Console**: 同じ meta で確認済み（登録が URL プレフィックスかドメインかは未確認）

### 4-3. Functions

- `/island-api/**` → `islandApi`（`firebase.json:97-100`）。画面は `API_BASE = "/island-api"`（`site/lib/api.ts:8`）の相対パス。**CORS の許可元の表は無い**（同じ原点で叩く前提）
- `/nanitabeyo-weekly-report-proxy`（＋`/**`）— 別サービス（なに食べよ）が叩く
- API の中の道（`/island-api/nordic/photos` `/island-api/cards` など）は**面の道とは別物**。面を動かしても変えなくてよい

### 4-4. 本番 URL を叩いているもの（Actions・python・道具）

| 叩く先 | どこが | 数 |
| --- | --- | --- |
| `/island-api/*`（`characters` `cards` `state` `fund` `me` `stampline/mine` …） | `python/` 11本・`.claude/skills/suzuri/characters.py`・`tools/build_deck_photos.py`・`heavy_watch.yml:224`・`stickies_pull.yml` | 道は API なので、面を動かしても無傷 |
| 面の道を名指し | `tools/sprites/notfound.mjs:97-129`（`/me` `/me/desk` `/me/roulette` `/roulette` `/design`／`/alertbox` `/daily_user_stats` `/ve-comment` `/ve-postit` `/sitemap.xml` `/robots.txt`／`/nordic/photos`／無い道 14本） | 配るたびに走る（`firebase-hosting-deploy-prod.yml:95, 178`） |
| sitemap.xml と `/all` を読んで一周 | `tools/sprites/prodsweep.mjs`（`:150` に原点）。**道が変わっても自分で追う**が、「sitemap に無くてよい面」の宣言（`ABSENCES`）を持つ | 同 `:218` |
| 見張りが道を字で持っている | `tools/sprites`＋`site/selftest`＋`python`＋workflows で、`/nordic…` 86 ファイル・`/island/…` 52・`/map/…` 15・`/bulgaria` 6・`/north-macedonia` 4 | **壊れるのではなく、道を動かした日に赤くなって直す対象** |
| 本番の原点を `.firebaserc` から読む | `python/ship.py:575-586` | ドメインを替えても追う |

### 4-5. `live-streaming-d3cac` のハードコード

`grep -rI "live-streaming-d3cac"`（node_modules・.git・.next*・dist・out 抜き）: **153 ファイル・877 か所**。
内訳（か所）: `.firebasestorage.app` 577／**`.web.app` 145**／素のプロジェクト ID 79／BigQuery の `.youtube` `.island` 37／バケット名 14／`.firebaseapp.com` 5／プレビュー用チャンネル（`--sp-…web.app`）約10 ほか。
ディレクトリ別（ファイル）: tools 56・python 45・docs 10・.claude 10・public 8・shorts 7・.github 7・functions 5・site 4・`.firebaserc` 1。

**`.web.app`（本番の原点）を持つのは 72 ファイル・145 か所。**

- **site（2）**: `site/content/site.ts:9`（`SITE.url`。sitemap・robots が読む）／`site/app/layout.tsx:40`（`metadataBase`。canonical・`og:url` の頭）— **島の側はこの2か所だけ**
- **.github/workflows（3）**: `alert_watch.yml` `heavy_watch.yml` `stickies_pull.yml`
- **python（11）**: `admin/_owner.py` `admin/fund_check.py` `admin/fund_diff.py` `admin/fund_migrate.py` `build_review_page.py` `build_site_stats.py` `card_gap_watch.py` `public_ids_selftest.py` `suzuri_api.py` `suzuri_residents.py` `upkeep_watch.py`
- **tools（41）**: `tools/sprites/` 35本（`README.md` `apidown.mjs` `asme.mjs` `cardcal.mjs` `cardgo.mjs` `cardicon.mjs` `cardwall.mjs` `charbox.py` `chars.py` `dexdays.mjs` `dexfit.mjs` `dexspot.mjs` `guest.mjs` `isletalk.mjs` `kdfit.mjs` `navtruth.mjs` `negclaim.mjs` `notfound.mjs` `ogmeta.mjs` `ognight.sh` `pcchars.py` `pickfit.mjs` `pickfold.mjs` `prod.mjs` `prodcurl_selftest.mjs` `prodsweep.mjs` `saylong.mjs` `saynote.mjs` `sayseed.mjs` `shot-friends.mjs` `staleboot.mjs` `stateagain.mjs` `tonight.mjs` `wikiphotos.py` `zeroclaim.mjs`）／`tools/nordic/` 3本（`geocode.py` `osmfetch.py` `shops.py`）／`tools/shorts/stickies/` 2本（`README.md` `pull.py`）／`tools/build_deck_photos.py`
- **public（5）**: `202610_monthly_review_v2.html` `alert/perf.html` `nordic/review.html` `review/manifest.js` `review/manifest.json`
- **.claude/skills（6）**: `alert-season` `island-daily` `island-ship` `monthly-review` `nightly-check` の SKILL.md、`suzuri/characters.py`
- **docs（4）**: `island-api.md` `island-concept.md` `island-incident-2026-09-14-cards.md` `island-misses.md`

一覧の全文: `（作業箱の一時置き場）/webapp_files.txt`（72行）／`（作業箱の一時置き場）/hardcode_files.txt`（153行）。

### 4-6. 外に貼ってある URL

- **リポジトリから読めたのはここまで**: OBS の3つ（4-1）、OAuth 審査の `/` と `/privacy`（4-2）、SUZURI への API 呼び出しの User-Agent に入れた原点（`python/suzuri_api.py:72`・`suzuri_residents.py:141`）
- **YouTube の概要欄・SUZURI の商品ページ・LINE スタンプの説明に島の URL を貼ってあるかは、リポジトリに記述が無い（未確認）。** 島から外へ出るリンクは在る（`content/site.ts:67-103` の YouTube・App Store・Google Play・Doneru、`content/goods.ts:689` の SUZURI）
- 視聴者さんが LINE などに貼った URL は数えられない（貼られる前提で `og:*` を面ごとに出している。`lib/share.ts`）

### 4-7. URL ではないが、名前を変えると黙って壊れる鍵

- **章の slug**: `chapterStats.ts`／`chapterStreams.ts` の鍵。変えると、焼き直すまで人数・配信・住人が「0ではなく欄ごと消える」（`docs/island-misses.md` #224 決め2）
- **付箋の宛先 id**（Firestore に入っている）: `bulgaria` `north-macedonia` `albania` `nordic` `poland` … 。「`id` は面の道と同じ字にする」（`content/themes.ts:148, 168`）という決まりで**道の名前と結んである**
- **国の slug**: `countryStats.ts`・`cityStreams.ts`・`recipes.ts` の `country`・国旗の鍵

---

## 5. 内部リンクの形

### 5-1. 頭のバー・足もと・`/all`

| 場所 | 出ている道 | 根拠 |
| --- | --- | --- |
| **頭のバー（900px 以上だけ）** | `/`（島へ戻る）＋札6つ: `/next`（企画）`/about`（あやとのこと）`/streams`（配信）`/apps`（アプリ）`/map`（歩いた国）`/board`（やってほしいこと） | `components/island/layout.ts:96-288` の `sign: true` |
| **頭のバー（狭い画面）** | `/` と「いま：<面の名前>」だけ。**行き先は 0** | `components/ui/PageShell.tsx:15-96` |
| **足もと（全面）** | `/`・軒 11: `/legends` `/next` `/now` `/about` `/streams` `/goods` `/apps` `/kitchen` `/friends` `/map` `/board`・`/all`・`/privacy`（＋旅のあいだだけ `/nordic`） | `components/ui/PlaceList.tsx`・`PageShell.tsx:179-201` |
| **`/all`** | 13 棚・149 行（一意な行き先 148。コードから数えた。`directory.ts:368` の `DEST_COUNT`）。国 24・料理 48・月 11・北欧 18・章 12 …。**`/design`（noindex）も並ぶ。`/all` 自身と `/privacy` は無い** | `content/directory.ts:60-345` |

頭にも足もとにも**出ていない**道: `/atlas` `/cards` `/months` `/updates` `/nordic` `/bulgaria` `/north-macedonia` と、動く段ぜんぶ。**国の面（`/map/<国>`）へは、どの面からも最短2回**（`/map` か `/all` を通る）。

### 5-2. 検索から `/bulgaria` に直接着いた初見の人の出口（本番の HTML を数えた）

| 行き先 | 在るか | 中身 |
| --- | --- | --- |
| **配信（YouTube）へ** | **無い。`youtube.com`／`youtu.be` へのリンク 0本** | 出口は足もとの `/streams`（配信ぜんぶ）だけ。「この国からの配信」へは行けない |
| **ほかの国へ** | **無い** | `/north-macedonia`・`/map/*` へのリンク 0。足もとの `/map`（歩いた国）だけ |
| 島の表紙へ | 在る（4本） | 頭の「あやと島」・パンくずの「島」・面の終わりの「島へ戻る」・足もと |
| 親の面へ | 在る | パンくず「島 › **企画**（`/next`）› ブルガリア・ソフィア」（`bulgaria/page.tsx:329`） |
| その国の章の島へ | 無い | `/island/balkans`（＝いまは `/`）への名指しは無い |

同じ数えかたで: `/nordic/poland` は YouTube 0本・`/map/poland` へ 0本（となりの北欧の国へは在る）。`/map/poland` は YouTube 5本（一意）・となりの国 2本・`/nordic/poland` へ 0本。`/north-macedonia` はコード上 YouTube 0（`content/northMacedonia.ts` に `youtu` の字が 0件）。

`/bulgaria` への入口は: 表紙の「いま」の板（**11-12〜11-19 だけ**。過ぎると `/north-macedonia` に戻る）・島の札（焼いた日の国）・`/next#bulgaria`・`/all`・`/board` の宛先。

### 5-3. パンくず

**見た目のパンくずは在る**（`PageShell.tsx` の `Crumbs`。先頭はいつも「島」＝`/`）。**構造化データ（`BreadcrumbList`）は無い**——`site/` 全体で `ld+json`・`schema.org` の字が 0件、本番5面でも 0。

パンくずと URL の階層が**そろっていない**面:

| 面 | URL | パンくず |
| --- | --- | --- |
| 国の案内 | `/bulgaria`・`/north-macedonia` | 島 › 企画（`/next`）› 国 |
| 北欧 | `/nordic`・`/nordic/poland`・`/nordic/day/3` | 島 › 企画（`/next`）› 北欧ヒッチハイク › … |
| 月 | `/months/2026-10` | 島 › ふりかえり › 10月（軒としては「配信」の下。`layout.ts` の `under: ["/months"]`） |
| 章 | `/island/europe/streams` | 島 › 島の地図（`/atlas`）› ヨーロッパ周遊 › 配信 |

道の名前と札の字が違うもの: `/next`＝企画／`/board`＝やってほしいこと／`/map`＝歩いた国／`/atlas`＝島の地図／`/about`＝あやとのこと（軒の id は `friends`）／`/friends`＝住んでる人（id は `fellows`）／`/kitchen`＝作った料理（`<title>` は「クッキング・スタンプ帳」）／`/all`＝島のなか ぜんぶ。

---

## 6. 観察（設計の入力）— 大事な順に 15

1. **同じ国が「行く前の案内」と「歩いた記録」で別の道に建ち、互いにリンクが無い。** 北欧6か国は `/nordic/<国>` と `/map/<国>` の2枚ずつ（`<h1>` はどちらも国名だけ）。ブルガリア・北マケドニアも、歩き終わると `/map/<slug>` が別に建つ前提（`countries.ts:582-601`・`directory.ts:243`）。検索に載った `/bulgaria` と、あとから建つ `/map/bulgaria` で評価が割れる形が、もう決まりとして入っている
2. **いま居る国ほど、実体験の面が無い。** `/map/<国>` は「歩き終わってから」しか建たない。アルバニアは配信 16本で面が 0、北マケドニアは 36本あるのに `/north-macedonia` には配信が1本も並ばない。ブルガリアは国の一覧に未登録で、11-12 からの配信が北マケドニアの下に数えられている（`cityStreams.ts:2042-2051`・`countries.ts:603-624`）。**検索の需要が立つ滞在中に、「行ってみた」が載った国の面が存在しない**
3. **案内の面から配信（YouTube）への道が 0本。** `/bulgaria`・`/nordic/poland` の本番 HTML に YouTube へのリンク 0。ゴールは配信へ繋ぐことなのに、検索の入口になる面が出口を持っていない（5-2）
4. **配信1本ぶんの面が無い。** 842 本ぶん、島のカードは全部 `youtube.com` へ直に出る（`Bits.tsx:32`）。「その配信で何があったか」の本文は `streams/` に議事録 721 本（約4,000字ずつ）在るが、島には1枚も出ていない。AI が引用できる文章が、サイトの外（リポジトリ）にだけ在る。※議事録には視聴者さんの名前が入っているので、そのままは出せない
5. **表紙 `/` の中身が章ごとに入れ替わり、`/island/<いまの章>` の canonical が `/` を指す。** 章が替わると正の URL が `/` → `/island/<章>` へ引っ越す（`chapters.ts:379`・`island/[chapter]/page.tsx:59`）。しかも sitemap はその面を載せ続けている（`sitemap.ts:76`。本番 `/island/balkans` の canonical ＝ 原点）
6. **`/` に canonical が無い。** `app/page.tsx` は `share()` を通していない。同じ中身が `live-streaming-d3cac.firebaseapp.com` でも 200 で返る（`/bulgaria` で 1,852,399B が一致）。ほかの面は canonical が web.app を指すので寄るが、**表紙だけ寄せ先が無い**
7. **街という単位が、道にも錨にも無い。** 57 街・面 0・slug 0。`/map/<国>` の街は `id` の無い `<details>`（`map/[slug]/page.tsx:251`）。`/bulgaria` は実質ソフィアの面なのに道は国名で、同じ国の2つ目の街を置く場所が無い（`bulgaria/page.tsx:93-98`）
8. **構造化データが 0。** `ld+json` が `site/` に 0件・本番5面で 0。パンくず・記事・動画・場所のどれも機械に渡していない
9. **1つの出来事が3〜4系統に散っていて、正の面が決まっていない。** 北欧の旅は 29 面（2-3）。「イランまで歩く」は `/island/iran-walk` と `/legends/iran-walk` で **`<title>` が同じ**（`chapters.ts:96`・`legends.ts:73`）、さらに `/map/iran-border`
10. **`<title>` と `<h1>` が、探す言葉を持っていない。** `/map/<国>` は国名だけ（「ポーランド｜あやと島」。`map/[slug]/page.tsx:29`）、`/kitchen/<品>` は料理名だけ（`kitchen/[slug]/page.tsx:27`）。表紙の `<h1>` は読み上げ用の「あやと島」1語（`app/page.tsx:151`）。国の英語名（`en`）は `/all` のしぼり込みにしか使っていない（`directory.ts:143`）
11. **URL の階層が、中身の親子と合っていない。** 国の案内が直下（`/bulgaria` `/north-macedonia`）と `/nordic/<国>` と `/map/<国>` の3通り。パンくずは「企画」の下（5-3）。道の名前（`/next` `/map` `/atlas` `/friends`）が中身の呼び名と違う
12. **sitemap の `lastmod` が 150 行ぜんぶ同じビルド時刻**（`sitemap.ts:15, 60`。本番で 150/150 が `2026-11-13T13:43:09Z`）。毎晩の配りで全部が「今日変わった」になる。ほかに `/updates` の重複、`public/` の 10 枚は不掲載
13. **301 の行き先が、時間で嘘になる。** `/island/albania`・`/island/north-macedonia` → `/`（`firebase.json:10-29`）は、次の章が始まった日から別の島へ飛ぶ。`/nordic/day/10`〜`16` → `/nordic#day-N` は、検索から見れば7本とも `/nordic` 1枚に潰れる
14. **`public/` と Expo の面が、止める指定なしで開いている。** 月末授賞式 5枚（0.9〜2.3MB・`<title>` だけ）は `/months/<key>` と同じ月を別の道で持ち、道の形も違う（`/202610_monthly_review`＝数字始まり・アンダースコア）。`/alertbox`（`<title>` 空）・`/alert/probe`・`/donut-progress`・別サービスのアンケートも `robots.txt` の `Allow: /` の下
15. **ドメインがプロジェクト ID（`live-streaming-d3cac.web.app`）。** 島の側のハードコードは2か所だけ（`site.ts:9`・`layout.tsx:40`）で、替える手間は小さい。替えるときに動くのは 4-2（OAuth 審査・Auth の承認済みドメイン・Search Console）と 4-5 の 72 ファイル（大半は `/island-api` を叩く道具）

---

## 付録. 本番で見た5面（2026-11-13）

| 道 | HTML | `<title>` | canonical | YouTube へ | `<h1>` |
| --- | ---: | --- | --- | ---: | --- |
| `/` | 313,305B | あやと島 — あやとと愉快な仲間達 | **無し** | 3（一意） | あやと島（sr-only） |
| `/island/balkans` | 164,897B | バルカン諸国周遊｜あやと島 | **原点（`/`）** | 8 | 島の看板 |
| `/bulgaria` | 1,852,399B | ブルガリア・ソフィア — 歩きかた｜あやと島 | 自分 | **0** | ブルガリア・ソフィア |
| `/map/poland` | 174,800B | ポーランド｜あやと島 | 自分 | 5 | ポーランド |
| `/nordic/poland` | 805,874B | ポーランド — 北欧ヒッチハイク｜あやと島 | 自分 | **0** | ポーランド |

5面とも `<html lang="ja">`・`<h1>` はちょうど1つ・`ld+json` は 0。
