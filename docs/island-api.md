# あやと島 — API（`/island-api/*`）

島の「動くところ」を読み書きする口。**ブラウザから Firestore を直接は触らせない**
（`islandHere` だけが例外。理由は [`island-db.md`](./island-db.md) の責務の表）。

- 実体は Cloud Functions の `islandApi`（`functions/src/index.ts` が出している）。
  ルーティングは `functions/src/islandApi.ts` の1本の関数の中で、
  `method` と `path` を上から順に照合している。Express のルータは使っていない
- 口の枝は3つのファイルに分かれている。`cards.ts`（`/cards`）、
  `donors.ts`（`/donors`）、`remote.ts`（`/remote`）
- 入れ物（コレクション）の設計は [`island-db.md`](./island-db.md)。
  **この文書は口の一覧で、データの設計ではない**

## 誰が

| 表記 | 意味 | 見ているもの |
| --- | --- | --- |
| 誰でも | ログイン不要。端末ID（`cid`）で数える | `body.cid` |
| ログイン済み | Firebase の ID トークンが要る | `Authorization: Bearer …` を `verifyIdToken` |
| あやとだけ | `islandUsers/{uid}.admin === true` | `ownerUid(header)` |

ログインしていない人は端末IDで、ログインした人は uid で数える
（連投の上限も、1人1回のハートも、同じ鍵で数える）。

---

## 1. 島の状態

| メソッド | パス | 誰が | 何を |
| --- | --- | --- | --- |
| `GET` | `/state` | 誰でも | 島を開いたときの一式（下） |
| `GET` | `/fund` | 誰でも | 北欧旅の足代。**合計と人数だけ**。個人の額も順位も返さない |
| `GET` | `/fund/history` | あやとだけ | スパチャの控え1ページぶん（`islandFundSuperChats`）。`?limit=`（既定30・最大60）・`?before=`。**キャッシュしない** |
| `POST` | `/current` | あやとだけ | いまいる場所・ひとこと・今週やること・テーマ。**`week` は送られてきたときだけ書く** |
| `POST` | `/nordic/arrived`<br>`/nordic/ended` | あやとだけ | 着いた日／旅が終わった日。空で送ると取り消し |

**`/fund` と `/fund/history` は、開き方がまったく違う。**
前者は合計だけなので誰でも読めて CDN にも焼く。後者は**投げ銭して
くれた人の名前と額が1件ずつ**並ぶので、あやと以外には 403 を返し、
`Cache-Control: no-store` を付けて誰の手元にも残さない。
控え（`islandFundSuperChats`）は `firestore.rules` でも閉じてある。
確かめかたは `node tools/fund/ownercheck.cjs`（本番も Firestore も触らない）。

### 1.1 豚の貯金箱の出し入れ（`/fund/…`。あやとだけ）

中身は `functions/src/fundDesk.ts`。画面は `/me/desk` の「貯金箱」。
**8本とも `ownerUid` を通る。** `Cache-Control: no-store`。

| メソッド | パス | 何を |
| --- | --- | --- |
| `GET` | `/fund/desk` | 焼き直しの合計＋Doneru＋出費の1ページ目（20件）＋目標ぜんぶ |
| `GET` | `/fund/spends` | 出費の続き。`?limit=`（既定20・最大120）・`?before=`（`<日付>_<書類ID>`） |
| `POST` | `/fund/spends` | 出費を1行。`{day, title, yen}` |
| `DELETE` | `/fund/spends/{書類ID}` | 出費を1行消す |
| `POST` | `/fund/goals` | 目標をはじめる。`{from, label, yen}`。**書類IDは `from`** |
| `POST` | `/fund/goals/{from}/close` | 目標をおわりにする。`{to}`。**消さない**（台帳に残る） |
| `DELETE` | `/fund/goals/{from}` | 打ち間違えた目標を消す |
| `POST` | `/fund/chats` | 取りこぼしたスパチャを1件。`{day, yen, who}` |
| `DELETE` | `/fund/chats/{書類ID}` | スパチャの控えを1件消す |

決めごとは4つ。

1. **2回入れても増えない。** 書類IDが中身から決まる（`python/fund_box.py`
   の `spend_id` / `manual_id` と**同じ式**）。返事の `already` が
   「前から在った行を上書きしただけ」を言う
2. **消すのは書類IDを指したときだけ。** まとめて消す道は無い。
   行き先を指さない `DELETE` は 405
3. **入らないもの** — 0円以下・小数・1,000万円超・空の題・
   形の違う日付・**暦に無い日**（`2026-02-31`）
4. **書いたら `island/state.fund.box` を焼き直す。** 島の豚も配信の豚も
   そこを読んでいる（#305）ので、焼き直さないと次の晩まで額が動かない。
   **焼き直しは台帳を数え直すだけで、新しい正を作らない。**
   こけたときは返事の `box` が `null`（台帳への書き込みは取り消さない）

確かめかたは3本、どれも毎 PR で走る（本番も Firestore も触らない）。

| | 見るもの |
| --- | --- |
| `functions/selftest/fund_owner_selftest.mjs` | **本物の `ownerUid` を通して** 5とおり × 9本。403 と「1バイトも書いていない」まで |
| `functions/selftest/fund_desk_selftest.mjs` | 2回入れても増えない・入らないものが入らない・消すのは書類IDだけ・焼き直しの数 |
| `functions/selftest/fund_docid_selftest.mjs` | **Python と TypeScript の書類IDが1文字も違わない** |

`GET /state` が返すもの（`site/lib/api.ts` の `IslandState`）:

| 鍵 | 中身 |
| --- | --- |
| `current` | いまどこ・ひとこと・今週・テーマ |
| `stats` | 配信本数・日数・コメント数・のべ人数・常連の数・直近5本 |
| `notes` | テーマ付箋の新着（最大200件） |
| `residents` | 名前かアイコンを出してよいと言った人だけ。**チャンネルIDも uid も返さない**（下） |
| `residentDays` | **キャラクターの書類ID** → 一緒にいた日数。読めなかったときは `null` |
| `nordic` | `arrivedOn` / `endedOn` |
| `more.notes` | まだ古い付箋が残っていれば、その続きの位置 |

**`residents[]` は、チャンネルIDも uid も返さない**（#133）。返す欄は4つ。

| 欄 | 中身 | なぜこの形か |
| --- | --- | --- |
| `here` | uid を潰した16字（sha256 の頭） | 「いま島にいる人」を結ぶ鍵。**逆は引けない** |
| `icon` | キャラクターの書類ID | 絵を引くのはサーバー（`islandCharacter.channelId`）。図鑑に結ばれていない人は無い |
| `name` | 出してよいと言った名前 | 言っていなければ `null` |
| `photo` | 出してよいと言ったアイコン | 同じ |

**この一覧に載る条件は「名前か顔を出してよい」で、「チャンネルを教えてよい」ではない。**
`channelId` は `youtube.com/channel/UC…` を開けば本人の顔と名前に直結する字なので、
公開のカードからも（`docs/island-incident-2026-09-14-cards.md` 8-2）、日数の鍵からも
（#115）落としてある。**ここだけ残っていた。**
向こう側が使っていたのは絵を引くためだけなので、引いた答え（`icon`）を返す。

**uid を返していたのは、突き合わせの鍵になるから外した。** 2026-09-17 の実測で、
`GET /nextplans` が返していた `byUid` をここの `uid` で引くと、**企画の画面には
名前を出していないのに、出した人の名前と顔が分かった**（1人ぶん・2件）。
口を2つ叩けば済む形だった。かわりに `here`（uid を潰した字）を返す。
居場所（`islandHere/{uid}`）の書類IDを読む側が同じように潰して突き合わせる
（`site/lib/hereRest.ts`）。**この字から `islandHere/{uid}` は書けないし、
uid を鍵にしている他のどこにも当たらない。**

**`residentDays` の鍵はチャンネルIDではない。** 前はそうだったが、
チャンネルIDは `youtube.com/channel/UC…` を開けば本人の顔と名前に直結するので、
ログインなしで「このチャンネルの人は N 日来ている」が誰にでも読めていた。
しかも `orderBy("days").limit(60)` で上位を返していたので、**キャラクターを
作っていない人**——島に何も出していない人——まで混ざっていた。
いまはキャラクターの書類ID（`GET /characters` の `id`・図鑑の絵の id）を鍵に、
**`islandCharacter.channelId` で結べている人ぶん**だけを返す。
図鑑がもともと見せている「この絵の人は N 日」より細かいことは言わない。

**載っていないことは「0日」ではない。** `channelId` で結べていない人は
ここに出ない。画面は数の無い人の欄を出さない（`docs/island-misses.md` #115）。
**読めなかったときは `null`。** `{}` と同じ顔で返すと、落ちた日に
図鑑ぜんぶが「数の無い人」に見える。

**`stats.latest[]` の鍵は `videoId` ではなく `video_id`。**
BigQuery の `SELECT AS STRUCT video_id, …` をそのまま焼いているため
（`python/island_daily_stats.py`）。

## 2. 企画（`islandStreamEvent`）

**口の名前は `/nextplans` のまま。** 入れ物は #202 で `islandStreamEvent` に
改名したが、口を同じ日に変えると、Functions と Hosting が別々に出る日に
掲示板がまるごと 404 になる。

| メソッド | パス | 誰が | 何を |
| --- | --- | --- | --- |
| `GET` | `/nextplans` | 誰でも | 一覧。`?archived=1` は**あやとだけ**。`?events=1` で運営側の企画（`board: false`）も混ぜる |
| `GET` | `/nextplans?mine=1` | ログイン済み | **自分が出した企画だけ。** 未ログインは 401。`Cache-Control: no-store` |
| `GET` | `/nextplans/:id` | 誰でも | 1件（育てる画面が続きを書くために引く） |
| `POST` | `/nextplans` | 誰でも | 出す。**題だけでいい**（4字以上・60字まで／1日12件） |
| `POST` | `/nextplans/:id` | 出した人 | 育てる。**送った中身でまるごと置き換わる**。あやとは時間制限を越えて書ける |
| `POST` | `/nextplans/:id/heart` | 誰でも | ハート。**もう一度押すと外れる**（1日120回） |
| `POST` | `/nextplans/:id/status` | あやとだけ | 段を動かす。`planId` で Git 側の企画に結ぶ |
| `POST` | `/nextplans/:id/videos` | あやとだけ | この企画のものだと決めた配信。URL を貼ってもよい |
| `POST` | `/nextplans/:id/archive` | あやとだけ | しまう・戻す。**消えない** |

1件 12,000 バイトまで（`JSON.stringify(body).length`）。

**一覧は、出した人を返さない**（#133）。返すのは `byLogin`（ログインして出した
ものかの1ビット）だけで、**誰が出したかは分からない。** 前は `byUid` に uid が
そのまま入っていて、`/state` の `residents[].uid` と突き合わせると出した人の
名前と顔が分かった。

| | `GET /nextplans` | `GET /nextplans?mine=1` |
| --- | --- | --- |
| 誰が | 誰でも | ログイン済み（未ログインは 401） |
| 何を | 掲示板に出るぜんぶ | **その人が出したものだけ** |
| 誰のぶんかの決め方 | — | `uid`。**送られてきた値は見ない** |
| 持ち主 | `byLogin: true` だけ（**誰かは返らない**） | 同じ（自分のものしか入らない） |
| 掛け値 | `public, max-age=15, s-maxage=30` | **`no-store`** |

**呼んだ人ごとに中身の変わる答えを、同じ URL で返さない。** `/nextplans` は
CDN に載る口なので、載せると混ざって他人の答えが配られる。だから URL を分けて
（`?mine=1`）、`no-store` を付ける。付箋の `?mine=1`（4章）とカードの
`/cards/mine`（3章）と同じ形。

**「じぶんが出したもの」は、これと端末の控えの合わせ技。** ログインせずに
出したぶんは `cid` でしか分からないので、そちらは今までどおり画面側の
localStorage で見分ける（`site/lib/api.ts` の `myPlans`）。

**あとから直せるのは誰か:**

| 出したとき | 直せるのは |
| --- | --- |
| ログインしていた（`uid` がある） | その `uid` の人だけ。いつでも |
| ログインしていなかった | 同じ `cid` の端末だけ。**出してから24時間だけ** |
| — | あやと（`admin`）はいつでも |

## 3. 企画に付く写真とカード

| メソッド | パス | 誰が | 何を |
| --- | --- | --- | --- |
| `GET` | `/streamevents?day=YYYY-MM-DD` | 誰でも | **その日に立っている企画**。1日に何本でも立つので配列 |
| `GET` | `/streamevents/:id/images` | 誰でも | その企画の画像 |
| `POST` | `/streamevents/:id/images` | あやとだけ | 画像を貼る。**貼った時点でカードも作る**（1日120枚） |
| `POST` | `/streamevents/images/:id` | あやとだけ | どの企画のものかを付け替える。カードも作り直す |
| `DELETE` | `/streamevents/images/:id` | あやとだけ | 画像を消す。**カードも実体も消える** |
| `GET` | `/nordic/photos` | 誰でも | 旧・日付から入る道。`days[].people[]` は**絵と名前だけ**（`channelId` は返さない） |
| `POST` | `/nordic/photos` | あやとだけ | 旧・日付から貼る。**中で新旧どちらの入れ物にも書く** |
| `DELETE` | `/nordic/photos/:id` | あやとだけ | 旧・消す |
| `GET` | `/cards` | 誰でも | 配られたカード。**`channelId` を返さない**。名前は出してよいと言った人ぶんだけ |
| `GET` | `/cards/mine` | ログイン済み | **自分のカードだけ。** 未ログインは 401。`Cache-Control: no-store` |
| `POST` | `/cards/:cardId` | 本人 | 自分のカードを動かす（`cardId` は `<画像のID>__<チャンネルID>`。**`/cards/mine` から取る**） |

**書く口を当分2つ動かしているのは、旅で毎日使っているものを出発直前に
作り替えないため**（#202 の順番）。`POST /nordic/photos` は中で新旧の両方に書く。

**カードを読む口が2つあるのは、`/cards` が「誰が、いつ投げ銭したか」に
なってしまうから。** カードは投げ銭の台帳からしか作られないので、
1枚ごとに `channelId` と `day` を返すことは「そのチャンネルがその日に
投げ銭した」と言うのと同じ。`/me`（`site/components/me/MyPage.tsx`）が
自分の1枚を出すためだけに、それを全ブラウザへ配っていた。

| | `GET /cards` | `GET /cards/mine` |
| --- | --- | --- |
| 誰が | 誰でも | ログイン済み（未ログインは 401） |
| 何を | 島じゅうのカード（最大600枚） | **その人のカードだけ** |
| 誰のぶんかの決め方 | — | `islandUsers/{uid}.channelId`。**送られてきた値は見ない** |
| チャンネルが結ばれていない人 | — | `{cards: []}` を 200 で返す（500 にしない） |
| `channelId` | **返さない**（欄ごと無い） | 返す |
| `id` | `<画像のID>__<絵>__<通し番号>`。**人を指さない** | 本当のカードID |
| それ以外の欄 | 同じ | 同じ |
| 1日の上限 | 無い（読むだけ） | 無い（読むだけ） |
| 掛け値 | `public, max-age=30, s-maxage=60` | **`no-store`**（CDN にも中間にも置かせない） |

**`/cards` から `channelId` を落とすだけでは足りない。** 書類IDが
`<画像のID>__<チャンネルID>` なので、**欄を消しても ID から読める。**
だから公開の `id` も差し替えてある。入れてよいのは「その応答の中で一意」
「同じ中身なら毎回同じ」「人を指さない」の3つだけで、使い道が
**React の key しかない**（`POST /cards/:cardId` は画面のどこからも呼ばない）。
絵（`icon`）は同じ応答でもう公開しているので、そこに新しい情報は足さない。
**チャンネルIDのハッシュにはしない**——同じ人だと分かる印を新しく作ってしまう。

`/cards/mine` はログインした人ごとに中身が違うので、`s-maxage` に載せては
いけない。載せると他人のカードが誰かの手元に届く。

確かめは2本。`/cards/mine` が `POST /cards/:cardId` の照合式に食われない
ことは本体から正規表現を切り出して見ている
（`node functions/selftest/cards_mine_selftest.mjs`）。公開の応答に
`UC` で始まる字が1つも無いこと・公開の `id` が重複しないこと・
`/cards/mine` には残っていること・**写真に入れられる人が1人も変わらない**
ことは `node functions/selftest/cards_public_selftest.mjs`。

## 4. 付箋

**入れ物は1つ（`islandNotes`）で、口が2つある。** 画面が切り替わっている途中の日に、
両方が混ざったものが両方の画面に出るのを止めるため。旧来のぶんが移り終わったら
（#162）`/notes` を畳む。

| メソッド | パス | 誰が | 何を |
| --- | --- | --- | --- |
| `GET` | `/notes` | 誰でも | **企画に**貼られた付箋（旧。移行待ち） |
| `POST` | `/notes` | 誰でも | 企画に付箋を貼る（120字まで／1日20件） |
| `GET` | `/stickies` | 誰でも | **テーマに**貼られた付箋。`?theme=` で1つ、無ければ横断の新着。`?archived=1` は**あやとだけ** |
| `POST` | `/stickies` | 誰でも | テーマに付箋を貼る（1日20件） |
| `POST` | `/stickies/:id/heart` | 誰でも | ハート。**もう一度押すと外れる**（1日120回） |
| `POST` | `/stickies/:id/reply` | あやとだけ | 返信する。空で送ると取り消し |
| `POST` | `/stickies/:id/archive` | あやとだけ | しまう・戻す。**消えない** |

## 5. おたずね・わかれ道・訪問

**`islandPolls` は2つの用途に相乗りしている。** `at` を持つ書類は「わかれ道」
（`/fork`）、持たない書類は「今夜のおたずね」（`/poll`）。どちらの口も、
自分の担当でないほうを読み飛ばす。

| メソッド | パス | 誰が | 何を |
| --- | --- | --- | --- |
| `GET` | `/poll` | 誰でも | 今夜のおたずね |
| `POST` | `/poll/:id/vote` | 誰でも | 投票（1日30回） |
| `GET` | `/fork` | 誰でも | わかれ道の票数だけ |
| `POST` | `/fork/:id/vote` | 誰でも | 投票（1日30回） |
| `POST` | `/visit` | 誰でも | その日の訪問者を1つ数える。**1人1日1回** |

## 6. 旅の日記 ── **ここには無い**

その日に起きたことは `site/content/nordic.ts` の `NORDIC_LOG`（焼き込み）で、
口を通らない。あやとが送ってきた一言を、受け取った側が焼いて出す
（`docs/nordic-depart.md` 2章）。`GET`/`POST`/`DELETE /nordic/log` は外した。

## 7. ログイン

| メソッド | パス | 誰が | 何を |
| --- | --- | --- | --- |
| `POST` | `/me` | ログイン済み | 島での見え方を保存する（`nickname` / `showName` / `showPhoto`） |

**キャラクターは本人に選ばせない。** 誰にどの絵かはあやとの表が決めていて
`site/content/residents.ts` に焼いてある。本人に選ばせると、他人の絵を
自分のものにできてしまう。

## 8. どねID の紐付け（#190）

| メソッド | パス | 誰が | 何を |
| --- | --- | --- | --- |
| `GET` | `/donors` | あやとだけ | どねID と YouTube アカウントの対応表 |
| `POST` | `/donors/:viewerPk` | あやとだけ | 結ぶ・「分からない」にする |
| `DELETE` | `/donors/:viewerPk` | あやとだけ | 画面から足した行だけ消せる |

**毎朝の取り込みが置いた行は消しても翌朝また出てくる。**
`addedAt` のある行（画面から足した行）だけが消せる。

## 9. 配信の道具（ルーレット・遠隔操作・アラートボックス）

OBS に映すものと、あやとの手元のコントローラーを繋ぐ口。
**`sessionId` は推測できない32桁の16進で、それを知っていることが読む鍵。**
`firestore.rules` でコレクションごと閉じてあるのは、1つ知られたら全部読める
形にしないため。

| メソッド | パス | 誰が | 何を |
| --- | --- | --- | --- |
| `POST` | `/roulette/start` | あやとだけ | ルーレットの席を開く |
| `GET` | `/roulette/:id` | 席を知っている人 | いまの状態（表示側 = OBS はログインできない） |
| `POST` | `/roulette/:id/comments` | あやとだけ | 新しく来たコメント。**栞を進めるので GET ではない** |
| `POST` | `/roulette/:id/items` | あやとだけ | 回すものを入れ替える |
| `POST` | `/roulette/:id/settings` | あやとだけ | 速さ・見た目・音 |
| `POST` | `/roulette/:id/spin` | あやとだけ | 回す。**当たりはサーバーで決める** |
| `POST` | `/roulette/:id/say` | あやとだけ | 当たった人へひとこと |
| `POST` | `/roulette/doneru` | あやとだけ | Doneru 側の下ごしらえ |
| `POST` | `/roulette/yt-token` | あやとだけ | YouTube のトークンを取り直す |
| `POST` | `/alertbox/session` | あやとだけ | アラートボックスの席を開く |
| `GET` | `/alertbox/:id/wss` | 席を知っている人 | 繋ぎ先 |
| `POST` | `/alertbox/:id/yt-token` | 席を知っている人 | トークンを取り直す |
| `POST` | `/alertbox/:id/superchat` | 席を知っている人 | スパチャ1件を豚の貯金箱の台帳へ（#305）。**同じ item id を2回投げても増えない** |
| `GET` | `/alertbox/:id/fund` | 席を知っている人 | 配信の豚に出す額。**`GET /fund` を使わない**（あちらは CDN に5〜10分焼き付く） |
| `POST` | `/remote/session` | あやとだけ | 島の遠隔操作の席を開く |
| `POST` | `/remote` | 席の持ち主だけ | 島を動かす（見ている場所・ひとこと） |
| `GET` | `/remote?sessionId=…` | 席を知っている人 | いまの指示（表示側が読む） |

### OBS の名簿は、名前の**完全一致**で当てている

`GET /alertbox/:id/characters` が図鑑を全員ぶん返して、**当てるのは OBS の
手元**（`app/alertbox/matching.utils.ts`）。口の側（`GET /characters/lookup`）は
`?channel=` を `channelKeys`、`?alias=` を `lookupKeys` に当てる。
**どちらも完全一致で、2人に当たったら決めない。**

完全一致なので、**YouTube がハンドルに付けたしっぽ**（`@なまえ-r9z`
`@なまえ1234` の後ろ）を打たないかぎり当たらない。人はそこまで打たない。
落とした形を呼び名として足しておく道具が `python/admin/tail_alias.py` で、
しっぽの見分けかたと数えた結果は `docs/island-db.md` 2.4。

**口と OBS は見ている欄が違う**（口は保存された鍵、OBS は生の字）ので、
片方だけ直すと静かに食い違う。数えるのは `python/admin/alertbox_names.py`。

### 図鑑に人を足す口は、**書く前に YouTube を引く**（#155）

`POST /characters` と `POST /characters/{id}`（**あやとだけ**）は、
`channelName` にハンドル（`@…`）かチャンネルID（`UC…`）が来たとき、
**書く前に YouTube の表示名とチャンネルIDを引いて**、表示名を `aliases` に、
IDを `channelId` に入れる。ふつうの表示名が来たときは引かない。

ドネルは投げ銭の名乗りに**表示名**を入れてくるので、ハンドルだけで作ると
**その日のあいだ、その人は投げ銭から引けない**（`docs/island-db.md` 2.4）。

- **足すのは `aliases` だけ。** `channelKeys` には触らない
- **手で入れた呼び名は消さない。** 足すだけ
- `channelId` は**空のときだけ**入れる。すでに誰かに付いているIDは入れない
- **引けなくても作成は通る。** 返事に何が起きたかが入る

```jsonc
{
  "character": { … },
  "named": {
    "state": "added",   // added / already / skipped / failed
    "name": "えびっち", // 呼び名に足した字（added のときだけ）
    "why": ""           // 入れられなかった理由（failed のときだけ）
  }
}
```

外を1本引くので、**この口だけ返事が遅い**（実測 350ms 前後）。
引き先が黙っているときは時間切れ（8秒）で `failed` にして、作成は通す。

### コメントの口は、**落ちても 200 で返る**

`/roulette/:id/comments` と `/roulette/start` は、YouTube まで届かなかった
ときも 200 を返す。**コントローラーを止めないため**——手で足すぶんだけでも
ルーレットは回るので、面ごと下ろす理由がない。

そのぶん、**届かなかったことは本文の欄で言う。**

| 口 | 欄 | 届かなかったとき |
| --- | --- | --- |
| `/roulette/:id/comments` | `down` | `true`。`lines` は空、`live` は**見ない**（読めていないので言えない） |
| `/roulette/start` | `chatDown` | `true`。同じ回の `live` は**見ない** |

**この2つを見ないと、読めていない回が「まだ来ていません」「いま配信して
いません」に化ける**（`docs/island-standards.md` 10、`island-misses.md` #117）。
`down` は最初からこの口にあったが、画面が長いあいだ捨てていた。

## 10. 畳んだ口

| 口 | いつ | なぜ |
| --- | --- | --- |
| `GET/POST /ideas`、`POST /ideas/:id/vote` | #171 | 一言の提案は企画（`/nextplans`）に一本化した |
| `GET/POST /drafts` | #171 | 下書きも同じ。本番は0件だった |
| `/state` の `ideas` | #171 | 誰も出していない8件のために、島を開くたび Firestore を1回よけいに読んでいた |

**残すのをやめた理由も同じ**。Functions と Hosting は別々に手で起動するので、
片方だけ先に出た日に掲示板がまるごと 404 になる。両方が本番に出て3日たってから畳んだ。

---

## 確かめかた

この文書の口の一覧は、**コードの照合式そのもの**から起こしてある（2026-09-11）。

```bash
# 誰でも読める口に、素性が乗っていないか（**GET だけ。対照つき**）
python python/public_ids_selftest.py

# 口の一覧（path === と、正規表現の照合）
grep -nE 'method === "(GET|POST|DELETE|PUT)"' functions/src/islandApi.ts
grep -nE 'const (photoMatch|eventImages|imageOne|logMatch|factMatch|pollMatch|forkMatch|heartMatch|replyMatch|archiveMatch|planOne|planHeart|planStatus|planVideos|planArchive|abWss|abTok|rlOne|rlChat|rlItems|rlSet|rlSpin|rlPost) = path.match' functions/src/islandApi.ts
grep -nE 'q.method === "(GET|POST|DELETE)"' functions/src/cards.ts functions/src/donors.ts functions/src/remote.ts

# ログインが要る口（`whoIs` を通っているところ）
grep -n 'deps.whoIs(q.auth)' functions/src/cards.ts

# 「あやとだけ」の印
grep -n 'ownerUid(req.headers.authorization)' functions/src/islandApi.ts

# 1日の上限
grep -nE '^const [A-Z_]+(_PER_DAY|_LEN|MAX_[A-Z_]+) =' functions/src/islandApi.ts
grep -rnoE 'takeQuota\([^,]+, *"[a-z]+"' functions/src/*.ts
```

**`/state` の返り**は `site/lib/api.ts` の `IslandState` と、
`functions/src/islandApi.ts` の `GET /state` の `res.json({…})` の両方で突き合わせた。
