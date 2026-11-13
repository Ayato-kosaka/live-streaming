# D. 独自ドメインの取得と、`*.web.app` からの移行（調査のみ）

調べた日: **2026-11-13**。値段はすべてこの日の値。何も買っていない・設定していない・リポジトリも書き換えていない。
為替は 1 USD = 159.8 円（open.er-api.com、2026-11-13 00:02 UTC）で換算。

## 0. 先に結論

| | どこで | 名前 | 年額 | なぜ |
| --- | --- | --- | --- | --- |
| **おすすめ** | Cloudflare Registrar | `（候補名は買うまで伏せる）` | **$10.46（約1,670円）**。更新も同額 | 既にアカウントが在る／原価売りで更新が跳ねない／Whois は無料で伏せる／住所は日本でなくてよい／リポジトリの読み「あやとじま」と一致／`.com` は Google が地域を決め打ちしない gTLD |
| 次点 | Cloudflare Registrar | `（候補名は買うまで伏せる）` | $25.20（約4,030円） | 短い・配信そのものを言う。ただし 2.4 倍、プレミアム価格の可能性は買う画面まで未確認、新 gTLD はレジストリの値上げが多い |

- Cloudflare で詰まったら同じ `（候補名は買うまで伏せる）` を Porkbun（$11.81、更新同額、Whois 無料）で。
- `.jp` は **日本国内の住所が登録資格**（JPRS 規則 第8条）。住所の有無が未確認なので、今は勧めない。
- AWS（Route 53）と Google Cloud（Cloud Domains）は、**Firebase との連携の得が無い**うえに高い（下の 1 章）。
- 移行方式は **Hosting のサイトを2つに分けて、旧サイトは sitemap に載る面だけ 301**（5 章）。2段階で入れる。
- 年間の総額は **ドメイン代だけ（約1,700円）**。DNS・メール転送・証明書・Search Console は 0 円。

## 1. どこで買うか

### 値段の表（年額。左が初年度、右が更新。2026-11-13）

| TLD | Cloudflare | Porkbun | Route 53 | Cloud Domains | ムームードメイン（税込） |
| --- | --- | --- | --- | --- | --- |
| `.com` | $10.46 / $10.46 | $11.81 / $11.81 | $16 / $16 | $12 / $12 | 750円 / 1,728円 |
| `.net` | $11.86 / $11.86 | $12.52 / $12.52 | $17 / $17 | $12 / $12 | 1,848円 / 1,848円 |
| `.jp` | 扱い無し | 扱い無し | $54 / $54 | $40 / $40 | 770円 / 3,344円 |
| `.blog` | $20.20 / $20.20 | $2.06 / $21.11 | 扱い無し | $30 / $30 | 589円 / 3,278円 |
| `.travel` | $115.20 / $115.20 | $15.96 / $129.25 | 扱い無し | 表に無い | 3,532円 / 29,898円 |
| `.tv` | $25.00 / $25.00 | $26.26 / $26.26 | $36 / $36 | 表に無い | 4,378円 / 4,378円 |
| `.live` | $25.20 / $25.20 | $2.57 / $31.41 | $36 / $36 | $20 / $20 | 416円 / 4,763円 |
| `.me` | $16.56 / $16.56 | $17.27 / $17.27 | $31 / $31 | $20 / $20 | 1,016円 / 2,728円 |
| `.world` | $32.20 / $32.20 | $2.57 / $37.59 | $46 / $46 | $40 / $40 | 589円 / 6,677円 |

出どころ:
- Cloudflare: 扱う TLD は https://www.cloudflare.com/tld-policies/ （`.jp` は一覧に無い）。値段は公式の公開表が無く、Cloudflare の値段を写している第三者の表 https://cfdomainpricing.com/ （表の更新日 2026-11-13）。**確定額は買う画面に出る額。** 原価売りの宣言は https://www.cloudflare.com/products/registrar/ （"does not mark up domain prices at all"）
- Porkbun: https://porkbun.com/products/domains
- Route 53: 公式の料金表 PDF https://d32ze2gidvkk54.cloudfront.net/Amazon_Route_53_Domain_Registration_Pricing_20140731.pdf （Registration and Renewal Price の列）。扱う TLD は https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/registrar-tld-list.html
- Cloud Domains: https://cloud.google.com/domains/pricing
- ムームードメイン: https://muumuu-domain.com/domain/price （「一定割合のサービス維持調整費をいただきます」の注記あり。表の額に含まれているかは画面の切り替え次第で、確定できていない）

### 表に入れられなかったもの（情報が割れている・取れなかった）

- **Squarespace Domains**: 公式ページは「$11 - $130」と「Whois 保護は無料」までで TLD 別の表が無い（https://domains.squarespace.com/ ）。第三者の値は割れている——`.com` 初年度 $10 → 更新 $22（costgoat、2026-11-03 確認）と、登録・更新とも $12（PriceWorld、2026-02 時点）。
- **Namecheap**: 公式の料金ページは取得できず（403）。第三者の値は割れている——`.com` 更新 $18.68（costgoat 2026-10-20。2026-11-01 から $20.18 と記載）と $14.78（domainoffer 2026-10-02）。`.live` は初年度 $2.98 → 更新 $39.48、`.blog` は $3.18 → $33.18。**初年度が安く更新で跳ねる型。**
- **お名前.com**: 料金表が画面で描かれる作りで数字を取れなかった。取れたのは注記だけ——「.com 1円（2個目以降 750円）」「（ローマ字）.jp 1円（960円）」「.blog 1円（460円）」「.me 1円（530円）」、「更新料金は登録時期により異なる」「サービス維持調整費を加算」（https://www.onamae.com/service/d-regist/price.html 、https://www.onamae.com/service/d-renew/price.html ）。**更新の年額は未確認。**

### 比べどころ

| | Whois の保護 | DNS | Firebase との相性 | 支払い・本人確認で詰まる点 |
| --- | --- | --- | --- | --- |
| **Cloudflare** | 無料。氏名・メール・住所を伏せる（州と国は出る） | Cloudflare の DNS 固定（他社のネームサーバーに変えられない）。無料 | A と TXT を入れるだけ。**プロキシは切る**（4 章） | 登録者の住所・電話は要るが国は問わない・ASCII のみ。身分証は求められない。ICANN のメール確認を放置すると止まる。USD 建て |
| Porkbun | 無料 | 自前の DNS か外部 | 同上 | USD 建て。`.jp` 無し |
| Route 53 | TLD による（今日は TLD 別に未確認） | Route 53 を使うとゾーン $0.50/月 | 連携の得は無い | AWS アカウントが要る。`.com` で Cloudflare の 1.5 倍 |
| Cloud Domains | 「REDACTED_CONTACT_DATA」 | Cloud DNS（別料金）か外部。Google Domains の無料 DNS は廃止 | **連携は文書に無い** | **レジストラは Squarespace**。課金は Google Cloud の請求先 |
| ムームー / お名前 | 今日は公式で未確認 | 自前 | 同上 | `.jp` は国内住所が要る。海外からの電話認証の可否は未確認 |

出どころ: Cloudflare の登録の前提 https://developers.cloudflare.com/registrar/get-started/register-domain/ 、Whois https://developers.cloudflare.com/registrar/account-options/whois-redaction/ 、IDN 非対応 https://developers.cloudflare.com/registrar/top-level-domains/ 。Route 53 のゾーン料金 https://aws.amazon.com/route53/pricing/ 。

### 「AWS？ Google Cloud と連携してるやつ？」への答え

- **Google Domains は 2023-09-07 に Squarespace へ譲渡され、新規登録を止めた。**
- **Cloud Domains は今も新規登録できる**（FAQ: "Yes, you can continue to search and register for new domains using Cloud Domains."）。ただし **レジストラは Squarespace Domains**（"Squarespace Domains is the registrar for your domains managed by Cloud Domains."）。メール転送・ドメイン転送・移管の取り込みは 2024-01-22 に廃止。
  出どころ: https://docs.cloud.google.com/domains/docs/faq 、https://docs.cloud.google.com/domains/docs/deprecations/feature-deprecations
- **Firebase Hosting は、どこで買ったドメインでも同じ手順**（TXT と A を入れる）。Cloud Domains で買っても自動で繋がる記述は見つからなかった。**連携の得は無い。**

## 2. TLD の選びかた

### Google は TLD で順位を変えるか

- **新 gTLD も `.com` と同じ扱い。**"Overall, our systems treat new gTLDs like other gTLDs (like .com and .org)."
- **TLD に入っている語は効かない。**"Keywords in a TLD do not give any advantage or disadvantage in search."（`.travel` `.live` を選んでも検索では得をしない）
  出どころ: https://developers.google.com/search/blog/2015/07/googles-handling-of-new-top-level （2015年の記事で、ページに「古い可能性」の注記あり）
- **ccTLD は地域の強い手がかり。**`.jp` は日本向けと読まれる。gTLD は地域を持たない。
- **ccTLD 由来でも gTLD 扱いのもの**（一覧は変わりうる）: `.ad .ai .as .bz .cc .cd .co .dj .fm .io .la .me .ms .nu .sc .sr .su .tv .tk .ws`。**`.tv` と `.me` は gTLD 扱い。**`.eu` `.asia` も gTLD 扱い。
  出どころ: https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites

**あやと島にとっての意味**: 言語が日本語なので、`.com` でも日本語の検索には日本語で当たる。`.jp` の地域の手がかりは「日本に居る人向け」を強めるもので、視聴者さんが海外にも居るなら必須ではない。

### `.jp` の登録資格

JPRS「汎用JPドメイン名登録等に関する規則」第8条: 登録者は「日本国内における住所を有する個人」または国内に所在地を持つ組織。その住所を登録事項として届け出る義務がある。届出住所への内容証明が返送された場合などは登録が当然に終了しうる（第11条の2）。
出どころ: https://jprs.jp/doc/rule/rule-wideusejp.html 、https://jprs.jp/about/jp-dom/spec/

**→ 日本に郵便が届く住所が在るかどうかで決まる。未確認なので、今回は外した。**

### 日本語話者に信頼される TLD

- 根拠として見つかったのは JPRS の 2013 年の調査への言及だけ（「`.jp` は安心感・信頼性を理由に選ばれる」。ITmedia の記事経由。割合の数字は取れていない）。
- **TLD ごとのクリック率を示す、確かめられる一次資料は見つからなかった。**「`.com` と `.jp` は見慣れている」以上のことは言えない。

### 無料サブドメイン（`web.app`）のままの不利

Google の John Mueller が 2026-01 に、無料サブドメインの置き場は「スパムや手間をかけていない内容が集まる」ので評価されにくくなる、自分のドメインを勧める、と述べたと報じられている（Search Engine Journal ほか。**報道経由で、一次の発言は未確認**）。
https://www.searchenginejournal.com/googles-mueller-free-subdomain-hosting-makes-seo-harder/565249/
AI 検索での扱いについて、ドメインの種類が効くと書いた公式文書は見つからなかった。

### 日本語ドメイン（IDN）

- Google は Punycode と日本語表記を同じものとして扱う（上の 2015 年の記事）。順位の得は書かれていない。
- **Cloudflare Registrar は IDN を扱わない。**
- メールアドレスにそのまま使えない、対応していない道具が在る（販売会社の解説より。SNS で共有したときの見えかたは未確認）。
- **正のドメインにはしない。** 取るなら英字を正にして日本語のほうを転送に、だが今は要らない。

### ブランド名か、一般語か

- **完全一致ドメインのおまけは無い。**Mueller: "there's no magic EMD bonus"（2017）、キーワード入りのドメインに SEO のおまけは無く、**長く使える名前（ブランド）を選べ**（報道経由）。
  https://www.searchenginejournal.com/googles-john-mueller-cautions-against-keyword-rich-domains/479777/
- あやと島は「旅・ごはん・アプリ作り・住人」と中身が広い。`tabi` `travel` を入れると旅だけの島に見える。**ブランド名にする。**

## 3. 候補名の空き（2026-11-13）

測りかた: RDAP（`https://rdap.org/domain/<名前>`。レジストリの RDAP へ送られて 404 なら未登録）と、DNS の NS（`dns.google`。名前が無ければ NXDOMAIN）。`.jp` は JPRS の WHOIS。
対照: 登録済みの `google.net` `twitch.tv` `wordpress.blog` `visit.world` `lonelyplanet.travel` は RDAP 200。**`.jp` と `.me` は rdap.org が引けない**（`google.jp` `about.me` でも 404）ので、RDAP の 404 は証拠にしていない。

**確実な空きは、買う画面でしか分からない。** 短い名前（`（候補名は買うまで伏せる）` `（候補名は買うまで伏せる）`）はレジストリのプレミアム価格・予約の可能性があり、ここでは測れていない。

| 名前 | RDAP | DNS | 判定 | 読み・打ち・口で言う |
| --- | --- | --- | --- | --- |
| **`（候補名は買うまで伏せる）`** | 404 | 無し | **空きの見込み** | （読みは伏せる）。リポジトリの読みと一致。ハイフン無し |
| `（候補名は買うまで伏せる）` | 404 | 無し | 空きの見込み | ハイフンを口で言う必要がある |
| `（候補名は買うまで伏せる）` | 404 | 無し | 空きの見込み | 「oi」の切れ目が読みにくい |
| `（候補名は買うまで伏せる）` | 404 | 無し | 空きの見込み | 読みが違う（しま ではなく じま） |
| `（候補名は買うまで伏せる）` | 404 | 無し | 空きの見込み | ハイフン |
| `（候補名は買うまで伏せる）` | 404 | 無し | 空きの見込み | 旅だけに見える |
| `（候補名は買うまで伏せる）` | 404 | 無し | 空きの見込み | `.com` が取れないときの控え |
| `（候補名は買うまで伏せる）` | 404 | 無し | 空きの見込み | SUZURI・Doneru の `ayato_arigato` と揃うが、`-` と `_` を間違える。島の名前ではない |
| `（候補名は買うまで伏せる）` | 404 | 無し | 空きの見込み | 長い |
| `（候補名は買うまで伏せる）` | 対象外 | 無し。JPRS「該当するデータがありません」 | 空きの見込み | 国内住所が要る |
| `（候補名は買うまで伏せる）` / `（候補名は買うまで伏せる）` | 対象外 | 無し。JPRS 該当なし | 空きの見込み | 同上 |
| `（候補名は買うまで伏せる）` | 404 | 無し | 空きの見込み（プレミアム未確認） | 「あやと ドットライブ」。短い |
| `（候補名は買うまで伏せる）` | 404 | 無し | 空きの見込み（プレミアム未確認） | 「あやと ドットティーヴィー」 |
| `（候補名は買うまで伏せる）` / `（候補名は買うまで伏せる）` / `（候補名は買うまで伏せる）` | 404 | 無し | 空きの見込み | `.com` より長く高い |
| `（候補名は買うまで伏せる）` / `（候補名は買うまで伏せる）` | 404 | 無し | 空きの見込み | `.travel` は年 $115 |
| `（候補名は買うまで伏せる）` | 対象外 | 無し | DNS だけの見込み | — |
| `（候補名は買うまで伏せる）` | 200 | 駐車用の NS | **登録済み**（売り物の可能性） | — |
| `（候補名は買うまで伏せる）` / `（候補名は買うまで伏せる）` / `（候補名は買うまで伏せる）` / `（候補名は買うまで伏せる）` | 200 または NS 在り | 在り | **登録済み** | — |

Vercel の空き確認 API も試したが 403 で使えなかった。

## 4. Firebase Hosting に独自ドメインを繋ぐ

出どころ: https://firebase.google.com/docs/hosting/custom-domain

1. Firebase Console → Hosting →（サイトを選ぶ）→ **カスタムドメインを追加** → `（候補名は買うまで伏せる）`
2. 所有確認の **TXT** を DNS に入れる。**入れたまま残す**（"Firebase Hosting requires that you keep this TXT record continually present."）
3. **Quick Setup**（まだ通信の無い新しいドメイン向け）を選び、出てきた **A レコード** を入れる（文書の例は `199.36.158.100`。**画面に出た値を使う**）
4. `www.（候補名は買うまで伏せる）` も足し、**apex へ転送**にする
5. 証明書は自動。「ふつう数時間、最長24時間」。更新も自動

**apex と www のどちらを正にするか**: **apex（`（候補名は買うまで伏せる）`）を正、`www` は 301。** 口で言うとき短い。Cloudflare の DNS は apex に A を置ける。

**Cloudflare のプロキシ（橙の雲）**: **切る（DNS only）。切ったままにする。**
- Firebase の公式文書は Cloudflare のプロキシに触れていない。
- 複数の利用者報告が「プロキシを通すと証明書の発行が進まない／525 が出る」と言っている（**公式ではなく報告**）。Firebase は証明書を自動で取り直すので、あとで橙に戻すと更新のときに同じことが起きうる。
- CAA を置くなら `letsencrypt.org` と `pki.goog` を許す（公式）。

**画面を使わずに出来る範囲**:
- サイトの追加: `firebase hosting:sites:create <SITE_ID>`、`firebase target:apply hosting <名前> <SITE_ID>`（https://firebase.google.com/docs/hosting/multisites ）。1プロジェクト36サイトまで。**既定のサイト（プロジェクト ID と同じ名前）は消せない。**
- ドメインの追加: **REST に在る。**`projects.sites.customDomains.create`（v1beta1）。`redirectTarget` を付けると、そのドメインへの要求を 301 で送る。返事の `requiredDnsUpdates` に入れるべきレコードが出る。
  https://firebase.google.com/docs/reference/hosting/rest/v1beta1/projects.sites.customDomains
  **issue #147 の「CLI/API に無く Console のみ」は、REST については当たらない。** firebase-tools の CLI にドメイン追加の命令は見つからなかった。デプロイ用のサービスアカウントにその権限が在るかは未確認。
- 制約: 1つのドメインは1つのサイトにしか繋げない。

## 5. `web.app` から評価を移す（いちばん大事）

### いまの状態（本番を今日読んだ）

| | |
| --- | --- |
| `sitemap.xml` | 150 URL（22 区画。`/kitchen` 49、`/map` 25、`/nordic` 18 …） |
| 中の面の canonical | `https://live-streaming-d3cac.web.app/<道>`（絶対 URL。`/streams` `/all` `/nordic` `/kitchen` の4面で見た） |
| **表紙の canonical** | **無い**（`og:url` だけ。`site/app/page.tsx` に metadata が無い） |
| Search Console | `web.app` の URL プレフィックスのプロパティが、メタタグで確認済み（#147）。タグは本番に在る |
| `live-streaming-d3cac.firebaseapp.com` | 200。表紙は `web.app` と同じ 313,305 バイト |
| EU.org の申請 | **今日もまだ委任されていない**（`jp.eu.org` は引けて、`ayato-arigato.jp.eu.org` は NXDOMAIN） |

### 4つの方式

| 方式 | Google が評価を引き継ぐか | 手間 | 壊れかた |
| --- | --- | --- | --- |
| (i) canonical を新ドメインへ向けるだけ | 強い手がかりだが命令ではない。ドメインをまたぐ canonical は「ヒントで、可能な限り従う」。**アドレス変更ツールは使えない**（表紙の 301 が要る） | 2行＋配る | 壊れない。古い URL が検索に残りうる |
| **(ii) サイトを2つに分け、旧は 301** | **いちばん強い。**"HTTP permanent redirects if possible, such as 301 and 308" | firebase.json を配列に・配りを2本・見張りの宛先の付け替え | 規則を間違えると OBS の面が飛ぶ → 許可リスト方式で避ける（下） |
| (iii) Functions / Cloud Run で Host を見て 301 | 301 なので引き継ぐ | 大。**実ファイルは rewrite より先に配られる**ので、静的な面には関数が挟まらない | 静的な配信を捨てることになる。**やらない** |
| (iv) JS でリダイレクト | 「サーバー側もメタ更新も出来ないときだけ」。描画に失敗すると見てもらえない | 小 | 一瞬古い面が出る。**(ii) が出来るので使わない** |

出どころ:
- 301 と JS の扱い: https://developers.google.com/search/docs/crawling-indexing/301-redirects
- canonical の強さ（リダイレクトと canonical は強い手がかり、sitemap は弱い。重ねると効く）: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- ドメインをまたぐ canonical: https://developers.google.com/search/blog/2009/12/handling-legitimate-cross-domain （古い記事）
- Hosting の配る順（`/__/*` → redirects → 実ファイル → rewrites → 404）と、redirect の書きかた: https://firebase.google.com/docs/hosting/full-config

### おすすめ: (ii) を2段階で

**ホスト名ごとの redirect は書けないが、サイトごとの構成は別に持てる**（"Each site has its own hosting configuration."）。`web.app` と `firebaseapp.com` は既定のサイトに付いているので、**既定のサイトを「旧」、新しく作るサイトを「本体」にする。**

**段階 A（買った日〜翌日。何も壊れない）**
1. 新しいサイトを作り、**独自ドメインは最初から新しいサイトに繋ぐ**（あとでサイト間を移すと証明書の取り直しで止まる時間が出るため）
2. `firebase.json` の `hosting` を2つの的の配列にする。**この時点では中身は同じ**（同じ `dist` を両方に配る）
3. `metadataBase` と `SITE.url` を新ドメインへ。canonical・`og:url`・sitemap・robots が全部切り替わる。表紙に canonical を足す
4. Search Console にドメインプロパティを足し、sitemap を出す

**段階 B（新ドメインが健康だと確かめてから。目安3〜7日後）**
5. 旧サイトの構成に、**sitemap に載っている区画だけ**を新ドメインへ 301 する規則を足す
6. 見張りの宛先を新ドメインへ
7. Search Console の「アドレス変更」を出す

**なぜ「載っている面だけ」か（許可リスト）**: OBS の `/alertbox` `/daily_user_stats` `/ve-comment` `/ve-postit`、配信に映す `/roulette`、月末の `public/*.html`、`/island-api/**`、ログインの `/__/auth/*` は **sitemap に無い**。載っているものだけを送れば、**動かせない URL には規則がそもそも当たらない。**（`/__/*` は redirect より先に配られるので、どう書いても壊れない）

**規則は、区画の前方一致ではなく、sitemap の URL 1本ずつの完全一致で作る（150本）。**
区画（`/goods/**` `/nordic/**`）でまとめて送ると、**同じ道の下に在る実ファイルまで 301 になる**——今日数えたら `site/public/goods` に92枚、`site/public/nordic` に9枚、`site/public/bulgaria` に2枚、`public/nordic/review.html` が在った。旧ドメインに残る面がこれらを読んでいると、絵は跳んだ先から出るが、`fetch` はドメインをまたぐので落ちうる。

```json
{ "source": "/",                 "destination": "https://（候補名は買うまで伏せる）/",                 "type": 301 },
{ "source": "/kitchen",          "destination": "https://（候補名は買うまで伏せる）/kitchen",          "type": 301 },
{ "source": "/kitchen/<レシピ>", "destination": "https://（候補名は買うまで伏せる）/kitchen/<レシピ>", "type": 301 }
```

**手で書かず、sitemap から作る**（面が増えたら規則も増える。数が合わなければ落ちる見張りを付ける）。

試すまで分からないこと（**未検証。プレビューチャンネルで試してから**）:
- 150本の規則をそのまま受け付けるか（公式文書に本数や構成の大きさの上限は書かれていなかった）
- クエリ（`?id=`）が引き継がれるか
- いまある内部の redirect（`/nordic/photos` → `/cards` など）と合わせて2回跳びにならないか（旧サイトでは行き先を新ドメインの最終の道に直す）

本数が通らなかったときの控えは正規表現1本（`"regex": "^/(about|all|…|updates)(/.*)?$"` → `"https://（候補名は買うまで伏せる）/:1:2"`）だが、上の実ファイルを巻き込むので、その場合は実ファイルの置き場を先に動かす。

確かめかた: 旧サイトの構成をプレビューチャンネルに配り、(a) sitemap の150面が **301 一発で** 新ドメインの同じ道に着く (b) OBS の4面・`/roulette`・`/me`・`/__/auth/handler`・`/island-api/*`・月末のページが **200 のまま**、を数える。

### アドレス変更ツール

出どころ: https://support.google.com/webmasters/answer/9370220

- 「ドメインの階層」のプロパティで使える。例に `example.com`、`m.example.com`、`http://example.com` が挙がっている。**パスの階層は不可。**
  → `https://live-streaming-d3cac.web.app/` は**サブドメインの根なので、文言上は当てはまる。**`web.app` のような置き場のサブドメインで使えたという一次資料は見つからなかった。**確定は画面を開いたとき。**
- 両方のプロパティの所有者で、**同じ Google アカウント**であること
- 事前の検査で **表紙の 301** を見る。致命的な検査に落ちると出せない → **方式 (i) では使えない**
- 効くのは 180 日。その間 301 を残す（サイト移転の文書は「少なくとも1年」）
- サブドメインは別々に出す（`firebaseapp.com` も確認して出せる。任意）

**旧プロパティの所有確認が外れないようにする**: 表紙を 301 にすると、メタタグは「転送された先のページ」で探される（新ドメインにも同じタグが在れば通る見込み。ドメインをまたぐ場合の明記は無い）。**HTML ファイル方式も足しておく**（ファイルは転送をまたいで探されないので、旧サイトに実ファイルで置けば 301 の影響を受けない）。
出どころ: https://support.google.com/webmasters/answer/9008080

### `firebaseapp.com` の扱い

既定のサイトのもう1つの名前で、止められない。**旧サイトの 301 は両方の名前に同じく効く**ので、段階 B で一緒に片づく。段階 A のあいだは canonical が新ドメインを指す。

### 標準の手順と、かかる期間

出どころ: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes

- 新サイトを用意 → URL の対応表 → 301 → 見守る。小〜中のサイトは一度に移す
- canonical は新 URL の自己参照に。内部リンクも新 URL に。新しい sitemap を出す
- **期間**: 小〜中のサイトで「大半の面が数週間」
- **順位の揺れ**: "Expect temporary fluctuation in site ranking during the move."
- 301 は少なくとも1年。あやと島は旧サイトを OBS のために残すので、**ずっと残る**
- 行き先は対応する面へ。まとめて表紙へ送らない。連鎖させない

### いま検索に載っている量

**数は測れなかった。**
- 手元の検索の道具は `site:` を演算子として扱わなかった（無関係な結果が返る）
- 検索エンジンを直に叩くのは、この箱の権限で止められた
- 代わりに名前で4回探した（「あやと島 案内鳥…」「"あやと島" "あやとと愉快な仲間達"」「"live-streaming-d3cac.web.app"」、深いほうの検索で「"live-streaming-d3cac.web.app" あやと島」）。**サイトの面は1つも出なかった。** URL に当たったのは公開リポジトリの issue と PR だけ（9件）
- この道具は米国向けなので、**日本の Google に載っていない証拠にはならない。弱い状況証拠。**

**確かな数は Search Console に在る**（`web.app` のプロパティは確認済み）→「ページ」の登録済み件数と、「検索パフォーマンス」の表示回数。1分。**ここが 0〜数件なら「移す評価はほぼ無い＝移行は軽い」と言える。**その場合でも (ii) を勧める理由は、YouTube の概要欄などに残る古いリンクから来た人を新ドメインへ送れることと、アドレス変更ツールが使えること。

## 6. 独自ドメインにしたら一緒に直るもの・要るもの

| | 何をするか | 出どころ |
| --- | --- | --- |
| **Google OAuth のブランド確認**（#147 の本題） | 要件は「ホームページが自分の確認済みドメインに在る」「プライバシーポリシーが同じドメイン」「Authorized domains の全部を Search Console で所有確認」。ドメインプロパティ（DNS の TXT）が取れるので、#147 のエラー「is not registered to you」の原因が消える見込み。同意画面のホーム・プライバシー・Authorized domains を新ドメインに替えて Verify branding | https://support.google.com/cloud/answer/13464321 |
| Firebase Auth の許可ドメイン | Authentication → 設定 → 承認済みドメインに新ドメインを足す。Hosting に繋いだら自動で入る、という記述は見つからなかった（**手で足す前提**）。島は `signInWithPopup` で `authDomain` は `firebaseapp.com` のままなので、コードは変えなくてよい | https://firebase.google.com/docs/auth/web/redirect-best-practices |
| メール | **Cloudflare Email Routing で無料転送できる。**1ドメイン200規則・転送先200件・25MiB まで。**受け取りと転送だけ**（そのアドレスから送るのは別の仕組み） | https://developers.cloudflare.com/email-routing/ 、https://developers.cloudflare.com/email-routing/limits/ |
| Bing Webmaster | Search Console からの取り込みで確認できる（Bing 公式ブログ）。ほかに DNS の CNAME・メタタグ・XML ファイル。**Bing の現行のヘルプは読めず、公式ブログと解説記事から** | https://blogs.bing.com/webmaster/september-2019/Import-sites-from-Search-Console-to-Bing-Webmaster-Tools |

### 一緒に起きる困りごと（調べていて見つけた）

- **端末の中の記録が引き継がれない。**`localStorage` はドメインごと。島は16ファイルで使っていて、鍵は `WALKED` `VISITED` `HEARTED` `MET` `SEEN` `MY_PLANS` `POLL_MINE` `VISIT_MINE` `FORK_MINE` など。**新ドメインでは、歩いた記録・いいね済み・会った住人が空から始まる。**ログインして Firestore に在るものは無事。ログインし直しは1回要る。
  手はある（新ドメインの初回に、旧ドメインの小さな受け渡しページへ一度だけ行って、記録を URL の `#` に載せて戻る。埋め込み iframe ではブラウザの保存領域の分離で読めない）。**やるかどうかは設計の判断として残す。**
- **API キーのリファラ制限と Storage の CORS は未確認**（この箱の gcloud は認証されておらず読めなかった）。キーが `web.app` だけに絞ってあれば新ドメインで Firestore / Auth が失敗する。**繋いだ直後に新ドメインを一周すれば分かる。**
- Functions の側に Origin の許可リストは無い（`Access-Control-Allow-Origin: *` が4本）。変更不要。
- 新しいサイトにも `<SITE_ID>.web.app` が勝手に付く。canonical で新ドメインに寄せる。

## 7. 年間の総額（おすすめ構成）

| | 年額 |
| --- | --- |
| `（候補名は買うまで伏せる）`（Cloudflare Registrar） | $10.46（約1,670円） |
| DNS（Cloudflare Free） | 0 |
| メール転送（Email Routing） | 0 |
| Firebase Hosting の独自ドメインと証明書 | 0（サイトが2つになるぶんの保存は今の課金の中。量は未計測） |
| Search Console / Bing Webmaster | 0 |
| **計** | **約1,700円/年**（＋カードの外貨手数料） |

次点の `（候補名は買うまで伏せる）` なら約4,030円/年。

## 8. オーナーにしか出来ない操作（順番つき）

**本当に本人でないと出来ないのは 1〜3 だけ。**4 以降は Google / Cloudflare の画面の操作で、EC2 の Chrome から代わりに進められる見込み（#147 で Cloudflare のゾーンはそうして作った）。本人の手が要るのは 2 段階認証の確認が出たときだけ。

| # | 操作 | どこで | 分 | 本人でないと |
| --- | --- | --- | --- | --- |
| 1 | 名前を決める（`（候補名は買うまで伏せる）` でよいか） | — | 1 | ○ |
| 2 | 買う: Domain Registration → Register Domains → 検索 → 登録者情報（氏名・住所・電話・メール、ASCII）→ カード | Cloudflare | 10 | ○（カード・個人情報） |
| 3 | ICANN の登録者メールの確認リンクを押す（放置すると止まる） | メール | 1 | ○ |
| 4 | （任意）DNS 編集だけの API トークンをそのゾーン限定で発行 → GitHub Secret へ。以後の DNS はこちらで入れられる | Cloudflare | 5 | — |
| 5 | サイトを足し、独自ドメイン（apex と www）を追加。出た TXT と A を Cloudflare に **DNS only** で入れる | Firebase Console / Cloudflare | 10 | — |
| 6 | 承認済みドメインに新ドメインを足す | Firebase Console → Authentication | 1 | — |
| 7 | プロパティを追加 →「ドメイン」→ TXT を入れて確認 → sitemap を送る | Search Console | 5 | — |
| 8 | 旧プロパティ（`web.app`）に HTML ファイルの確認方式を足す（ファイルを受け取り、こちらが配る） | Search Console | 3 | — |
| 9 | Branding のホーム・プライバシー・Authorized domains を新ドメインへ → Verify branding。OAuth クライアントの JavaScript 生成元にも足す | Google Cloud Console | 5 | — |
| 10 | 段階 B のあと: 旧プロパティ → 設定 → アドレス変更 → 新プロパティを選ぶ | Search Console | 3 | — |
| 11 | Search Console から取り込み | Bing Webmaster | 3 | — |
| 12 | Email Routing を有効に → `hello@` → 転送先の確認メールを押す | Cloudflare / メール | 5 | 確認メールは ○ |
| 13 | 使わなくなった `ayato-arigato.jp.eu.org` のゾーンを消す | Cloudflare | 2 | — |

**OBS は何も変えない。**

## 9. こちら（リポジトリ側）でやる作業

`grep -rn "live-streaming-d3cac" --include=*.ts --include=*.tsx --include=*.py --include=*.mjs --include=*.yml --include=*.json . | grep -v node_modules` の結果（2026-11-13）:

| | 行 | ファイル |
| --- | --- | --- |
| **全部** | **156** | **109** |
| うち `live-streaming-d3cac.web.app`（URL） | 67 | 56 |
| うち `firebaseapp.com`（`site/lib/firebase.ts` の `authDomain`） | 1 | 1 |
| うち Storage のバケット名 | 11 | — |
| 残り（プロジェクト ID。BigQuery など。**触らない**） | 77 | — |

`web.app` の 67 行の置き場: `tools/` 47、`python/` 13、`.github/` 3、`site/` 2、`public/` 1、`.claude/` 1。
拡張子を絞らずに数えると 105 行（`.md` 11、`.html` 3 などが加わる）。

| 作業 | 場所 |
| --- | --- |
| **島の正の URL（2か所だけ）** | `site/app/layout.tsx:40`（`metadataBase`）、`site/content/site.ts:9`（`SITE.url`）。#147 の記録どおり、今も2か所 |
| 表紙に canonical を足す | `site/app/page.tsx`（いまは metadata を持っていない） |
| Hosting を2つの的に | `firebase.json`（`hosting` を配列に）、`.firebaserc`（targets）、`firebase-hosting-deploy-prod.yml`（101行目の `action-hosting-deploy` に `target` を渡して2回） |
| 旧サイトの 301 を sitemap から作る道具と、その見張り | 新規。対照は「OBS の面が 200 のまま」「載っている面が 301 一発」の両側 |
| 見張りの宛先 | `tools/sprites/prod.mjs:31`・`prodsweep.mjs:150`・`notfound.mjs:90` は `process.env.ORIGIN \|\|` の既定値。ほかに `tools/sprites` の直書き、`python/seo_audit.py:91`、`.github/workflows/alert_watch.yml:161`・`heavy_watch.yml:224` |
| **触らないもの** | `public/` の OBS 向けページの中の `web.app`（旧のまま動く）、`authDomain`、プロジェクト ID |
| 手引き | `docs/island-routing.md`（配る順に「旧サイトの 301」が加わる）、`docs/island-api.md`、スキル5本、`tools/sprites/README.md` |
| issue | #147 の方針（EU.org）を「買う」に改める。完了条件のうち EU.org の行を差し替える |

## 10. 分からなかったこと・割れていること

- **いま検索に載っている面の数**（測れなかった。Search Console で1分）
- `（候補名は買うまで伏せる）` `（候補名は買うまで伏せる）` がプレミアム価格か（買う画面でしか分からない）
- Cloudflare の確定額（公式の公開表が無い。第三者の表の値）
- Squarespace と Namecheap の `.com` の更新額（第三者の値が割れている）、お名前.com の更新額（取れなかった）
- ムームードメインの表の額に調整費が入っているか
- お名前.com / ムームーの Whois 代行の料金と、海外からの電話認証の可否
- アドレス変更ツールが `web.app` のサブドメインで実際に通るか（文言上は該当）
- 表紙を 301 にしたとき、メタタグ方式の所有確認がドメインをまたいで通るか（HTML ファイル方式を足して備える）
- Firebase の redirect が150本の完全一致を受け付けるか、クエリを引き継ぐか（試す）
- デプロイ用サービスアカウントで `customDomains.create` が通るか
- API キーのリファラ制限、Storage の CORS
- オーナーに日本の住所が在るか（`.jp` を考えるなら）
- TLD ごとのクリック率、AI 検索での独自ドメインの効き（確かめられる一次資料なし）
- Cloud DNS の料金（今日は確認していない）
