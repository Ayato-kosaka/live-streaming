# SEO と AI 検索対策の調査（2026-11-13 時点）

対象: 日本語・個人の配信者の「行った国・街のガイドブック兼ブログ」。Next.js 静的書き出し＋Firebase Hosting。
調べたのはウェブの一次情報が主。リポジトリは読んだだけ。

**確度の印**
- 【公式】一次文書を今日ひらいて読んだ（Google Search Central / OpenAI / Anthropic / Perplexity / Apple / Bing / Firebase）
- 【公式・二次】公式の発表だが、本文は開けず報道で確認した
- 【実測】公開された測定・研究、または今日この箱から自分で測ったもの
- 【通説】業界でよく言われるが、公式にも実測にも裏づけを見つけられなかった
- 【推論】上の材料からのこちらの読み

---

## 0. 先に結論（1画面ぶん）

1. **Google は「AI 向けの特別な最適化は要らない」と明言している。** 2026-05-15 に出た公式ガイドは、llms.txt・チャンキング・AI 向けの書き直し・自作自演の言及・特別な構造化データを**名指しで「不要」**とした。効くのは「ほかに無い、本人の経験にもとづく中身」と、索引されること。
2. **文字起こしから AI で記事を作ること自体は違反ではない。違反は「利用者の役に立たないページを大量に作ること」。** 危ないのは作り方ではなく、**枚数・型の同じさ・中身の薄さ・事実の未確認**。1配信＝1ページを 750 枚いっせいに出す形がいちばん近い。
3. **日本語のニッチな行き先（バルカン・コーカサス）は、個人が取れる。** 今日 20 語を実際に引いた。「物価」「治安」「行き方」「費用」は上位 8〜9 件のうち 4〜7 件が個人ブログと note / はてな / アメブロ。「〇〇 観光 おすすめ」「〇〇 旅行 2026」は大手と OTA が 6〜9 件。**上位の個人ページを 2 つ読んだら、どちらも出どころリンクが無く、片方は 2019 年公開・2023 年更新、もう片方は運賃も訪問日も書いていなかった。** ここが入り口。
4. **AI のクローラは JavaScript を実行しない**（Google と Apple 以外）。静的書き出しなので有利。本文が素の HTML に在ることだけ確かめればよい。
5. **いまのサイトで今日から直せる穴**: `sitemap.ts` が全ページの `lastModified` を「ビルドした今」で出している（Google は「一貫して正確なときだけ使う」）／JSON-LD が無い／`*.web.app` のまま（独自ドメインでないと Search Console のドメインプロパティが作れず、Google の担当者も無料サブドメインは不利と言っている）／Bing に未登録（Copilot と、一部は ChatGPT の入口）。

リポジトリで確かめたこと（読んだだけ）:
- `site/app/robots.ts` は `User-agent: *` に `allow: /`。AI のボットも全部通る状態
- `site/app/sitemap.ts` は全 URL に `lastModified: now` と `priority`。`priority` は Google が無視する
- `application/ld+json` は `site/` に 0 件。`hreflang` も 0 件。canonical と og は `site/lib/share.ts` が出している
- `firebase.json` は `cleanUrls: true` / `trailingSlash: false`。HTML は `Cache-Control: no-cache`、画像等は 1 時間、`/_next/static` は 1 年
- `/bulgaria` `/north-macedonia` `/map/[slug]` は `"use client"` を持たない（サーバ側で HTML に出る見込み。**本番の HTML を curl して本文の字が在るかは未確認**）
- 配信 1 本ごとの面は無い（`/streams/[slug]` は種類ごと）

---

## 1. Google の現在地

### 分かったこと

**(a) AI Overviews / AI Mode に出るための公式の言い分**
- 「AI Overviews や AI Mode に出るための追加の要件も、特別な最適化も無い」「新しい機械可読ファイル・AI 用テキストファイル・マークアップを作る必要は無い」「特別な schema.org の構造化データも要らない」。条件は**索引されていて、スニペットつきで出せること**だけ。【公式】 https://developers.google.com/search/docs/appearance/ai-features
- 2026-05-15 に新しい手引き「Optimizing your website for generative AI features on Google Search」が出た。【公式】 https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
  - やること: 「自分の知っていることから自分で作る」「常識や平凡を超える、専門家や経験者ならではの見方（non-commodity）」。既存の内容の要約は「ほかに在るものの言い直し」
  - **やらなくてよいこと（名指し）**: llms.txt / AI 用ファイル / Markdown（「Google 検索はこれらを無視する」）、チャンキング（「細切れにする必要は無い」）、AI 向けの書き直し（「同義語や意味は分かる」）、自作自演の言及（「思うほど役に立たない」）、構造化データ（「生成 AI 検索に必須ではない」。リッチリザルト用には引き続き推奨）
  - **クエリ・ファンアウト**（AI が 1 つの問いを複数の関連検索に割る）を認めたうえで、「ファンアウトや言い換えごとに別ページを作るのは、順位や AI の回答を操作する目的なら**大量生成コンテンツのスパム方針に反する**」と明記
  - 2026-06-15 に「Google 検索は llms.txt を使わない」の注記が足された。【公式】 https://developers.google.com/search/updates
- 計測: Search Console に「検索の生成 AI のパフォーマンス」レポートが入った（2026-06-03 発表、2026-08-31 に全サイトへ）。**表示回数だけ**（ページ・国・デバイス・日付別）。クリックは従来の「ウェブ」に混ざる。【公式】 https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
- サイト側の出口: Search Console にプロパティ単位の「検索の生成 AI」の出す／出さないの切り替えが入った（既定は出す。出さないにしても通常の順位には影響しないと Google は言う）。【公式・二次】 https://9to5google.com/2026/06/02/google-ai-mode-overviews-opt-out/
- `Google-Extended` は Gemini の訓練とグラウンディング用の札で、「Google 検索への掲載にも順位にも影響しない」。**AI Overviews を止める札ではない。**【公式】 https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers
- AI モードの日本語提供は 2025-09-09 から。【公式・二次】 https://webtan.impress.co.jp/n/2025/09/09/50037

**(b) 役に立つコンテンツ / E-E-A-T（とくに Experience）**
- 「E-E-A-T のうち信頼がいちばん大事」「経験が示されていることで役に立つ内容もある」。自己点検の問いに「一次の専門性と知識の深さがはっきり出ているか」「独自の情報・報告・調査・分析があるか」「ほかの人の言っていることを、価値を足さずにまとめているだけではないか」。【公式】 https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- **Who / How / Why**: 「誰が書いたかが見て分かるか」「署名を付け、著者の情報へ繋ぐことを強く勧める」「**自動化（AI 生成を含む）を使ったことが、開示などで読む人に分かるか**。『どう作ったのか』と思われそうな内容には開示が役に立つ」。AI の顔写真・偽名・偽の経歴で著者を作るのは不可。【公式】同上

**(c) 生成 AI で作った内容についての Google の手引き**（2026-10-01 に品質評価ガイドラインへの参照を追加）
- 「生成 AI は、調べものと、**元のコンテンツに構造を足すこと**にとくに役立つ」
- 「利用者に価値を足さずに多数のページを生成すると、大量生成コンテンツのスパム方針に反しうる」
- 「**AI が生成した内容はすべて、公開前に人の手で事実確認し見直すことが決定的に大事**」。title・meta description・構造化データ・alt も同じ
- 「どう作ったかを、読む人に合った形で伝えることを検討する」
- 品質評価ガイドラインの 4.6.5（大量生成）と 4.6.6（手間・独自性・付加価値のほぼ無い本文）を参照。ただし「評価者の評価は順位に直接は効かない」
- 【公式】 https://developers.google.com/search/docs/fundamentals/using-gen-ai-content

**(d) スパム方針（一次文書の文言）**
- **大量生成コンテンツの不正使用**: 「利用者の役に立つためではなく、検索順位を操作することを主な目的に、多数のページを生成すること」「**どう作られたかを問わず**、価値のほぼ無い独自性の乏しい内容を大量に作ること」。例: 「生成 AI などで、価値を足さずに多数のページを作る」「フィードや検索結果などを掻き集めて（**同義語化・翻訳などの自動変換を含む**）多数のページを作る」「別のページの内容を、価値を足さずに繋ぎ合わせる」「規模を隠すために複数サイトを作る」「読んでも意味が通らないが検索語を含むページを多数作る」。【公式】 https://developers.google.com/search/docs/essentials/spam-policies
- **スクレイピング**: 「他サイトの内容を、独自の内容も価値も足さず、出どころも示さずに載せ直す」「少し変えて（同義語の置き換えや自動の手法で）載せ直す」「他サイトの動画などを埋め込む・集めるだけのサイトを、実質的な価値を足さずに作る」。【公式】同上
- **サイトの評判に関する方針**（旧「サイトの評判の不正使用」）: 第三者のコンテンツを、そのホストの既存の評価を借りるために載せること。**自分のサイトに自分の内容を載せるこのサイトには当たらない。**第三者の記事を載せ始めたら関係する。【公式】同上
- スパム方針は生成 AI の回答（AI Overviews / AI Mode）にも当てはまると 2026-05-15 に明記。【公式】 https://developers.google.com/search/updates
- 品質評価ガイドライン（2025-01 改訂）: 本文のほとんどが「コピー・言い換え・埋め込み・自動生成や AI 生成・転載で、手間も独自性も付加価値もほぼ無い」なら最低評価。言い換えの見分けの手がかりに「広く知られた事実しか無い」「Wikipedia などと重なりが大きい」「1 つのページの要約でしかない」。【公式・二次。PDF 本文は未確認】 https://ppc.land/google-updates-quality-rater-guidelines-with-ai-content-evaluation-criteria/

**(e) 実際に落ちたサイトの形（2026-08 のスパムアップデート、Glenn Gabe の事例 4 つ）**
- 国ごとに大量生成したページに AI の文章を差し込んだサイト（20 万クエリ超で順位を失う）
- Amazon のデータから自動でカテゴリと商品ページを作り、下に長い AI の文章を足したサイト
- **索引 150 万 URL のうち 85% がプログラム生成。まともな UGC の区画もあったが、落ちたのはサイト全体**
- 25 万 URL で、検索した内容に答えないページ
- 共通点: ほかに在る情報の繰り返し／型だけ／人の関わりが最小／規模。筆者の物差しは「誰でも同じやり方で作れるなら、価値は低い」
- 【実測（事例研究）】 https://gsqi.com/marketing-blog/august-2026-google-spam-update-case-studies/

**(f) 2025〜2026 のアップデートと、個人の旅行ブログ**
- 確認できた順: 2025-03 コア、2025-12 コア（2025-06 のコアと 2025-08 のスパムはこちらの記憶で、今日は裏づけを開いていない）、2026-02 Discover コア、2026-03-24 スパム、**2026-03-27〜04-08 コア**、**2026-05-21〜06-02 コア**、2026-06-24 スパム、2026-08-18〜21 スパム、2026-09 スパム。【公式・二次】 https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history ／ https://searchengineland.com/google-march-2026-core-update-rolling-out-now-472759 ／ https://www.searchenginejournal.com/google-begins-rolling-out-may-2026-core-update/575589/
- 2026-03 のコア: 集約サイト・UGC プラットフォーム・OTA（TripAdvisor / Yelp / Expedia）が下がり、一次の出どころやブランドへ寄った、という測定がある。【実測・二次（Amsive）】 https://www.techwyse.com/news/industry-news/google-march-2026-core-update-aggregators-ugc-visibility-loss
- 旅行ブログ 200 を追った測定は 2025-03 のものだけ見つかった: 全体で −3%、約 4 割は影響なしか増加。伸びた側の共通点は「**YouTube の区画を持ち、記事に動画を埋めている**」「月 4〜5 本の継続更新」「話題ごとに複数記事（トピックの束）」「サイト外での存在」。【実測。出したのはレンタカー会社で、標本も定性の見立ても限定的と自認】 https://www.discovercars.com/blog/march-25-google-update
- AI Overviews が出る語では 1 位のクリック率が約 58% 下がる（Ahrefs、30 万語、2025-12 までのデータ）。Seer は −61% のあと 2026 年頭に戻りを報告。【実測。手法が違い、割れている】 https://ahrefs.com/blog/ai-overviews-reduce-clicks/ ／ https://seerinteractive.com/insights/aio-impact-on-google-ctr-2026-update
- **2026 年の、個人の旅行ブログに絞った測定は見つからなかった。**

### このサイトでやるべきこと
- 記事の核を「本人が行って、見て、払って、言ったこと」に置く。事前調査は**出どころつきの添えもの**にする（逆にすると「広く知られた事実の言い換え」になる）
- 著者の面（`/about`）へ各記事から繋ぐ。**どう作ったか**（配信の文字起こしから組み、本人が見直した／事実は出どころつき）を 1〜2 行で出す
- ページの単位は「人が検索する問い」。配信 1 本ではない（11 章）
- 言い換えごとにページを分けない（「ソフィア 物価」と「ソフィア 生活費」を別ページにしない）

---

## 2. 構造化データ

### 分かったこと

Google の検索ギャラリーに今ある型（25）: Article / Breadcrumb / Carousel / Course list / Dataset / Discussion forum / Education Q&A / Employer aggregate rating / Event / Image metadata / Job posting / Local business / Math solver / Movie / Organization / Product / Profile page / Q&A / Recipe / Review snippet / Software app / Speakable / Subscription and paywalled content / Vacation rental / Video。【公式】 https://developers.google.com/search/docs/appearance/structured-data/search-gallery

| 型 | Google の扱い（2026-11） | このサイト | 出どころ |
|---|---|---|---|
| `Article` / `BlogPosting` | 使う。必須プロパティ無し。推奨は `author`（`name` `url`）`datePublished` `dateModified` `headline` `image`。タイトル・画像・日付の出かたが良くなる | **全ガイド面に入れる** | 【公式】 https://developers.google.com/search/docs/appearance/structured-data/article |
| `BreadcrumbList` | 使う | 入れる（国 → 街 → 話題） | 【公式】ギャラリー |
| `WebSite`（サイト名） | 使う。**トップページだけ**。`name` と `url`。ドメインかサブドメイン単位で、サブディレクトリは不可 | 入れる。独自ドメインへ移ってからが本番 | 【公式】 https://developers.google.com/search/docs/appearance/site-names |
| `ProfilePage` + `Person` | 使う。「ブログの About Me の面」が用途に明記。`mainEntity` に Person、`sameAs` に外のプロフィール | **`/about` に入れる。`sameAs` に YouTube チャンネル・X など** | 【公式】 https://developers.google.com/search/docs/appearance/structured-data/profile-page |
| `Organization` | 使う（ロゴ・識別）。トップか紹介の 1 面。`sameAs` は「ほかのサイトにある、その組織の追加情報のページ」。個人（Person）についてはこの文書は触れていない | 個人運営なので `Person` を主にする。`Organization` は無くてよい | 【公式】 https://developers.google.com/search/docs/appearance/structured-data/organization |
| `VideoObject` | 使う。必須は `name` `thumbnailUrl` `uploadDate`。**動画の機能に出るのは「視聴ページ」だけ**（4 章）。2026-09-24 に `creator` が足された | ガイド面では動画の枠は取れない。入れるなら配信専用の面 | 【公式】 https://developers.google.com/search/docs/appearance/structured-data/video |
| `Clip` / `SeekToAction` | 自サイトで動画を埋めている・動画基盤を持つ場合。`Clip` は全言語、`SeekToAction` は日本語を含む 12 言語で、Google が動画ファイルを取れることが条件。**YouTube に置いた動画は、YouTube の概要欄のタイムスタンプで足りる**と書いてある | **YouTube の概要欄にチャプターを書くのが正道** | 【公式】同上 |
| `BroadcastEvent`（LIVE の印） | 使う。`publication.isLiveBroadcast` `startDate` `endDate`、Indexing API で開始と終了を知らせる | 生配信は YouTube 側に印が出る。自サイトで取りに行く価値は低い | 【公式】同上 |
| `FAQPage` | **廃止。2026-05-07 から Google 検索に出ない。2026-06-15 に文書も消えた** | マークアップは入れない。Q&A の書き方は普通の HTML でやる | 【公式】 https://developers.google.com/search/updates |
| `HowTo` / サイトリンク検索ボックス（`SearchAction`） | ギャラリーに無い（前者は 2023 年、後者は 2024 年に終了。こちらの記憶で、今日は一覧に無いことだけ確認） | 入れない | 【公式】ギャラリーに不在 |
| `ItemList`（カルーセル） | Recipe / Course list / Restaurant / Movie との組み合わせだけ | 旅行の一覧では出ない | 【公式】ギャラリー |
| `TouristDestination` / `TouristAttraction` / `TouristTrip` / `Place` | **ギャラリーに無い。リッチリザルトにならない** | 下の「AI への効き」を参照 | 【公式】ギャラリーに不在 |

**リッチリザルトにならない型が、AI やナレッジグラフの理解に効く根拠は在るか**
- Google: 「生成 AI 検索に構造化データは必須ではない。特別な schema.org も無い」「構造化データは、見えている本文と一致させること」。【公式】AI の手引き／AI features
- **対照のある測定は「効かない」**: Ahrefs（2026-05-12）。JSON-LD を足した 1,885 ページと対照 4,000 ページで、AI Mode +2.4%、ChatGPT +2.2%（どちらも誤差の内）、AI Overviews −4.6%。ただし対象は、足す前から AI Overviews に 100 回以上引用されていたページだけ。**まだ引用されていないページに効くかは、この測定では分からない。**【実測】 https://ahrefs.com/blog/schema-ai-citations/
- 「引用されたページの 65〜71% は構造化データつき」という数字は相関で、因果ではない。【実測（相関）】
- 壊れた JSON-LD の中にだけ書いた住所を AI が答えた、という実験がある。筆者の読みは「**LLM は JSON-LD を構造としてではなく、ただの字として読んでいる**」。【実測（1 件）】 https://www.searchenginejournal.com/schema-llms-the-low-bar-for-evidence-in-geo/576090/
- Microsoft（Bing）の担当者は「スキーマは LLM がコンテンツを理解する助けになる」と発言（2025-03 の登壇）。測定は出ていない。【公式の発言・二次】
- **結論**: `TouristAttraction` などを「AI に効く」として盛る根拠は無い。害も無いが、時間を使う先ではない。【推論】

**`sameAs` で YouTube と結ぶ**
- `ProfilePage` の `mainEntity`（Person）に `sameAs: [YouTube チャンネルの URL, …]`。`Article.author.url` を `/about` に向け、そこに ProfilePage を置く、が Google の勧める形。【公式】Article と ProfilePage の文書
- 逆向き（YouTube → サイト）は YouTube のチャンネルの「リンク」と概要欄。YouTube の外部リンクは評価を渡さない形だと広く言われている。【通説。今日は裏づけを取れなかった】
- Search Console に YouTube などのアカウントを「プラットフォームプロパティ」として足せるようになった（2026-07-07 発表）。【公式・二次】 https://searchenginejournal.com/google-opens-search-console-social-reporting-to-everyone/584144
- Google の「検索プロフィール」（クリエイター向けの公開プロフィール）は、当初は登録者 10 万、その後 3.5 万、1 万へ下げたと報じられ、米国のみ。**数字が割れている。**【二次・割れ】 https://searchenginejournal.com/google-search-profiles-10000-followers/589635/

### このサイトでやるべきこと
1. トップに `WebSite`。`/about` に `ProfilePage` + `Person` + `sameAs`
2. ガイド面に `Article`（`author` → `/about`、`datePublished`、`dateModified`、`image`）と `BreadcrumbList`
3. 日付は**見える日付と同じ値**にする（「公開」「最終更新」と書く）。【公式】 https://developers.google.com/search/docs/appearance/publication-dates
4. `FAQPage` `HowTo` `SearchAction` `TouristAttraction` は入れない
5. `VideoObject` は、配信専用の面を作ると決めたときだけ

---

## 3. AI 検索に引用されるために効くこと

### 分かったこと

**(a) クローラの役割と robots.txt**

| 会社 | 札 | 役割 | robots.txt | 出どころ |
|---|---|---|---|---|
| OpenAI | `GPTBot` | 訓練 | 効く | 【公式】 https://developers.openai.com/api/docs/bots |
| | `OAI-SearchBot` | **ChatGPT の検索に出すための索引**。閉じると回答に出ない（リンクだけ出ることはある）。変更の反映は約 24 時間 | 効く | 同上 |
| | `ChatGPT-User` | 利用者の求めでその場で取りに来る。「利用者が起こした動作なので、robots.txt の決まりは当たらないことがある」。検索に出るかどうかの判定には使わない | **当てにならない** | 同上 |
| Anthropic | `ClaudeBot` | 訓練 | 効く（`Crawl-delay` も） | 【公式】 https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler |
| | `Claude-SearchBot` | 検索の質のための索引。閉じると検索結果での見え方が落ちうる | 効く | 同上 |
| | `Claude-User` | 利用者の問いに答えるためにその場で取りに来る。閉じると見え方が落ちうる | 効く | 同上 |
| Perplexity | `PerplexityBot` | 検索結果に出すための索引。基盤モデルの訓練には使わない。反映は最大 24 時間 | 効く | 【公式】 https://docs.perplexity.ai/guides/bots |
| | `Perplexity-User` | 利用者の求めで取りに来る。「**ふつう robots.txt を無視する**」 | 効かない | 同上 |
| Google | `Googlebot` | 検索と AI Overviews / AI Mode | 効く | 【公式】 |
| | `Google-Extended` | Gemini の訓練・グラウンディングの可否だけ。這い回らない札。検索には無関係 | 効く | 【公式】 https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers |
| Microsoft | `Bingbot` | Bing の索引。Copilot と Bing の AI 要約の土台 | 効く | 【公式】 https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview |
| Apple | `Applebot` | Siri / Spotlight / Safari。**ブラウザで描画することがある** | 効く | 【公式】 https://support.apple.com/en-us/119829 |
| | `Applebot-Extended` | 訓練の可否だけ。「ページを這い回らない」 | 効く | 同上 |

- いまの `User-agent: * / Allow: /` で全部通っている。**引用されたいなら、このままで足りる。**ボットごとの行を足す意味があるのは「訓練は断るが検索には出たい」ときだけ（`GPTBot` `ClaudeBot` `Google-Extended` `Applebot-Extended` を Disallow、`OAI-SearchBot` `Claude-SearchBot` `Claude-User` `PerplexityBot` は通す）。**訓練に使わせるかどうかはオーナーの好みの話で、こちらが決めることではない。**

**(b) JS を実行するか**
- 「主要な AI クローラは、どれも JavaScript を描画しない」: OpenAI の 3 つ、ClaudeBot、Meta、ByteDance、PerplexityBot。JS ファイルは取りに来る（ChatGPT 11.5%、Claude 23.84%）が実行しない。**描画するのは Googlebot（Gemini も同じ基盤）と Applebot。**【実測。Vercel と MERJ、2024-12-17。2026 年に同じ規模のやり直しは見つからなかった】 https://vercel.com/blog/the-rise-of-the-ai-crawler
- 同じ測定で、404 に当たる割合は ChatGPT 34.82%・Claude 34.16%（Googlebot 8.22%）、リダイレクトに使う割合は ChatGPT 14.36%（Googlebot 1.49%）。**古い URL を 404 にしない・リダイレクトを重ねないことが、AI には Google 以上に効く。**
- Google: 「JavaScript の中身も、ブロックされていなければ処理できる」。【公式】

**(c) llms.txt**
- Google: 「使わない」（2026-06-15 に明記）。【公式】
- 置いてある 13.7 万ドメインのうち、**97% は 2026 年 5 月に 1 回も読まれていない**。読みに来たのは SEO の監査ツール 21.7%、正体不明 14.9%、一般のクローラ 13.1%。AI の検索用ボットは 1.1%。GPTBot 4.51%、ClaudeBot 0.80%。【実測・二次（Ahrefs、Originality.ai の追跡に引用）】 https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/
- 置いているサイトは 2025-06 の 4,088 から 2026-05 の 36,120 へ（8.8 倍）。読まれた根拠は薄いまま。【実測】同上
- 83 サイトに正しい llms.txt を置いて 12 週間見たら、OpenAI は合計 7 回。ボットごとに挙動がばらばら。【実測・二次】
- OpenAI も Anthropic も、クローラの文書で llms.txt に触れていない（自社の開発者向け文書には置いている）。【公式・二次】
- **結論: 引用を増やす根拠は無い。置いても害は無いが、順番はいちばん後ろ。**

**(d) ChatGPT の検索は Bing にどれだけ寄るか／IndexNow**
- OpenAI の言い方は「第三者の検索事業者と、提携先から直接もらう内容を使う」。名前が出ているのは Bing。割合は非公開。【公式・二次（2024-10 の発表時。今の文言は 403 で開けなかった）】
- 重なりの測定は**ばらばら**: 引用の 87% が Bing の上位と一致（Seer、500 件）／Bing との重なりは 26% → 8% に落ち、Google との重なりが 12% → 33% に上がった（2025-07）／Google の上位 10 との URL 一致は 10%、ドメイン一致は 31.8%（Ahrefs）／「OpenAI は自前の索引を持つ。Bing の上位 20 と重なるのは 1.5%」（Search Engine Land の記事。403 で本文は読めず）。【実測・割れている】 https://tryprofound.com/blog/ai-search-shift
- Bing の公式: AI Performance レポート（2026-02-10 公開プレビュー）は Copilot・Bing の AI 要約・一部の提携先での**引用回数、引用されたページ、グラウンディングの問いの見本**を出す。**ChatGPT は含まない。**改善の助言は「IndexNow は、追加・更新・削除を知らせ、AI が最新版を参照する助けになる」「見出し・表・FAQ の区画がはっきりしていると要点を拾いやすい」「主張は例・数字・出どころで支える」「定期的に更新する」「文章・画像・動画で同じものを指す」。【公式】 https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview
- IndexNow が ChatGPT に効くと言った一次情報は無い。Google は IndexNow に参加していない。【公式に不在】
- **日本の特記（今日この箱から測った）**: Yahoo!検索の結果ページに「AI による回答」が出ていて、**引用のリンクに `?utm_source=openai` が付いている**（「ブルガリア 物価」「ソフィア 治安」「バンコク 物価」で確認）。引用先は公的機関（統計局・外務省・大使館）と企業サイトが主で、個人のものらしいサイトも混ざっていた（運営者は確かめていない）。LINE ヤフーの発表は Vertex AI の利用に触れており、裏側が何かは公式には確認できなかった。【実測。裏側は不明】
- **結論: Bing Webmaster Tools への登録と IndexNow は、安くて、Copilot には公式に効き、ChatGPT には「効くかもしれない」。やる。**

**(e) 引用されやすい文章の形**
- **GEO の論文（KDD 2024）**: 模擬の生成エンジン（GPT-3.5、Google 上位 5 件）で、出典の見え方（位置で重みづけした語数）が、基準 19.5 に対して「引用を足す」27.8、「統計を足す」25.9、「出どころを示す」24.9、「流暢にする」25.1。**キーワードの詰め込みは 17.8 で悪化。**Perplexity での実地でも引用追加で約 22%。**順位の低い出典ほど伸びる**（5 位の出典は「出どころを示す」で +115%、1 位は −30%）。英語・模擬エンジンが主で、日本語の検証は無い。【実測】 https://arxiv.org/abs/2311.09735
- **Toronto 大の 2025 年の論文**: AI 検索は、ブランド自身のサイトや SNS より、**第三者の媒体（earned media）に強く寄る**。Google はもっと均等。寄り方はエンジンごとに違う。【実測。細かい数字は二次情報】 https://arxiv.org/abs/2509.08919
- **AI Overviews の引用のうち、その語の上位 10 に居るページは 37.9%**（2025-07 は約 76%。数えかたが変わったので目安）。31.0% は上位 100 の外。**その語で上位でなくても、関連する問いで拾われる。**上位 100 の外から来た引用の 18.2% は YouTube。【実測。Ahrefs、86.3 万語・約 400 万 URL、2026-03-02】 https://ahrefs.com/blog/ai-overview-citations-top-10
- **鮮度**: AI が引用する URL は、検索結果の URL より平均 25.7% 新しい（1,064 日対 1,432 日）。ChatGPT がいちばん新しいものを好み、Google の AI Overviews だけは逆に少し古い。**とはいえ絶対値は約 3 年前の内容。**【実測。Ahrefs、1,700 万件】 https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content/
- 「問いの直後に答えを置くと約 2 倍引用される」「ページの頭 30% から引用の 44% が出る」などは、業者の相関の数字。【実測（相関）・二次。通説に近い】
- Google 自身は「AI のための特別な書き方は要らない」。【公式】
- **読み**: 引用・数字・出どころ・日付は、Google の言う「一次の経験と独自の情報」とも、Bing の助言とも、論文とも同じ向き。**問いに直接答える段落＋数字＋日付＋出どころ＋本人の一言**は、どの立場から見ても損が無い。【推論】

**(f) Markdown の別版**
- Google: 「Markdown は要らない。無視する」。【公式】
- Cloudflare が 2026-02-12 に「Markdown for Agents」（`Accept: text/markdown` に Markdown で返す）を出した。このヘッダを送ると名前が挙がっているのはコーディング用のエージェント（Claude Code など）で、**検索用のクローラが Markdown を求めるという測定は無い。**【公式（Cloudflare）＋実測なし】 https://blog.cloudflare.com/markdown-for-agents/
- **結論: やらない。静的 HTML が綺麗なら足りる。**

### このサイトでやるべきこと
1. 本番の HTML を JS なしで取り、本文の字（街の名前・値段・日付）が在るか確かめる（`curl` して grep。見張りにできる）
2. robots.txt はいまのまま通す。訓練の可否だけオーナーに聞く
3. Bing Webmaster Tools に登録して sitemap を出す。デプロイのあとに IndexNow を叩く
4. 記事の型: 問いの見出し → 1〜2 文の答え → 数字の表 → 本人の一言（引用）→ その場面の時刻つきリンク → 出どころ
5. 404 を出さない。面を畳むときは 1 回で届く 301
6. llms.txt と Markdown 別版はやらない

---

## 4. 動画と結ぶ SEO

### 分かったこと
- **動画として索引されるのは「視聴ページ」だけ。**「視聴ページの主な目的は、1 本の動画を見せること」「動画を見ることが、その面に来る主な理由であること」。**視聴ページではない例に「埋め込んだ動画を評する記事」「同じ重みの動画を何本も並べた面」が明記されている。**同じ動画を視聴ページと別の面の両方に置くのは構わない。【公式】 https://developers.google.com/search/docs/appearance/video
- 第三者の再生機（YouTube）の埋め込みは対応。「自分の面と、YouTube の側の面の**両方**を索引することがある」。サムネイルは安定した URL で要る。【公式】同上
- 見どころ（key moments）: `Clip`（全言語）、`SeekToAction`（日本語を含む 12 言語）、**YouTube の概要欄のタイムスタンプ（全言語）**。【公式】同上
- 「動画だけの面にしない。文字起こしや解説など、動画のまわりに文章を置く」「同じ内容を動画と記事で出しても重複ではない」。【公式の発言・二次（Mueller、2019 年）】
- **YouTube は AI の最多級の引用元**: AI Overviews で引用の 29.5%、AI Mode で 16.6%、Perplexity で 9.7%（BrightEdge）。AI Overviews で最多、半年で +34%（Ahrefs）。全体では Reddit の次で 2 位、**概要欄と自動の文字起こしも拾われる**（Peec、3,000 万件、2026-03）。ChatGPT では弱い（YouTube の引用の 65% は AI Overviews、ChatGPT は 1%）。【実測・業者の測定で、数字は割れる】 https://brightedge.com/resources/weekly-ai-search-insights/youtube-presence-ai-search ／ https://docs.peec.ai/research/youtube-in-ai-search
- 今日の日本語の検索でも、「ティラナ 治安 夜」「エレバン 物価」「ソフィア 空港 市内 行き方」の上位に YouTube の動画が 1 本ずつ入っていた。【実測】

### このサイトでやるべきこと
- **ガイド面で動画の枠を取りに行かない。**ガイド面は記事として戦い、動画は「証拠と続き」として埋める・時刻つきで繋ぐ
- **YouTube の側を整えるほうが、AI にも Google にも効く**: 概要欄にチャプター（`0:00 …` の形）、その回で行った街と値段の 2〜3 行、ガイド面へのリンク。新しい配信から。古い 750 本は、ガイド面から繋いだ回だけ
- ガイド面 → `https://youtu.be/<id>?t=<秒>` の時刻つきリンクを、**その一言の横に**置く（「ここで言っている」が 1 回で確かめられる。これが経験の証拠になる）
- 埋め込みは押すまで読み込まない形にする（再生機の JS は重い。CWV のため）。【通説。web.dev の勧め】
- 配信専用の面（視聴ページ）は、検索の需要がある回だけ。YouTube の同じ動画が上に来る見込みが高い。【推論】

---

## 5. 日本語の旅行クエリの現実（今日 20 語を実際に引いた）

### 測りかた
- この箱の WebSearch は米国向けで、日本語の語でも英語の結果が混ざった。使えない
- **Yahoo!検索（`search.yahoo.co.jp`）を curl で引いた。**検索結果は Google の技術で出ていると言われている（結果の URL の 1 件に Google の `srsltid` が付いていた。契約の現状は今日は確かめていない）。Google 日本の並びそのものではないので、**近似**として読む
- 生の HTML は `（作業箱の一時置き場）/serp/` に在る（`serp1.json` `serp2.json` が並び）
- 上位 9〜10 件を、個人の独自ドメイン／ブログ基盤（note・はてな・アメブロ）／大手・OTA・企業／SNS・UGC／公的、に分けた。機械で分けたので 1 語につき 1 件ほどの誤りがある

### 結果

| 語 | 個人の独自ドメイン | note 等 | 大手・OTA・企業 | SNS・UGC | 公的 | 上に居たところ |
|---|---|---|---|---|---|---|
| ソフィア 観光 | 1 | 1 | 6 | 1 | 0 | skyticket / 4travel / VELTRA / トラベル jp |
| 北マケドニア 観光 おすすめ | 1 | 1 | 7 | 0 | 0 | 地球の歩き方 / skyticket / GetYourGuide / Trip.com |
| ブルガリア 旅行 2026 | 0 | 0 | 9 | 0 | 0 | KKday / Trip.com / Klook / NEWT / TripAdvisor |
| プロヴディフ 観光 モデルコース | 2 | 2 | 5 | 0 | 0 | ロコタビ / 個人 2 / はてな |
| コソボ プリシュティナ 観光 | 4 | 2 | 3 | 0 | 0 | 個人が 1・2 位 |
| ブルガリア 物価 | 3 | 2 | 4 | 0 | 0 | note が 1 位、個人が 2・3・4 位 |
| エレバン 物価 | 6 | 1 | 1 | 1 | 0 | 個人が 1・3・4 位。YouTube 1 本 |
| ブルガリア 旅行 費用 1週間 | 2 | 2 | 4 | 0 | 0 | 金融系の案内 / note / Expedia / はてな |
| スコピエ 治安 | 3 | 2 | 1 | 1 | 1 | 個人が 1 位、外務省は 6 位 |
| ソフィア 治安 | 3 | 1 | 1 | 2 | 2 | 個人が 1 位、大使館 4 位、X、Reddit の訳 |
| ティラナ 治安 夜 | 4 | 1 | 1 | 3 | 0 | **Reddit の自動訳が 1 位**、YouTube が 2 位 |
| ソフィア 空港 市内 行き方 | 4 | 3 | 1 | 1 | 0 | 個人 1 位、アメブロ、はてな 2、YouTube |
| オフリド 行き方 スコピエ バス | 3 | 2 | 3 | 1 | 0 | note 1 位、Rome2Rio、個人、Reddit の訳 |
| リラ修道院 行き方 ソフィア 日帰り | 3 | 2 | 4 | 0 | 0 | note 1 位、GetYourGuide、Viator、個人 |
| バルカン半島 周遊 ルート バス | 2 | 1 | 5 | 1 | 0 | note 1 位、4travel、個人、旅行会社 |
| 【対照】パリ 観光 | 0 | 0 | 9 | 0 | 0 | 関空 / 阪急 / 地球の歩き方 / JTB / HIS / NEWT |
| 【対照】バンコク 物価 | 1 | 2 | 4 | 1 | 0 | 信託銀行 / 不動産会社の自社メディアが 1・2 位 |

（「トビリシ 物価 2026」は英語の結果ばかり、「ブルガリア ヨーグルト 本場 スーパー 値段」は日本のネットスーパー、「ソフィア カフェ 作業 Wi-Fi」は代官山の店に取られた。**語が日本の何かと被ると負ける。**）

### 読めること
- **語の形で勝ち負けが決まる。**「〇〇 観光」「おすすめ」「旅行 2026」の頭の語は大手と OTA。「物価」「治安」「行き方」「費用」は個人と note が過半。【実測】
- **ニッチは薄い。**15 語のうち 10 語で、同じ 1 人の個人ブログが上位 10 に入っていた。バルカンとコーカサスを 1 人で面で押さえている。そのページは 2019 年公開・2023 年更新で、**出どころリンクは無く、公的な数字も無い**（中身は 2 週間の滞在の実感）。別の上位の個人ページ（空港からの行き方）は約 1,500 字で、**運賃も訪問日も書いていない**。【実測（2 ページを読んだ）】
- **note・はてな・アメブロが強い。**15 語で 23 件。基盤の評価に乗っている
- **Reddit の自動訳（`?tl=ja`）が日本語の検索に入ってきている**（4 語）。YouTube 3 語、Instagram 1 語、X 1 語
- **「治安」は公的機関が混ざる**（外務省・大使館）。Yahoo!検索の AI 回答は、治安では外務省と大使館だけを引いていた。**安全の話は、公的な出どころに繋いだうえで本人の実感を足す**のが筋
- 大手の頭の語には、多言語で自動生成したらしい面（年と月だけ差し替えた題）も居た。**まねしない**（1 章 (e) の落ちかたそのもの）
- 主要な行き先（パリ）は個人 0。**主要都市の頭の語は捨てる**

### 個人が取りに行ける語の形
1. **数字で答える問い**: 「〇〇 物価」「〇〇 1 日 いくら」「〇〇 〜 △△ バス 料金 所要時間」「〇〇 空港 市内 行き方」「SIM / eSIM いくら」
2. **実感で答える問い**: 「〇〇 治安 夜」「〇〇 一人」「〇〇 英語 通じる」「〇〇 カード 使える」
3. **年と月つき**: 「2026 年 11 月に行った」。上位には 2018〜2022 年の記事が少なくとも 5 件残っていた（URL と題の年から読めた範囲）。一方で「2026 年最新」を題に入れた記事も居る。**本当に行った日付**を本文に持つ側が強い
4. **街の名前まで降りた語**（プロヴディフ、オフリド、プリシュティナ）。国名＋「観光」より薄い
5. **日本の何かと被らない語**を選ぶ（「ソフィア」「ブルガリア ヨーグルト」は被る。街名＋国名を添える）

---

## 6. サイト構造の定石

### 分かったこと
- **URL**: 「読む人の言語の語を使う（当てはまるなら翻字も）」「ASCII でない字はパーセントエンコードする」「区切りはハイフン。下線は勧めない」「長い ID より読める語」。**階層の深さ・末尾スラッシュ・日付を URL に入れるかについて、Google の文書は何も言っていない。**【公式】 https://developers.google.com/search/docs/crawling-indexing/url-structure
  - 日本語スラッグは公式には可。今日の上位にも日本語スラッグの個人ブログが居た。ただし貼ると `%E3%83…` の長い列になる。**英字スラッグ（いまの `/bulgaria`）に測れる不利は見つからなかった。**【実測は無い。推論】
  - 末尾スラッシュは「どちらかに揃える」。いまは `trailingSlash: false` と `cleanUrls: true` で揃っている。【通説＋Firebase の公式】 https://firebase.google.com/docs/hosting/full-config
  - 日付を URL に入れると、更新しても URL が古く見える。入れないのが無難。【通説】
- **`lastmod`**: 「**一貫して、確かめられる形で正確なときに使う**（たとえばページの最終更新と比べる）」「本文・構造化データ・リンクの更新は意味のある更新。著作権表示の年の更新は違う」。`priority` と `changefreq` は無視する。【公式】 https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
  - **いまの `sitemap.ts` は全 URL が「ビルドした今」。毎晩ビルドが走るので、全面が毎日更新されたことになっている。**Google はこの sitemap の `lastmod` を信じなくなる
- **日付の出しかた**: 「見える日付を目立つ所に」「『公開』『最終更新』と書く」「構造化データの `datePublished` `dateModified` と同じ値に」「ページに余計な日付を置かない」。【公式】 https://developers.google.com/search/docs/appearance/publication-dates
- **著者**: 署名と著者の面。【公式】（1 章）
- **内部リンク**: AI の機能に出るための実務として「内部リンクで見つけやすく」。【公式】AI features
- **トピッククラスター**（国＝ハブ、街・話題＝スポーク）: Google の文書にこの言葉は無い。伸びた旅行ブログの共通点に「話題ごとに複数記事」が挙がる。上位の個人ブログも、治安の記事から物価・交通・街ごとの記事へ密に繋いでいた。【実測（弱い）＋通説】
- **1 面の長さ・分割**: Google は字数の基準を持たないと繰り返している。AI の手引きは「細切れにしなくてよい。1 面に複数の話題があっても、関係する部分を見せられる」。【公式】
  - ただし言い換えごとに面を分けるのは不可（1 章）
  - 上位の個人ページは 1,500〜3,000 字だった。【実測（2 件）】
- **`hreflang`**: 言語・地域ごとに版が在るときに使う。**双方向でないと無視される**。Google はページの言語を `hreflang` や `lang` 属性では判定しない。**日本語だけなら要らない。**【公式】 https://developers.google.com/search/docs/specialty/international/localized-versions
- **英語版の価値**: 測定は見つからなかった。「トビリシ 物価 2026」を日本語で引いても英語の面が並んだので、英語圏のこの種の語は競合が多い。未確認の機械翻訳の量産は、スパム方針の例（自動変換）に近づく。【推論】

### このサイトでやるべきこと
- 形: `/bulgaria`（国ハブ）→ `/bulgaria/sofia`（街）→ `/bulgaria/sofia/airport-to-city` か `/bulgaria/prices`（話題）。**2〜3 段まで。**英字スラッグ、ハイフン、日付なし
- 国ハブから全部の街と話題へ、話題からハブと隣の話題へ、各話題からその場面の配信へ。パンくずを見える形でも出す
- `sitemap.ts` の `lastModified` を**その面の中身が最後に変わった日**にする（焼き込みの元データの日付か、git の最終変更日）。`priority` は消してよい
- 面に「行った日」「公開」「最終更新」を出す。値段には「いつの値段か」を付ける
- 英語版は後回し。やるなら数面を人が読める品質で、`hreflang` を双方向に

---

## 7. 測りかた

### 分かったこと
- **Search Console**
  - ドメインプロパティは DNS で確かめる。**`*.web.app` では作れない**（DNS を持っていない）。独自ドメインに移れば作れる
  - 生成 AI のレポートは表示回数だけ・UI だけ。**API には出ていない**という報告が複数。【二次・未確定】
  - YouTube チャンネルをプラットフォームプロパティとして足せる（2 章）
  - 検索アナリティクスの API は上位の行だけを返す（全部ではない）。【公式】 https://developers.google.com/webmaster-tools/v1/searchanalytics/query
  - BigQuery への一括エクスポートが在る（このリポジトリは BigQuery を使っているので相性が良い）。【こちらの記憶。今日は文書を開いていない】
- **Google からの流入の見分け**: Referer は `https://www.google.com/`（か各国のドメイン）だけで、検索語は入らない。アプリは `android-app://com.google.android.googlequicksearchbox/…`。**この文書は AI Overviews や AI Mode を分けていない。**【公式。2026-11-12 に足された面】 https://developers.google.com/search/docs/monitor-debug/identify-google-search-traffic
  - AI Mode のクリックは `noreferrer` で Referer が落ちる（Google は不具合として認めた）という報告と、`google.com` で来るという報告が在る。【二次・割れている】 https://ahrefs.com/blog/google-ai-mode-is-here-but-you-cant-track-it-properly
- **ChatGPT**: リンクに `utm_source=chatgpt.com` が付く。OAI-SearchBot を通していれば、解析ツールで追える。【公式・二次（OpenAI の Publishers FAQ。本文は 403）】 https://help.openai.com/en/articles/12627856-publishers-and-developers-faq
- **Yahoo!検索の AI 回答**: `utm_source=openai`（今日の実測。3 章）
- **そのほかの AI**: Referer が `perplexity.ai` `copilot.microsoft.com` `gemini.google.com` `claude.ai` などで来る。アプリからは Referer が落ちて「直接」に化けることが多い。【通説】
- **Bing Webmaster Tools の AI Performance**: Copilot と Bing の AI 要約での引用回数・引用されたページ・グラウンディングの問いの見本。無料。ChatGPT は入らない。【公式】（3 章）
- **Firebase Hosting のリクエストログ**: Cloud Logging に繋ぐと、CDN に来た全リクエストが出る（`userAgent` つき。30 分以内に届く。無料枠あり）。【公式】 https://firebase.google.com/docs/hosting/web-request-logs-and-metrics
  - **JS の計測タグでは AI のボットは 1 件も見えない**（JS を実行しないから）。**ログなら、`ChatGPT-User` `Perplexity-User` `Claude-User` が「誰かの問いに答えるために、いまこのページを読みに来た」回数として数えられる。**引用の、無料で取れるいちばん近い代わり。【推論。各社の文書にあるボットの役割から】
- **AI に言及されたかを追う（無料の範囲）**: Search Console の生成 AI レポート、Bing の AI Performance、上のログ、決めた問い 20 個を月 1 回手で各 AI に聞いて記録する。有料の追跡ツールは多いが、Google は「Google の内部の順位や AI の指標を見られると称する第三者のツールに注意」と書いている。【公式】AI の手引き

### このサイトでやるべきこと
1. 独自ドメインへ移ったら Search Console のドメインプロパティを作る。一括エクスポートを BigQuery へ
2. Bing Webmaster Tools に登録（Search Console から取り込める）
3. Hosting のログを Cloud Logging へ繋ぎ、AI のボットの UA と Referer を毎晩数える Actions を 1 本
4. 軽い計測タグを 1 つ（流入元と `utm_source` が見えれば足りる）。**何を入れるか・Cookie の同意をどうするかは仕様の話なので、オーナーに聞く**
5. 「決めた 20 問を月 1 回 AI に聞く」は Actions にしない（各社の API は検索つきの回答と同じとは限らない）。手で、表に残す

---

## 8. 静的サイト＋Firebase Hosting ならではの注意

### 分かったこと
- **`Cache-Control: no-cache`**: Google のクローラが対応するのは `ETag` / `If-None-Match` と `Last-Modified` / `If-Modified-Since`。`ETag` を勧める。「ほかのキャッシュの指示は対応していない」。**`no-cache` が順位や索引に害を出すという記述は無い。**【公式】 https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers
  - `no-cache` は「使う前に確かめ直せ」で、「保存するな」ではない。戻る・進むの即時表示（bfcache）を壊すのは `no-store` のほう。【こちらの知識。今日は裏づけを開いていない】
  - 再訪のたびに確かめ直しの往復が 1 回入る。初回の表示（CWV が主に見る所）には効かない。【推論】
- **Core Web Vitals**: 「順位づけの仕組みに使っている」。ただし「ページ体験が劣っていても、いちばん関連の高い内容を出そうとする」。【公式】 https://developers.google.com/search/docs/appearance/page-experience
- **404**: `404.html` を置けばそれが 404 で返る。【公式】 https://firebase.google.com/docs/hosting/full-config  AI のクローラは 404 に当たる率が高い（3 章）
- **`web.app` サブドメイン**
  - Google の担当者（Mueller、2026-01）: 無料のサブドメインのホスティングはスパムと手抜きの内容を呼び込むので、そこでの SEO は難しくなる。Public Suffix List に載っていれば各サブドメインは別のサイトとして扱われるが、周りの環境は信号の読まれかたに響く。【公式の発言・二次】 https://www.searchenginejournal.com/googles-mueller-free-subdomain-hosting-makes-seo-harder/565249/
  - サイト名はドメインかサブドメイン単位で出せる。【公式】
  - 影響の大きさを測った数字は無い
- **独自ドメインへの引っ越し**
  - 「古い URL から新しい URL へ、サーバ側の恒久リダイレクト」「できるだけ長く、ふつう 1 年以上残す」「順位は一時的に揺れる」。【公式】 https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
  - 住所変更ツールは「ドメイン単位のプロパティ」で使える（パス単位は不可）。**`xxx.web.app` の URL プレフィックスのプロパティで使えるかは、文書からは読み切れない。**【公式・未確定】 https://support.google.com/webmasters/answer/9370220
  - **Firebase Hosting の落とし穴**: `firebase.json` の `redirects` はパスで当てるもので、**ホスト名では分けられない**。独自ドメインを足しても、同じ中身が `web.app` と `firebaseapp.com` でも出続け、既定のサイトは消せない。【公式】 https://firebase.google.com/docs/hosting/full-config ／ https://firebase.google.com/docs/hosting/multisites
  - **手の案（未検証）**: Hosting のサイトをもう 1 つ作り、新しいサイトに中身と独自ドメインを載せる。既定のサイト（いまの `web.app`）には「全部を新ドメインへ 301」だけの設定を配る。`redirects` は外の URL へ飛ばせて、パスの取り込み（`:path*`）も在る。1 プロジェクト 36 サイトまで。**公式の文書の組み合わせとしては成り立つが、実地では試していない。**
  - それをしない場合は canonical だけが頼りになる（canonical は指示ではなく手がかり）
- **`output: "export"` の焼き込み**: 「あと何日」を画面が出てから数え直しているのは、検索の側からは焼いた時点の字が読まれる、ということ。**記事の日付と値段は、焼いた字が正**になるようにする。【推論】

### このサイトでやるべきこと
- `no-cache` はそのままでよい。`no-store` にはしない
- YouTube の埋め込みは押すまで読み込まない形にする
- 独自ドメインへ、**URL を増やす前に**移る。移るときは上の 2 サイト方式を作業箱ではなく本番の控えで試してから
- `firebaseapp.com` の側も同じ中身が出ている。canonical が新ドメインを指すことを確かめる

---

## 9. 効く順の打ち手の表

「根拠」は 強＝公式に明記、または対照のある測定／中＝公式の発言・相関の測定・今日の実測／弱＝通説・推論。
「オーナーの手」は、アカウント・お金・本人の言葉・仕様の判断が要るもの。

| # | 打ち手 | 狙い | 根拠 | 手間 | オーナーの手 |
|---|---|---|---|---|---|
| 1 | ページの単位を「検索される問い」にする（国ハブ＋街＋話題: 物価・治安・行き方・費用・SIM）。配信 1 本＝1 面にしない | 両方 | 強（スパム方針・手引き）＋中（今日の 20 語） | 大 | どの国から、を聞く |
| 2 | 各面に「本人しか持っていないもの」を型で入れる: 行った日／払った額（現地通貨と円、いつの値段か）／配信での一言（短い引用）／その場面の時刻つきリンク | 両方 | 強（E-E-A-T・non-commodity）＋中（GEO 論文: 引用・統計。上位の個人ページに無い） | 中 | 引用の言い回しの確認 |
| 3 | 独自ドメインへ移る。URL を増やす前に。旧 `web.app` から 301 | 両方 | 中（Mueller の発言・ドメインプロパティ・サイト名） | 中 | **要**（ドメインの購入と DNS） |
| 4 | 本番の HTML に本文の字が在るかを JS なしで確かめ、見張りにする | AI | 強（Vercel の測定・各社の文書） | 小 | 不要 |
| 5 | `sitemap.ts` の `lastModified` を本当の更新日に。`priority` を消す | Google | 強（公式） | 小 | 不要 |
| 6 | 面に「行った日・公開・最終更新」を見える形で出し、JSON-LD と同じ値にする | 両方 | 強（公式）＋中（鮮度の測定） | 小 | 不要 |
| 7 | JSON-LD: トップに `WebSite`、`/about` に `ProfilePage`+`Person`+`sameAs`、ガイド面に `Article`+`BreadcrumbList` | Google | 強（公式）。AI には効かない（Ahrefs） | 小〜中 | 不要 |
| 8 | Bing Webmaster Tools に登録、sitemap を出す、デプロイ後に IndexNow | AI（Copilot は公式、ChatGPT は不確か） | 中（Bing 公式）＋割れ | 小 | **要**（Microsoft のアカウント） |
| 9 | 事実ごとに出どころのリンクと確かめた日。治安は外務省・大使館へ繋いでから実感を足す | 両方 | 中（GEO 論文・Bing の助言・Yahoo の AI 回答の引用先） | 中 | 不要 |
| 10 | 記事の型: 問いの見出し → 1〜2 文の答え → 数字の表 → 一言 → 動画 → 出どころ | AI | 中（Bing 公式・相関の測定）。Google は「特別な書き方は不要」 | 小 | 不要 |
| 11 | YouTube の概要欄: チャプター、その回の街と値段 2〜3 行、ガイド面へのリンク。新しい配信から | 両方（YouTube は AI の最多級の引用元） | 強（key moments は公式）＋中（引用の測定） | 中 | 概要欄の文言は本人の場 |
| 12 | 内部リンク: ハブ ⇄ 話題 ⇄ 配信。見えるパンくず。`/all` に並べる | 両方 | 強（公式）＋弱（クラスター） | 小 | 不要 |
| 13 | まず 1 か国で 10〜20 面を出し、索引された割合を見てから横に広げる | Google | 弱（推論。落ちた事例から） | — | 不要 |
| 14 | 「どう作ったか」を 1〜2 行で出す（配信の文字起こしから組み、本人が見直し、事実は出どころつき） | Google | 強（公式: How） | 小 | 文言の確認 |
| 15 | 語を選ぶ: 数字の問い・実感の問い・街の名前・年月つき。主要都市の頭の語と「おすすめ 10 選」は捨てる | Google | 中（今日の 20 語） | 小 | 不要 |
| 16 | Hosting のログを Cloud Logging へ繋ぎ、AI のボットと流入元を毎晩数える | 測る | 強（Firebase 公式）＋推論（引用の代わり） | 中 | GCP の権限しだい |
| 17 | Search Console: ドメインプロパティ、BigQuery への一括エクスポート、生成 AI レポートを見る、YouTube を足す | 測る | 強（公式）。一部は二次 | 小〜中 | 一部要 |
| 18 | 軽い計測タグ（流入元と `utm_source=chatgpt.com` `openai`） | 測る | 中（OpenAI の FAQ・今日の実測） | 小 | **要**（何を入れるかは仕様） |
| 19 | 404 を出さない。畳む面は 1 回で届く 301 | AI | 中（Vercel: AI は 404 に 34% 当たる） | 小 | 不要 |
| 20 | YouTube の埋め込みを押すまで読み込まない形に。CWV を測る | Google | 中（公式: 弱い順位要因） | 小 | 不要 |
| 21 | note などに要約を書いてガイド面へ繋ぐ（丸写しはしない） | AI（第三者の場に寄る）＋Google（note は上位に多い） | 中（Toronto 大の論文・今日の 20 語） | 中 | **要**（本人の発信） |
| 22 | 自分で撮った絵・配信の 1 コマを各面に。alt を書く | 両方 | 弱〜中（公式: 画像と動画で支える） | 中 | 不要 |
| 23 | ページ内の Q&A を普通の HTML で（`FAQPage` は付けない） | AI | 中（Bing 公式） | 小 | 不要 |
| 24 | 配信専用の面（視聴ページ＋`VideoObject`）を、需要のある回だけ | Google の動画枠 | 強（公式）だが YouTube が上に来る見込み | 中 | 不要 |
| 25 | 訓練用のボットを断るかどうかを決める（断るなら検索用は通す） | AI | 強（各社の文書） | 小 | **要**（好みの判断） |
| 26 | 英語版を数面だけ、人が読める品質で。`hreflang` 双方向 | 両方 | 弱（測定なし） | 大 | 要 |
| 27 | llms.txt を 1 枚置く | AI | **弱（97% は読まれていない。Google は使わない）** | 小 | 不要 |

---

## 10. やらないほうがよいこと

**危ない**
1. **配信 1 本＝1 ページを 750 枚、AI の要約のまま一度に索引させる。**枚数・同じ型・人の手の薄さが、大量生成の形そのもの。落ちるときはその区画だけでなくサイト全体（2026-08 の事例）
2. **生の文字起こし 1,600 本を索引させる。**音声認識の誤り、意味の通らない行、**視聴者さんの名前やコメント**。「読んでも意味が通らないが検索語を含むページ」に近い
3. **言い換えごとに面を作る**（「ソフィア 物価」「ソフィア 生活費」「ソフィア いくら」）。Google が 2026-05 の手引きで名指しした
4. **行っていない所の「おすすめ 10 選」を、AI の知識や他サイトの言い換えで書く。**「広く知られた事実だけ」「Wikipedia との重なり」は最低評価の手がかり。大手が占めていて勝てもしない
5. **他サイトの内容の言い換えを本文の大半にする**（事前調査の章が本体になる形）。スクレイピングの例に「少し変えて載せ直す」が在る
6. **自作自演の言及・買ったリンク。**Google が名指し
7. **未確認の機械翻訳で英語版を量産する**
8. **AI の顔写真や作った経歴で著者を飾る**

**効かない・終わった**
9. `FAQPage`（2026-05-07 に終了）、`HowTo`、サイトリンク検索ボックスの構造化データ
10. `TouristAttraction` などを「AI に効く」と信じて盛ること。**見えない内容を JSON-LD にだけ書くこと**（公式: 見える本文と一致）
11. llms.txt・Markdown の別版・「AI 用のチャンキング」「AI 用の書き直し」に時間を使うこと
12. キーワードの詰め込み（GEO の論文で悪化）
13. sitemap の `priority` と `changefreq`（Google は無視）
14. 字数を目標にすること

**昔の定石・いまの穴**
15. **`lastmod` と更新日を毎ビルドで今日にする**（いまこれ）。年だけ差し替えた「2026 年最新」
16. `Google-Extended` を閉じれば AI Overviews から外れる、という思い込み（外れない）。逆に、訓練を断るつもりで `OAI-SearchBot` `Claude-SearchBot` `PerplexityBot` まで閉じること
17. `nosnippet` や `max-snippet` を付ける（AI の機能に出る条件は「スニペットつきで出せること」）
18. `*.web.app` のまま URL を増やし続ける
19. ガイド面に `VideoObject` を付けて動画の枠を待つ（視聴ページでないと出ない）
20. JS の計測タグだけで AI の来訪を数える（ボットは JS を実行しないので 0 件に見える）

---

## 11. 文字起こしから記事を作るときの安全な線

### 何が線を決めているか（一次文書）
- 違反の定義は**作り方ではなく目的と結果**: 「順位の操作が主目的で、利用者の役に立たない多数のページ」「どう作られたかを問わず」
- Google が AI の使い道として挙げているのは「調べもの」と「**元のコンテンツに構造を足すこと**」。**自分の配信という一次の素材に構造を足すのは、ここに当たる**
- 条件は「公開前に人の手で事実確認と見直し」「どう作ったかを伝える」
- 最低評価の手がかりは「手間・独自性・付加価値がほぼ無い」「広く知られた事実だけ」「1 つのページの要約でしかない」

### 線（こちらの読み。公式の文言と、落ちた事例から）

| | 安全な側 | 危ない側 |
|---|---|---|
| **ページの単位** | 人が検索する問い（街・話題）。複数の配信から、その問いに関わる所だけを集める | 配信 1 本＝1 面。日付ごと。言い換えごと |
| **枚数** | まず 1 か国で 10〜20 面。索引された割合を見て広げる | 数百面を一度に |
| **本文の核** | 本人が行って・見て・払って・言ったこと。行った日、額、短い引用、時刻つきリンク | AI の知識や他サイトの言い換えで埋めた一般論 |
| **事実** | 出どころのリンクと確かめた日。配信で言った値段は「その日の配信での話」と明示 | 確かめていない数字。AI が補った営業時間や料金 |
| **たどれること** | どの一文も、文字起こしの何分何秒か、外の出どころかに辿れる | 出どころの無い段落 |
| **人の手** | 本人が読んで直す（少なくとも国ハブと、値段・安全に関わる面） | 誰も読まずに公開 |
| **型** | 面ごとに構成が違ってよい（その街で起きたことが違うので） | 全面が同じ見出し・同じ長さ・同じ締め |
| **開示** | 「配信の文字起こしから組み、本人が見直した」を面に書く | 手で書いたように見せる |
| **薄い面** | 書くことが足りない街は、国ハブの 1 節に留める | 3 行しか無い街にも 1 面 |
| **生の素材** | 文字起こしと議事録は索引させない（`noindex` か非公開）。出すなら視聴者さんの名前を落とす | 生のまま 1,600 本を索引へ |

### 割れる所・こちらで決められない所
- **「人の手で」がどこまでか。**Google の文言は「manually」。このサイトは運営を AI が担っているので、**「本人が読む」をどの面まで求めるかは仕様の話**。機械でできるのは「一文ごとに文字起こしの時刻へ辿れることを見張る」まで
- **750 本ぶんの議事録を出すかどうか。**出すなら月の目次（いまの `/months`）にぶら下げ、**1 本ごとの面は索引させない**のが安全側。出して索引させたときにどうなるかは、やってみないと分からない
- **出す速さの上限。**Google は数字を出していない。「一度に増やすと目を付けられる」は通説

---

## 12. 分からなかったこと・情報が割れていること

**割れている**
1. **ChatGPT の検索が Bing にどれだけ寄るか。**重なりの測定は 8%〜87%。OpenAI は割合を出していない。自前の索引が育っているという報告も在る
2. **構造化データが AI の引用に効くか。**Google「不要」、Microsoft「助けになる」、対照のある測定は「効かない」（ただし、すでに引用されているページだけが対象）
3. **AI のための書き方が効くか。**論文と Bing は「引用・数字・出どころ・見出しと表」、Google は「特別な書き方は不要」。向きは同じだが、強さの言い分が違う
4. **llms.txt。**ほぼ読まれていないが、あるボットは「ほぼ全面採用」という 1 つの測定も在る
5. **AI Mode からの流入の Referer。**落ちる（不具合）と `google.com` で来る、の両方の報告
6. **AI Overviews がクリックをどれだけ減らすか。**−58%、−61%、2026 年頭に戻った、の 3 つ
7. **`ChatGPT-User` `Perplexity-User` が robots.txt に従うか。**公式は「当たらないことがある」「ふつう無視する」
8. **Google の検索プロフィールの条件。**10 万 → 3.5 万 → 1 万と報じられ、米国のみ
9. **Yahoo!検索の AI 回答の裏側。**リンクには `utm_source=openai`、発表は Vertex AI

**分からなかった**
10. **日本語での AI の引用の測定。**論文も業者の測定も、ほぼ全部が英語
11. **日本の旅行の語で AI Overviews が出る割合**
12. **2026 年のコアアップデートで、個人の旅行ブログがどうなったか**（2025-03 の 200 サイトの測定だけ）
13. **Search Console の生成 AI レポートが API や一括エクスポートに出るか**
14. **住所変更ツールが `*.web.app` のプロパティで使えるか**
15. **YouTube の埋め込みに `Clip` を付けたとき、自分の面に見どころが出るか**（文書は YouTube の概要欄を案内している）
16. **`web.app` であることの不利の大きさ**（発言は在るが数字は無い）
17. **日本語スラッグと英字スラッグの差**（測定なし）
18. **Google 日本の並びそのもの。**今日の 20 語は Yahoo!検索で引いた近似
19. **本番の HTML に本文の字が在るか**（リポジトリからは「在るはず」まで。curl はしていない）
20. **開けなかった一次情報**: OpenAI の Publishers FAQ（403）、Search Engine Land の 2 本（403）、品質評価ガイドラインの PDF 本文

---

## 付録 A. robots.txt の書き分け（訓練だけ断る場合の形。断るかどうかはオーナーの判断）

```
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: *
Allow: /

Sitemap: https://<独自ドメイン>/sitemap.xml
```

検索に出るための札（`OAI-SearchBot` `Claude-SearchBot` `Claude-User` `PerplexityBot` `Bingbot` `Googlebot` `Applebot`）は `*` の側で通る。
**全部通すなら、いまのままで何も足さなくてよい。**

## 付録 B. JSON-LD の骨（値は見える本文と同じにする）

`/about`:
```json
{"@context":"https://schema.org","@type":"ProfilePage",
 "mainEntity":{"@type":"Person","name":"<表示名>","url":"https://<ドメイン>/about",
  "sameAs":["https://www.youtube.com/channel/<ID>","https://x.com/<ID>"]}}
```

ガイド面:
```json
{"@context":"https://schema.org","@type":"BlogPosting",
 "headline":"<題>","image":["https://<ドメイン>/og/<面>.png"],
 "datePublished":"2026-11-13T09:00:00+09:00","dateModified":"2026-11-13T09:00:00+09:00",
 "author":{"@type":"Person","name":"<表示名>","url":"https://<ドメイン>/about"}}
```
＋ `BreadcrumbList`（国 → 街 → 話題）。トップに `{"@type":"WebSite","name":"<サイト名>","url":"https://<ドメイン>/"}`。

## 付録 C. 主な出どころ

Google（公式）
- AI features and your website: https://developers.google.com/search/docs/appearance/ai-features
- 生成 AI 機能への最適化の手引き（2026-05-15）: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- 生成 AI で作った内容の手引き: https://developers.google.com/search/docs/fundamentals/using-gen-ai-content
- スパム方針: https://developers.google.com/search/docs/essentials/spam-policies
- 役に立つコンテンツ: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- 文書の更新履歴: https://developers.google.com/search/updates
- 動画: https://developers.google.com/search/docs/appearance/video ／ https://developers.google.com/search/docs/appearance/structured-data/video
- 構造化データの一覧: https://developers.google.com/search/docs/appearance/structured-data/search-gallery
- Article / ProfilePage / Organization / サイト名: 上の 2 章の表
- sitemap: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- 日付: https://developers.google.com/search/docs/appearance/publication-dates
- URL: https://developers.google.com/search/docs/crawling-indexing/url-structure
- 多言語: https://developers.google.com/search/docs/specialty/international/localized-versions
- ページ体験: https://developers.google.com/search/docs/appearance/page-experience
- クローラのキャッシュ: https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers
- Google-Extended: https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers
- 引っ越し: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes ／ https://support.google.com/webmasters/answer/9370220
- Search Console の生成 AI レポート: https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
- Google からの流入の見分け: https://developers.google.com/search/docs/monitor-debug/identify-google-search-traffic
- preferred sources（ニュース寄りの機能。サブドメイン単位で可）: https://developers.google.com/search/docs/appearance/preferred-sources

AI 各社（公式）
- OpenAI: https://developers.openai.com/api/docs/bots
- Anthropic: https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- Perplexity: https://docs.perplexity.ai/guides/bots
- Apple: https://support.apple.com/en-us/119829
- Bing: https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview

Firebase（公式）
- https://firebase.google.com/docs/hosting/full-config ／ https://firebase.google.com/docs/hosting/multisites ／ https://firebase.google.com/docs/hosting/web-request-logs-and-metrics

測定・研究
- GEO（KDD 2024）: https://arxiv.org/abs/2311.09735
- Toronto 大（2025）: https://arxiv.org/abs/2509.08919
- Vercel と MERJ（AI クローラ）: https://vercel.com/blog/the-rise-of-the-ai-crawler
- Ahrefs（AI Overviews の引用と上位 10）: https://ahrefs.com/blog/ai-overview-citations-top-10
- Ahrefs（構造化データと引用）: https://ahrefs.com/blog/schema-ai-citations/
- Ahrefs（鮮度）: https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content/
- llms.txt の追跡: https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/
- 2026-08 のスパムアップデートの事例: https://gsqi.com/marketing-blog/august-2026-google-spam-update-case-studies/
- 旅行ブログ 200（2025-03）: https://www.discovercars.com/blog/march-25-google-update
