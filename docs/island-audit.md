# 島の棚おろし — いま何が、どこに、いくつあるか

**これは「やること」の表ではない。**「いま、こうなっている」を数えて置いてある表。
手を付けるかどうかを決める前に、**数を見に来るところ。**

2026-09-11 に4本の調査（スプシとドライブの依存 / 責務分割 / 水平展開 / 永続化）と、
2026-09-19 に1本（見張りの範囲）を出した。どれも issue に置いてあったが、
**issue は「期限と状態を持つもの」の場所**で、調べた結果の置き場ではない（`CLAUDE.md`）。
向きが逆だったので、こちらへ移した。出どころは #284 #287 #288 #290 #291 #570。

**数は 2026-09-19 に数え直してある。** 数え直せなかったものには、そう書いてある。

## 数え直すときの決まり

- **生 grep のヒットを件数にしない。** `/* */` と `//` を落とし、`"…"` `'…'` `` `…` `` を
  空に潰してから数える。直した記録（コメント）を、直っていない証拠として数えたことが実際にある
- **まず `git fetch`。** 49コミット遅れた木で数えて、既に直っているものを「残っている」と
  報告したことが実際にある
- **「直っている」を grep で言わない。** 画面のことなら、落として撮る（`tools/sprites/lieshot.mjs`）

---

# 1. スプレッドシートと Google ドライブの依存

出どころは #284（2026-09-11。20件あった）。**いま残っているのは4件。**

## 1-1. 何が残っていて、何が消えたか

| | 何だったか | 2026-09-11 | 2026-09-19 |
| --- | --- | --- | --- |
| **Viewers 表**（名前↔キャラクターの絵↔絵文字・141行） | `app/alertbox` と `app/ve-comment` が GAS 越しに全件読んでいた | 読む側2面 | **読む側0。** 両方 `GET /alertbox/{合言葉}/characters` に移った |
| **Goals 表**（目標金額1行） | `app/alertbox/api.utils.ts:31`（`getById`） | 生きている | **生きている。残件** |
| **SuperChats 表**（スパチャの控え・411行） | `app/alertbox/api.utils.ts:51`（`insert`） | 生きている | **生きている。残件** |
| **画面のログ**（`EXPO_PUBLIC_GAS_LOG_API_URL`） | OBS の面がスプシへ1行ずつ POST | 59か所 → 31か所 | **`app/alertbox` の36か所。残件** |
| **gviz の直読み**（料理ランキング） | `public/料理ランキング変動.html` | 2本 | **0本。** 面ごと消した（2026-09-21 / #388） |
| **ドライブのキャラクター画像** | `lh3.googleusercontent.com/d/{id}=s{大きさ}` が島のほぼ全面 | 11か所 | **本番0。** `/island-api/characters/{icon}/plain-128.webp` に移った |
| **使っていない env**（`PYTHON_GAS_API_URL` / `_PW`） | 毎晩の取り込みに渡していた | 生きていた | **消した。** `python/fetch_chat_data_old.py` ごと無い |
| **クレジット巻き・なに食べよの進捗バー・チャット表示** | OBS の3面 | 生きていた | **面ごと無い**（`app/` に残るのは `alertbox` `ve-comment` `ve-postit` `daily_user_stats` の4面） |

## 1-2. `lh3.googleusercontent.com/d/` が残っている10か所（本番ではない）

grep すると10件当たるが、**本番の画面は1つも無い。**

| 何 | 何本 |
| --- | --- |
| コメント（前はこうしていた、という記録） | 2（`app/alertbox/index.tsx:507`、`site/lib/charImg.ts:18`） |
| 手元の撮影・移行の道具 | 8（`tools/sprites/` の5本、`python/admin/characters_migrate.py` の2か所、`tools/sprites/crawlcheck/stub.html` の1本） |

`tools/sprites/crawlcheck/stub.html` と `tools/sprites/route.mjs:309` は
**「届かない先」をわざと置いてある**もの。消さない。

## 1-3. GAS の口（`script.google.com/macros/s/…/exec`）が4か所

| どこ | 何の口か | 鍵を持っているか |
| --- | --- | --- |
| `app/alertbox/api.utils.ts:11,31,51` | Goals / SuperChats（`EXPO_PUBLIC_GAS_API_URL`） | **無い。`?table=` を付ければ誰でも全件取れる** |
| `functions/src/islandApi.ts:197` | 島から叩く側 | Functions の中 |
| `functions/src/nanitabeyoWeeklyReportProxy.ts:5` / `app/daily_user_stats/lib/api.ts:4` | なに食べよの週報 | ソースに直書き |
| `public/nanitabeyo-improvement-theme-survey/index.html:438` | なに食べよのアンケート | ページに直書き |

**ランキングの口（`#853_…`）は 2026-09-21 に無くなった。** 仕様ごと下ろしたので、
レビューの面（`public/#853_dish_categories_ranking_review.html`）と、その結果を配信に
映していたテロップ（`public/料理ランキング変動.html`）の**2枚とも無い。**
合言葉を持っていた口はこのリポジトリのどこにも残っていない（GAS とスプシはあやとのもの。触っていない）。
テロップだけまた要るときは、`29edb95` の姿が git に残っている。

**`EXPO_PUBLIC_` は「隠す」ではなく「公開してよい」の宣言。** Expo は書き出しの中へ焼くので、
GitHub Secret に入れてあっても本番の JS から読める。**この口に鍵を持たせても意味がない。**
閉じるなら口を移す（Functions の中へ）。

## 1-4. なぜ Goals と SuperChats が残っているか

**残っている2つは「額の出るところ」**で、どちらも `app/alertbox` の初期化を通る。
しくじると OBS に「初期化に失敗しました」の1行だけが出て、**配信の画面にそのまま映る。**
配信の無い日にやる、と決めてある。

SuperChats は**移す先が要らない**（同じものが BigQuery `chat_messages` と
Firestore `islandTips` に入っている）ので、**消すだけで依存が1本減る。**

---

# 2. 責務分割 — 誰の書類に何が入っているか

出どころは #288（2026-09-11）。

## 2-1. `islandApi.ts` の大きさ（2026-09-19 実測）

| | 2026-09-11 | 2026-09-19 |
| --- | ---: | ---: |
| `functions/src` 全部 | 6,539行 | **10,072行** |
| `islandApi.ts` | 3,683行（56%） | **4,215行（42%）** |
| うち `onRequest` の中の1つのハンドラ | 1,998行（1686–3683） | **2,109行（2107–4215）** |
| そのハンドラの中の `if (method === "…")` | 48本 | **46本** |
| `ownerUid(` の呼び出し（`islandApi.ts` の中） | 28回 | **27回** |
| `ownerUid(` の呼び出し（`functions/src` 全部） | 39か所 | **37か所**（`islandApi` 27・`donors` 3・`islandCharacter` 3・`remote` 2・`cards` 1・`publicPurge` 1） |
| `islandApi.ts` が直に触るコレクション | 12種 | **14種** |
| `requireOwner()`（関所を1本にまとめたもの） | 無い | **無い** |

**ファイルは割れていないが、比率は下がっている。** 新しい責務（`islandCharacter.ts` 1,200行、
`publicPurge.ts` 926行）が外に立ったぶん、`islandApi.ts` の占める割合が 56% → 42% になった。
**中身そのものは 3,683 → 4,215 行に増えている。**

`islandApi.ts` が直に触る14種:
`island` `islandChannels` `islandDoneruHealth` `islandFundConfig` `islandFundSuperChats`
`islandHearts` `islandNotes` `islandPollVotes` `islandPolls` `islandRate` `islandUsers`
`islandVisits` `nordicPhotos` `rouletteSessions`。
（2026-09-24 に `islandGoal` が抜けて `islandFundConfig` が入った。#639）

**困るのは3つ、それぞれ別。**

1. **同じ関所が27回コピーされている。** 1回ごとに `verifyIdToken` + Firestore の読み1回。
   **書き忘れた口が1本でもあれば、そこは誰でも書ける。数えないと分からない形になっている**
2. **並列で作業を配れない。** 企画を直す人と旅の写真を直す人が、必ず同じファイルを踏む
3. **落ちたら全部止まる。** Functions は1つのデプロイなので、付箋・企画・カード・旅の写真・
   ルーレット・アラートボックスが同時に死ぬ

先に `requireOwner()` だけを入れて27か所を差し替える回を独立させると、あとが安全になる。
`remote.ts` `donors.ts` `cards.ts` `streamEvents.ts` `islandCharacter.ts` が**すでに割れた形**なので、
真似る先が中にある。

## 2-2. `islandUsers` の欄を1本ずつ

`islandUsers` の鍵は Firebase Auth の uid、`islandChannels` の鍵は YouTube のチャンネルID。
繋いでいるのは `islandUsers.channelId` 1本だけ。

**島で人を指すものは、ほぼ全部チャンネルIDが鍵**（カード・投げ銭の台帳・どねIDの対応表・
名簿・住人の割り当て）。**uid が鍵なのは `islandUsers` と `islandHere` だけ。**

| 欄 | 何の責務か | 置き場の判定 |
| --- | --- | --- |
| `firstSeenAt` `lastSeenAt` | ログインした人 | auth。残す |
| `channelId` | uid ↔ チャンネルID | auth。残す。**2つの表をつなぐ唯一の線** |
| `admin` | あやとか。書ける口の関所 | **auth。残す**（下） |
| `handle` `handleAt` `name` | 島に出す名前。正は YouTube | チャンネルの属性。`islandChannels.name` と**同じ事実が2か所** |
| `photo` | ログインを押した日の YouTube アイコン（`=s88`） | チャンネルの属性。`islandChannels.photo`（`=s800`・毎晩入れ直る）と**同じ事実が2か所** |
| `showName` `showPhoto` | **島に名前と顔を出してよいという、視聴者さんの意思表示** | **`islandChannels` へ移す。** auth ではなく、チャンネルに対する同意 |
| `nickname` | 島に出す別名 | **消す。** 島に出る名前は YouTube のハンドルに寄せてあるので、もう1段かぶさっているだけ |
| `alertboxId` `doneruKey` `rouletteId` `remoteId` | あやと1人ぶんの配信道具の鍵 | **ここではない**（下） |

### `admin` を `islandChannels` へ移すと壊れる

`islandChannels` は**毎晩 BigQuery から焼き直される導出データ**（`python/island_channels.py`）。
権限をそこに置くと、**「消して作り直せる入れ物」に「消えたら誰も本番を触れなくなるもの」が同居する。**
`python/admin/collection_drop.py` の作りからしても、あの箱は落とせる前提で扱われている。
**`admin` は `islandUsers` に残すのが正しい。** 問題は置き場ではなく**読み方**（2-1 の 1）。

### あやと1人の鍵4本が、全員のログイン記録と同じ書類にある

`islandUsers/{uid}` の `alertboxId` `doneruKey` `rouletteId` `remoteId`。
この書類を、**ログインしていない誰でも叩ける `GET /state` が毎回まるごと読む**
（`listResidents()` は `d.data()` を取ってから数欄だけ選んで返す）。

**いま漏れてはいない。** 困るのはこの先で、`listResidents()` の返しに `...u` を1回書いた
瞬間に、Doneru の鍵が公開の JSON に乗る。**「公開されるところに鍵を置いた」を2回踏んでいる**
（`EXPO_PUBLIC_` が運び手だった2件）。ここは `GET /state` が運び手になりうる。

鍵を `islandOwnerKeys/{uid}` のような別コレクションに出すと、`/state` の経路から鍵が完全に消える。
**壊れうるのは配信の道具4つ全部で、あやとの手元でしか確かめられない。**

## 2-3. もう無いもの（ドキュメントのほうが古かった）

| | 2026-09-19 実測 |
| --- | --- |
| `canDraft` | **ソース0件。** Firestore にも無い |
| `islandUsers.character`（本人がキャラクターを選ぶ欄） | **0件。** `functions/src` の `character` 9件は全部 `islandCharacter.ts` の「キャラクター帳」で、別物 |
| `nickname` | **12か所**（`MyPage.tsx` 1・`IslandMe.tsx` 5・`site/lib/api.ts` の型2・`islandApi.ts` 4）。`app/alertbox/` の `nickname` は**Doneru の通知に入っている別物**（投げ銭した人の表示名）。混ぜて消さない |

## 2-4. 同じ事実が2か所にある（残り3件）

| | どこ | いまどうなっているか |
| --- | --- | --- |
| **顔写真** | `islandUsers.photo` / `islandChannels.photo` | 看板とマイページは新しいほう。**島の名札は古いほう**（`islandApi.ts:679` `photo: u.showPhoto ? (u.photo as string) \|\| null : null`）。アイコンを変えると名札だけ古い顔のまま |
| **名前** | `islandApi.ts` の `whoIs()`（ハンドル > チャンネル名 > Google 表示名） / `python/island_channels.py`（毎晩入れ直る） | 名前を決める規則が2系統ある |
| **旅の写真** | `islandStreamEventImage`（新） / `nordicPhotos`（旧） | **書くのは両方**（`islandApi.ts:1956`）、**読むのは旧**（`:2020` が `NPHOTOS.orderBy("at","desc").limit(400)`）、消すのは両方（`:1995`）。片方だけ失敗したとき、どちらが正か決まっていない |

`islandNextPlans`（旧・企画）は `firestore.rules:167` で `read, write: if false` に閉じてあり、
`streamEvents.ts` のコメントも「改名しただけ」と書いてある。**閉じ終わっている。**

## 2-5. 同意（`showName` / `showPhoto`）の関所は1か所しかない

判定は **`functions/src/islandApi.ts:679` の1か所だけ。** 読む面は `/state`・`/cards`・
`/nordic/photos` の3つで、全部この1か所を通る。画面側で `showName` を見て出し分けている
場所は**0件。**

**移すのが安い理由がこれ。** 書き換えるのは (1) `listResidents()` (2) `POST /me` の保存先
(3) 画面の `IslandMe.tsx` の3つ。

**ただし、移している最中に同意が落ちると取り戻せない。**（4章の退避が効くようになったので、
2026-09-11 当時より条件は良い）

## 2-6. `listResidents()` の上限500

`islandApi.ts:658` が `USERS.where("channelId","!=",null).limit(500)`。
**同意を出した人が501人を超えると黙って落ちる。** 落ちた人は「名前を出す」を押したのに
島に名札が出ず、押し直しても直らない。画面にもログにも何も出ない。

同意を `islandChannels` に移すと、この突き合わせ自体が要らなくなる
（`islandChannels` を1回引けば名前・顔・同意・日数が揃う）。

---

# 3. 水平展開 — 同じ形の失敗が、他にも残っていないか

出どころは #290（2026-09-11）。`docs/island-misses.md`（2026-09-19 時点で **180節**）を
**個別の経緯ではなく「同じ形」で束ねた**もの。

| | 同じ形 | 2026-09-19 の残数 | 確かめかた |
| --- | --- | --- | --- |
| **A** | 読めなかったことを、0件・空・オフと同じ絵にする | **0** | 落として撮る（grep では言わない） |
| **B** | 1か所直して、同じものを読む他を探さない | **2**（画面1・サーバー1） | コメント除去 grep |
| **C** | `!` で「無いことがありうる」を黙らせる | 9件（うち今日 `undefined` になりうるのは0） | コメント除去 grep + 1件ずつ読む |
| **D** | 溜まったときに、上限で黙って落とす | **固定上限16本。続きが取れるのは1本** | grep + 行を読む |
| **E** | 日付で変わるものを、その日を過ぎた形で見ていない | 仕組みは直っている。残るのは確かめる手順 | `tools/sprites/timetravel.mjs` |
| **F** | 画面でシステムの仕様を説明する | **2** | コメント除去 grep + 1件ずつ読む |
| **G** | 導出があるのに、手で名簿を並べる | **0** | ファイルを読む |
| **H** | 移し先を作って、読む側を移していない | **1**（旅の写真。企画は閉じ終わった） | grep + 行を読む |

## 3-A. 「読めなかった」を空と同じ絵にする — 0件

**grep では判定しない。API を落として、実際に撮る。**

```bash
cd site && NEXT_DIST_DIR=.next-lie npx next build
python3 -m http.server 4711 --directory .next-lie &
SPORT=4711 OUT=/tmp/lie-all PART=cases ONLY=503-ぜんぶ node tools/sprites/lieshot.mjs
```

10面 × オーナー／視聴者 = 20枚で、嘘の字（「からっぽ」「ぜんぶ返した」「まだ書いていません」）は
**0。** 芯の2面（`/me` `/me/desk`）は `abort` と「45秒返さない」でも撮ってあり、そちらも0。
**読めなかったときは、押しどころそのものが出ない。**

**残っているのは、`lieshot.mjs` の `PAGES`（`tools/sprites/lieshot.mjs:217-235`）が10面しかないこと。**
`/`（表紙）・`/now`・`/roulette` の表示側などは載っていない。
**「撮っていない面は、直っているかどうか分かっていない」が正しい言い方で、「直っていない」ではない。**

面を足すときに `PAGES` へ1行足す、という決めが要る。

## 3-B. 1か所直して、他を探さない — 2件

| | どこ | いまどうなっているか |
| --- | --- | --- |
| 画面 | `site/components/live/IslandMe.tsx:142` `{showPhoto && user.photo && <img src={user.photo} alt="" />}` | 「名札はこう出ます」の見本だけ、ログインを押した日の顔を出している。`site/lib/auth.tsx` は `channelPhoto`（毎晩入れ直る）を持っているのに、ここだけ使っていない。**1行** |
| サーバー | `functions/src/islandApi.ts:679` | 画面側3か所は直したが、**そこへ値を渡していた `listResidents()` が直っていない。** 2-4 の1件目と同じもの |

## 3-D. 上限で黙って落とす

`functions/src` の `.limit(数)` は **16か所**。**続きが取れる（`Page<T>` の `more`/`next`）のは、
付箋の `listStickies()` の1本だけ。**

| どこ | 上限 | 溜まったらどうなるか |
| --- | ---: | --- |
| `islandApi.ts:658` `listResidents()` | 500 | 同意した人が501人を超えると黙って落ちる（2-6） |
| `islandApi.ts:2020` `listPhotoDays()` | 400 | 旅の写真。`desc` なので古いほうから落ちる（落ち方は正しい） |
| `streamEvents.ts:63` `MAX_EVENTS` | 500 | 企画 |
| `streamEvents.ts:65` `MAX_IMAGES` | 600 | 写真 |
| `GET /nordic/log` | 60 | **`asc` なので超えたぶんは「新しいほう」が落ちる。** 旅程が倍になった日に、その日の日記だけ黙って出なくなる |

`pageOf<T>()` が既に汎用なので掛け替えるだけだが、**画面側が `{items, more, next}` を
受けられる必要がある**（付箋以外は素の配列を受けている）。サーバーと画面を同時に出す。

## 3-F. 画面でシステムの仕様を説明する — 2件

| どこ | 何の字か |
| --- | --- |
| `site/components/live/IslandMe.tsx:104` | 「どちらかを出すと、島を開いているあいだ、いま見ているところに丸いアイコンが立ちます。」 |
| `site/app/cards/page.tsx` | 同じ説明が `metadata.description` と面のリードに2回 |

**1件目は消すだけでは反対側に倒れる。** 置いてある理由もコメントに書いてある
（「名前を出した人が『見ているのが知られる』ことを知らないまま出すことになる」）。
**消すなら代わりに何で伝えるかを決める。**

## 3-まとめて1人に渡すもの

**3-B の画面1件・3-F の1件目・2-4 の顔写真・2-5 の同意の移動は、全部
`IslandMe.tsx` と `listResidents()` の2か所に集まっている。** 別々に配ると同じファイルを踏む。

---

# 4. 永続化 — 何が消えて、何が戻るか

出どころは #291（2026-09-11。当時「バックアップが1本も無い」）。**いま退避は動いている。**

## 4-1. 2026-09-11 に挙げた7本のいま

| | やること | 2026-09-19 |
| --- | --- | --- |
| 1 | `monthlyReview` を閉じる | **済。** `firestore.rules:51-63` に `owner()` が入り、`islandUsers/{uid}.admin` を見る。`list` は閉じ、OBS が要る `get` だけ開けてある |
| 2 | Firestore の退避 | **済。** `python/backup/` と `.github/workflows/backup.yml`（02:00 UTC ＋ 取り込みへの `workflow_run` 繋ぎ） |
| 3 | BigQuery の書き出し | **済。** 4表とも。置き場は `island_backup`（asia-northeast1。**本番は US**） |
| 4 | 視聴者さんの IP を書くのを止める | **済。** `functions/src` の `x-forwarded-for` は **0件。** 溜まっていた38件も落とした |
| 5 | `firestore_delete.py` に dry-run 既定 | **済** |
| 6 | `islandRate` に TTL | **まだ**（下） |
| 7 | 旧コレクションを消す | **`nordicPhotos` がまだ読まれている**（2-4）。企画のほうは閉じ終わった |

**退避は「取るだけ」ではない。** `backup.yml` の `drill` が毎晩 Firestore エミュレータへ
1コレクション戻して、**件数と中身の指紋が合うか**まで見る。旅の写真も置き場から1枚取り出して
**バイト列が一致するか**まで見る。**本番には1バイトも書かない。** 戻しかたは `docs/island-backup.md`。

## 4-2. 失ったら戻らないもの（2026-09-19 実測）

BigQuery（`live-streaming-d3cac.youtube_chat`・US）:

| テーブル | 2026-09-11 | 2026-09-19 |
| --- | ---: | ---: |
| `chat_messages` | 135,427行 / 161.1MB | **145,028行 / 174.2MB** |
| `doneru_donations` | 974行 | **1,014行** |
| `videos` | 763行 | **778行** |
| `doneru_ingest_runs` | 14行 | **23行** |

`maxTimeTravelHours` は **168（7日）**。**7日を過ぎた事故は、退避が無ければ戻らない。**
だから退避が要る。

Firestore の件数は **2026-09-11 の実測のまま。数え直していない**
（`run_admin_script.yml` → `collections_audit` を回す必要があり、今回は回していない）。
当時の並び:
`islandChannels` 2,260 / `islandTips` 1,357 / `islandRate` 150 / `islandHearts` 31 /
`islandDonors` 28 / `islandNotes` 25 / `islandStreamEvent` 16 / `islandPollVotes` 10 /
`islandIdeas` 8 / `islandPolls` 7 / `islandVisits` 7 / `nordicDays` 6 / `islandCards` 4 /
`islandUsers` 2 / `islandNextPlans` 2 / `islandStreamEventImage` 2 / `nordicPhotos` 2 /
残り5本が1件ずつ。

## 4-3. 消えてよいものと、困るものが同じ箱に並んでいる

**TTL のフィールドも、TTL ポリシーも、掃除のジョブも、Firestore 側には1つも無い**
（`functions/src` の `expiresAt` 2件は Doneru のトークン期限で、別物）。

`islandRate`（回数制限のカウンタ。書類ID = `{種別}_{日付}_{端末ID}`）は、
**その日限りのものなのに永久に積む。** `takeQuota()`（`functions/src/islandApi.ts:935`）が書く。

**いまは誰も困らない。困るのは2つ。**

1. 島に人が来るほど、**戻らないゴミが毎日増える**（1日20人 × 5種別なら年3.6万件）
2. **投げ銭の台帳と同じ箱に入っているせいで、「Firestore を消してよいか」の判断が一生できない。**
   消してよいものと戻せないものが混ざっていると、掃除する人は毎回全部を疑うことになる

直すのは「書類に `expireAt` を持たせて TTL ポリシーを1本張る」だけ。**ただし TTL ポリシーは
コンソールか gcloud の操作**で、サービスアカウントに `datastore.indexAdmin` が無い。

そして `takeQuota()` は**付箋・企画・日記・訪問者数の全部の書く口が通る関所**なので、
落ちたら島に何も書けなくなる。**配信のある日にやらない。**

## 4-4. `firestore.rules` と、実際にあるコレクション

2026-09-11 に「ルールに無いのに本番にある4本」と書いたうち、
`islandPolls` `islandPollVotes` `islandVisits` は**明示された。**
いまルールが名指ししているのは **33本。**

---

# 5. 見張りが見ている範囲

出どころは #570（2026-09-19）。**いま壊れてはいないが、範囲が狭いもの。**
`python3 python/selftest_runner.py` は **60本ぜんぶ緑**（2026-09-19 実測）。

| | 見張り | 範囲が狭いところ | 当ててみた結果 |
| --- | --- | --- | --- |
| 1 | `public_ids_selftest` | 毎 PR で回るのは**対照だけ**（`selftest_runner.py:176` が `--offline` を渡す）。本番に当てる回は、どのワークフローからも自動では走らない（`.github/` に `public_ids` は0件）。`PATHS` は手書きの11本 | **身元の当たり0件** |
| 2 | `logsafe_selftest` | 登録してある口は **9本**（`check(...)` の数）。`logsafe` を使う本は **33本** | 登録外の本も `mask` / `detail_lines` を使っていて、自前の書き直しは無い。**守りが外れた日に、登録外だけ黙る** |
| 3 | `crosscall_selftest` | `python/*.py` の**1階層だけ**（`:94` が `glob("*.py")`。`rglob` ではない）。`python/admin/` `python/bq/` `python/backup/` を1行も読まない | 同じ目を `python/` 配下ぜんぶに当てて**食い違い0件** |
| 4 | `chatter_selftest` | python から `site/selftest/chatter_selftest.mjs` に移った。`site/content/chatter.ts:595` に `by: "named"` の枝が残っていて、**単位が一致するだけで赤くなる**形 | 名簿がその人数まで縮むことは無いので、当面起きない |
| 5 | `text_expires_watch` | `site/{app,content,components}` の `.ts/.tsx` だけ（`:76` の `DIRS`）。範囲外は `public/*.html` 4枚（うち2枚は OBS のブラウザソース）・直下の `app/` 33本・`site/lib/` 21本 | 58本に同じ正規表現を当てて4か所当たったが、**4件とも画面に出ない字**（記録の引用1・コメント3） |

**1〜5 はどれも「いま実害0」。** 直す価値があるのは 1 と 3 で、
どちらも**範囲を広げても結果が変わらないことを確かめてある**ので、広げるのは安い。

---

# 6. 手を付けるなら、この順

**上から順にやると、後ろが楽になる。**

| | やること | なぜこの順か |
| --- | --- | --- |
| 1 | **`IslandMe.tsx` と `listResidents()` をまとめて1人に渡す**（2-4 顔写真・2-5 同意の移動・3-B・3-F の1件目） | 全部同じ2か所。別々に配ると踏み合う。関所が1か所しかない**いま**がいちばん安い |
| 2 | **`requireOwner()` を入れて27か所を差し替える** | ファイルを割る前にこれを独立させると、あとが安全になる |
| 3 | **`islandApi.ts` の 2,109行のハンドラを割る** | 2 のあと。7〜9本に分けて**1本ずつ出す** |
| 4 | **旅の写真の二重書きを片付ける**（2-4） | 読む側を新しいほうへ寄せて、旧への書き込みを止める |
| 5 | **Goals と SuperChats をスプシから剥がす**（1-4） | SuperChats は移す先が要らない。**配信の無い日に** |
| 6 | **`islandRate` に TTL**（4-3） | 全部の書く口が通る関所。**配信の無い日に** |
| 7 | **上限に続きを付ける**（3-D）・**`lieshot.mjs` に面を足す**（3-A）・**画面のログの置き場**（1-1） | 急がない |

**1件直したら、同じ理由で壊れているところを探しに行く。**
この文書に挙がっているのは「見つかった数」であって、「直すべき全部」ではない。
