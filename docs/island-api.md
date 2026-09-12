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

`GET /state` が返すもの（`site/lib/api.ts` の `IslandState`）:

| 鍵 | 中身 |
| --- | --- |
| `current` | いまどこ・ひとこと・今週・テーマ |
| `stats` | 配信本数・日数・コメント数・のべ人数・常連の数・直近5本 |
| `notes` | テーマ付箋の新着（最大200件） |
| `residents` | 名前かアイコンを出してよいと言った人だけ |
| `residentDays` | チャンネルID → 一緒にいた日数 |
| `nordic` | `arrivedOn` / `endedOn` |
| `more.notes` | まだ古い付箋が残っていれば、その続きの位置 |

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
| `GET` | `/nextplans/:id` | 誰でも | 1件（育てる画面が続きを書くために引く） |
| `POST` | `/nextplans` | 誰でも | 出す。**題だけでいい**（4字以上・60字まで／1日12件） |
| `POST` | `/nextplans/:id` | 出した人 | 育てる。**送った中身でまるごと置き換わる**。あやとは時間制限を越えて書ける |
| `POST` | `/nextplans/:id/heart` | 誰でも | ハート。**もう一度押すと外れる**（1日120回） |
| `POST` | `/nextplans/:id/status` | あやとだけ | 段を動かす。`planId` で Git 側の企画に結ぶ |
| `POST` | `/nextplans/:id/videos` | あやとだけ | この企画のものだと決めた配信。URL を貼ってもよい |
| `POST` | `/nextplans/:id/archive` | あやとだけ | しまう・戻す。**消えない** |

1件 12,000 バイトまで（`JSON.stringify(body).length`）。

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
| `GET` | `/nordic/photos` | 誰でも | 旧・日付から入る道 |
| `POST` | `/nordic/photos` | あやとだけ | 旧・日付から貼る。**中で新旧どちらの入れ物にも書く** |
| `DELETE` | `/nordic/photos/:id` | あやとだけ | 旧・消す |
| `GET` | `/cards` | 誰でも | 配られたカード。**名前を出してよいと言った人ぶんだけ** |
| `POST` | `/cards/:cardId` | 本人 | 自分のカードを動かす（`cardId` は `<画像のID>__<チャンネルID>`） |

**書く口を当分2つ動かしているのは、旅で毎日使っているものを出発直前に
作り替えないため**（#202 の順番）。`POST /nordic/photos` は中で新旧の両方に書く。

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
| `POST` | `/remote/session` | あやとだけ | 島の遠隔操作の席を開く |
| `POST` | `/remote` | 席の持ち主だけ | 島を動かす（見ている場所・ひとこと） |
| `GET` | `/remote?sessionId=…` | 席を知っている人 | いまの指示（表示側が読む） |

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
# 口の一覧（path === と、正規表現の照合）
grep -nE 'method === "(GET|POST|DELETE|PUT)"' functions/src/islandApi.ts
grep -nE 'const (photoMatch|eventImages|imageOne|logMatch|factMatch|pollMatch|forkMatch|heartMatch|replyMatch|archiveMatch|planOne|planHeart|planStatus|planVideos|planArchive|abWss|abTok|rlOne|rlChat|rlItems|rlSet|rlSpin|rlPost) = path.match' functions/src/islandApi.ts
grep -nE 'q.method === "(GET|POST|DELETE)"' functions/src/cards.ts functions/src/donors.ts functions/src/remote.ts

# 「あやとだけ」の印
grep -n 'ownerUid(req.headers.authorization)' functions/src/islandApi.ts

# 1日の上限
grep -nE '^const [A-Z_]+(_PER_DAY|_LEN|MAX_[A-Z_]+) =' functions/src/islandApi.ts
grep -rnoE 'takeQuota\([^,]+, *"[a-z]+"' functions/src/*.ts
```

**`/state` の返り**は `site/lib/api.ts` の `IslandState` と、
`functions/src/islandApi.ts` の `GET /state` の `res.json({…})` の両方で突き合わせた。
