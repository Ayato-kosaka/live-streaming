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
| `GET` | `/fund/history` | あやとだけ | スパチャの控え1ページぶん（`islandFundSuperChats`）。`?limit=`（既定30・最大60）・`?before=`。**キャッシュしない**。**画面からはもう呼んでいない**（2026-09-25。`/fund/feed` に寄せた）。本番で1回通す道具が使う |
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
| `GET` | `/fund/desk` | 焼き直しの合計＋Doneru＋**いま**＋**内訳**＋出費の1ページ目（12件）＋目標ぜんぶ |
| `GET` | `/fund/feed` | **スパチャと Doneru をまぜて時系列**（下） |
| `GET` | `/fund/spends` | 出費の続き。`?limit=`（既定12・最大120）・`?before=`（`<日付>_<書類ID>`） |
| `POST` | `/fund/spends` | 出費を1行。`{day, title, yen}` |
| `DELETE` | `/fund/spends/{書類ID}` | 出費を1行消す |
| `POST` | `/fund/goals` | 目標をはじめる。`{from, label, yen}`。**書類IDは `from`**。前のは**ここが閉じる** |
| `DELETE` | `/fund/goals/{from}` | **打ち間違えた**目標を消す（「終わらせる」道ではない） |
| `POST` | `/fund/chats` | 取りこぼしたスパチャを1件。`{day, yen, who}` |
| `DELETE` | `/fund/chats/{書類ID}` | スパチャの控えを1件消す |
| `POST` | `/fund/replay` | **配信にもう一度アラートを出す**。`{kind, id}`（下） |

**「おわりにする」だけの口は置いていない**（2026-09-24。あやと「目標は最大1です。
なので閉じるは不要な気もする」）。単独のボタンがあると、押したあとに
「目標が無い」状態ができる。**次のを作ったら前のはサーバーが閉じる**ので、
最大1が人の手順ではなく仕組みで守られる。閉じる日は**新しい目標の前の日**——
同じ日にすると、どちらの期間にも入る1日ができて内訳の足し引きが2通りになる。

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

### 内訳（`GET /fund/desk` の `split`）

あやとの言葉「今の目標に対する総金額（豚にでてるやつ）も内訳付きで出したい」。

    開始時点 ＝ いま − スパチャ（期間内） − ドネ（期間内） ＋ 出費（期間内）

**開始時点は測っていない。残差。** こう組むと4行の足し引きは**必ず**
「いま」（＝`GET /fund` の `total`）に戻る。**合わない内訳は無いほうがマシ**
なので、合わない形を作れなくしてある。意味のほうも正しい——目標が
始まった時点で財布に入っていた額そのもの。

**財布は1つで、日付では切らない**（#639）。**切るのは表示だけ**で、
`GET /fund` の計算には1バイトも触っていない。

スパチャの期間内は、**全体の半分から「始まる前のぶんの半分」を引く。**
期間ごとに半分にすると、両方が奇数のときに1円ずれて足して戻らなくなる。

**索引の要る読み方をしない。** `where` と `sum()` を組み合わせると
複合索引が要る（単一フィールドの自動索引には足す欄が入っていない）。
うちは作れない（#168）ので、**欄を絞って読んで、足すのはこちら**でやる。
2026-09-25 に本番でこれを踏んで、内訳がまるごと出なかった
（`docs/island-misses.md` #190）。

**組めなかったときは `splitWhy` に門の名前が入る**（`goal` / `total` /
`box` / `health` / `read` / `stale`）。**画面には出さない**——読む人に要るのは
「いま出せません」だけ。読むのは `python/admin/fund_desk_probe.py`。

**1つでも読めなければ `split: null`。** とくにドネの写し
（`islandFundDonations`。`python/doneru_ledger.py`）が無い日に 0 と読むと、
その日のドネがまるごと「開始時点」へ流れ込んで、**4行は足し引きが合ったまま
嘘をつく。** いちばん見つけにくい壊れ方なので、出さない側へ倒す。

### 履歴（`GET /fund/feed`）

`?since=`（それより後だけ）・`?before=`（続き）・`?limit=`（既定12・最大120）。

**2つの入れ物から同じ数だけ引いて、手元で混ぜて切る**（Firestore に
コレクションをまたぐ並べ替えは無い）。並べるのは `at` で、`day` だと
同じ晩の中で順が決まらない——配信中はそこがいちばん見たい。

**`at` を持たない控えは、この並びに出てこない**（GAS の表から移した13件）。
黙って落とさず、件数と額を `noTime` で返す。

`since` を渡した回は、`at` の**同じ単一フィールド**に範囲と並べ替えを掛ける
ので、自動でできる索引の範囲に収まる（複合索引は作れない。#168）。

### もう一度出す（`POST /fund/replay` → `GET /alertbox/{合言葉}/replay`）

あやとの言葉「たまに配信中見逃すので。…本当は即時で再アラートできる機能ほしい」。

押すのは机、置き場は `islandFundReplay/{アラートボックスの合言葉}`、
拾うのは配信の OBS（3秒ごと）。`functions/src/remote.ts` と同じ形で、
**書くのはあやとだけ、読むのは合言葉を知っている人だけ。`where` も
`orderBy` も使わない**（#168）。

**変なものを配信に出さないための守りが4つ。**

1. **送られてきた字は1文字も通らない。** 受け取るのは「どの1件か」だけで、
   出す名前も額も本文も**台帳から組む**（`remote.ts` の `PLACES` と同じ考え）
2. **二度押しで二度出ない。** 同じ1件を1分のうちにもう一度頼まれたら、
   印（`seq`）を進めずに `already: true` を返す。画面のほうでも、出したあと
   1分は押しどころが戻らない（**片方が外れても配信に2回出ない**）
3. **2分より古い指示は配信へ返さない**（`seq: 0`）
4. **配信側は、起き上がって最初に受け取った印を控えるだけで出さない。**
   OBS を開き直した瞬間に、さっき押された指示が流れるのを止める

`GET /alertbox/{合言葉}/replay` は**ログインが要らない**（OBS のブラウザソースは
合言葉を持てない。`GET /alertbox/{合言葉}/fund` と同じ）。

確かめかたは3本、どれも毎 PR で走る（本番も Firestore も触らない）。

| | 見るもの |
| --- | --- |
| `functions/selftest/fund_owner_selftest.mjs` | **本物の `ownerUid` を通して** 5とおり × 10本。403 と「1バイトも書いていない」まで |
| `functions/selftest/fund_desk_selftest.mjs` | 2回入れても増えない・入らないものが入らない・消すのは書類IDだけ・焼き直しの数・**内訳の足し引き**・**履歴の並び**・**もう一度出すの4つの守り** |
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
| `limits` | **字の長さの上限**（下） |
| `more.notes` | まだ古い付箋が残っていれば、その続きの位置 |

#### `limits` — 字の長さは、ここが正（2026-10-13）

`{note, reply, name, link, planTitle}`。**定数だけで、人を指す値は1つも入らない**
（だから CDN にも焼いてよい）。

画面は長いあいだ同じ数字を自分で持っていた——`site/components/live/Notes.tsx` の
`const MAX = 120;` に「**サーバー側の `MAX_NOTE_LEN` と同じ**」と書き添えて。
**書いた人は気づいていて、止め金だけが無かった。** 同じ形が島じゅうに
**15か所**ある（`docs/island-db.md` の「同じことが2か所」）。

止め金を15本足すのではなく、**2か所であることをやめる。**
先例は `/stampline/mine`（2026-10-14 に閉じた。11章）で、あちらは返事に
`max` と `maxLen` を乗せていて、画面は数字を1つも持っていなかった。
**15か所のうち、正しい形はそこ1つだけだった。**

**届くまでは上限が付かない。** 画面側に既定の数字を置くと2か所に戻るので、
置かない。上限そのものはサーバーが必ずかける（`cleanText`）。

**一度に全部は動かしていない**（2026-10-13 に3か所）。どれを動かしてどれが
残っているかは `docs/island-db.md`。

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
| `POST` | `/streamevents/:id/images` | あやとだけ | 画像を貼る。**貼った時点でカードも作る**（1日120枚）。**企画が1本も立っていない日でも作る**（カードの軸は写真の日） |
| `POST` | `/streamevents/images/:id` | あやとだけ | どの企画のものかを付け替える。`videoIds`（11文字・40本まで）も受ける＝**この写真はこの配信のもの**と名乗らせる（0時またぎの逃げ道。**画面はまだ無い**）。カードも作り直す |
| `DELETE` | `/streamevents/images/:id` | あやとだけ | 画像を消す。**カードも実体も消える** |
| `GET` | `/nordic/photos` | 誰でも | 日付から入る道。`days[].people[]` は**絵と名前だけ**（`channelId` は返さない）。**読むのは `islandStreamEventImage`**（2026-10-13。それまで旧 `nordicPhotos` を読んでいた） |
| `POST` | `/nordic/photos` | あやとだけ | 日付から貼る。**書く先は1つだけ**（2026-10-13。それまで新旧の両方に書いていた） |
| `DELETE` | `/nordic/photos/:id` | あやとだけ | 消す。**旧に残っている行も道連れにする** |
| `GET` | `/cards` | 誰でも | 配られたカード。**上限で切らない**（2万枚の栓だけ。鳴ったら `logger.error`）。**`channelId` を返さない**。名前は出してよいと言った人ぶんだけ |
| `GET` | `/cards/mine` | ログイン済み | **自分のカードだけ。** 未ログインは 401。`Cache-Control: no-store` |
| `POST` | `/cards/:cardId` | 本人 | 自分のカードを動かす（`cardId` は `<画像のID>__<チャンネルID>`。**`/cards/mine` から取る**） |

**口の名前は旧のまま、中身だけ新に寄せた**（2026-10-13）。
`/nordic/photos` という道はそのまま使えるので、画面は1行も触っていない。

長いあいだ、ここは**書くのは新旧の両方・読むのは旧**だった。
`island-db.md` の責務の表は 2026-10-01 から「**新が正**」と書いていたのに、
**公開の面に出ていたのは旧のほう。** しかも書くのは `Promise.all` で
まとめ書きでも取引でもないので、片方だけ失敗したらずれる——**ずれても
赤くなるものが1本も無かった。**

寄せる前に数えた（2026-10-13）: 旧 **117件** / 新 **117件** /
**旧にしか無い 0件**。道具は `python/admin/nordic_photo_pair.py` で、
同じものが `backup.yml` から毎晩走る。**向きは1つだけ見る**（旧 ⊆ 新）——
新にしか無いのは、寄せたあとのふつうの姿なので緑。

**カードを読む口が2つあるのは、`/cards` が「誰が、いつ投げ銭したか」に
なってしまうから。** カードは投げ銭の台帳からしか作られないので、
1枚ごとに `channelId` と `day` を返すことは「そのチャンネルがその日に
投げ銭した」と言うのと同じ。`/me`（`site/components/me/MyPage.tsx`）が
自分の1枚を出すためだけに、それを全ブラウザへ配っていた。

| | `GET /cards` | `GET /cards/mine` |
| --- | --- | --- |
| 誰が | 誰でも | ログイン済み（未ログインは 401） |
| 何を | 島じゅうのカード（**全部。上限で切らない**） | **その人のカードだけ** |
| 誰のぶんかの決め方 | — | `islandUsers/{uid}.channelId`。**送られてきた値は見ない** |
| チャンネルが結ばれていない人 | — | `{cards: []}` を 200 で返す（500 にしない） |
| `channelId` | **返さない**（欄ごと無い） | 返す |
| `id` | `<画像のID>__<絵>__<通し番号>`。**人を指さない** | 本当のカードID |
| それ以外の欄 | 同じ | 同じ |
| 1日の上限 | 無い（読むだけ） | 無い（読むだけ） |
| 掛け値 | `public, max-age=30, s-maxage=60` | **`no-store`**（CDN にも中間にも置かせない） |

**上限で切らない**（あやと 2026-10-01「カードは600が上限とかやめて欲しい。
大昔のカードも取得できないとおかしい」）。前は新しい順600枚で切っていて、
本番の617枚のうち**いちばん古い17枚が公開の口から取れていなかった。**
カードは**写真1枚 × その日投げてくれた人**なので、写真が96枚でも617枚になる——
写真の枚数で見積もると足りなくなる。

残してあるのは**2万枚の栓**だけで、鳴ったら `logger.error` を出す。
**栓が鳴ったら栓を上げるのではなく、送り（ページング）を入れる。**
2万枚は画面が耐えられる枚数ではない（1,000枚で生 479KB／gzip 44KB）。

**切れたことは応答では言わない。** 代わりに、毎晩の見張り
（`python/card_gap_watch.py`）が**置き場の枚数と、この口が返した枚数を
突き合わせる**。合わなければ赤。応答に「切れた」の欄を足すのは画面側と
一緒に決める話で、送りを入れるときに合わせる。

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
| `GET` | `/stickies` | 誰でも | **テーマに**貼られた付箋。`?theme=` で1つ、無ければ横断の新着。`?archived=1` と `?seen=1` は**あやとだけ** |
| `GET` | `/stickies/waiting` | あやとだけ | **まだ何もしていない**付箋の数と、その id。本文も名前も返らない（机の札のバッジ） |
| `POST` | `/stickies` | 誰でも | テーマに付箋を貼る（1日20件）。**絵を付けるならログイン**（下）。**締め切った宛先は 409**（下）。リンクは1本だけで、**2,048字を超えたら `400 bad link`**（切らない。12章） |
| `POST` | `/stickies/:id/heart` | 誰でも | ハート。**もう一度押すと外れる**（1日120回） |
| `POST` | `/stickies/:id/reply` | あやとだけ | 返信する。空で送ると取り消し |
| `POST` | `/stickies/:id/seen` | あやとだけ | **既読にする・戻す**（読んだが返さない）。付箋は1文字も変わらない |
| `POST` | `/stickies/:id/archive` | あやとだけ | しまう・戻す。**消えない** |
| `DELETE` | `/stickies/:id/pic` | あやとだけ | 貼られた絵だけを外す。**置き場の実体も消える**（字は残る） |

### 締め切った宛先には貼れない（2026-10-12）

**宛先を畳むのは画面の仕事ではない。** `site/content/themes.ts` で畳んだ宛先
（`closed: true` と、企画あての「日が過ぎたら」）は、`POST /stickies` が
**409 `theme shut`** で断る。2026-10-11 まではサーバーが宛先の表を知らず、
slug を直に投げれば畳んだ宛先にも貼れていた（`docs/island-misses.md` #225）。

| 当てたもの | 返り |
| --- | --- |
| 形が違う宛先（`[a-z][a-z0-9-]{1,39}` 以外） | `400 bad theme` |
| 畳んだ宛先（`closed: true`） | `409 theme shut` |
| 企画あての宛先で、その企画の終わった**翌日 0時（JST）以降** | `409 theme shut` |
| **表に無い宛先** | **通る**（200） |
| 畳んだ宛先に、あやとが立て札（`byOwner: true`） | `409 theme shut` |

**400 ではなく 409。** 送られた字は正しく、受け取る側が閉じている、という話。
画面もそう読んで「この話の付箋は、もう締め切りました。」と出す
（`site/components/live/Notes.tsx`。400 だと「少し待って、もう一度」になって、
待っても二度と通らないことが言えない）。

**表に無い宛先を断らないのは、今までどおり。** 島の表に1行足した日に
Functions を配り直さなくても貼れるようにしてある（`THEME_ID` の注）。
断るのは**畳んだものだけ**で、持っているのは許す表ではなく**断る表**。

**ハートと返信は塞がない。** 締め切ったのは「新しく書く」ことで、
すでに貼ってある付箋に反応することではない。

締め切りの表の正本は島の側（`site/content/themes.ts`）で、Functions が持って
いるのはその写し（`functions/src/shutThemes.ts`。
`node functions/tools/shutthemes.mjs --write` が組み立てる）。
**ずれたら赤くなる**——`node functions/selftest/sticky_shut_selftest.mjs` が
口を直に叩いて（畳んだ宛先に 409・企画あての境の前後・あやとの立て札・
ハートは押せる）、最後に写しを島の表から組み直して突き合わせる。

### 付箋に貼る絵（2026-10-08）

**字はいままでどおりログイン不要。絵だけログインが要る。** 絵は
あやとのチャンネルに紐づく公開の面に即出るので、**誰が貼ったか辿れない
状態では受けない**（字は1日20枚の枠があって「しまう」で下ろせる）。

送るのは `POST /stickies` の中に**2枚**。どちらもブラウザで焼いたもので、
`image`（開くほう・長辺1200）と `thumb`（板に並ぶほう・長辺480）、
それぞれの寸法（`w` `h` `tw` `th`）。**片方だけは受けない**——
板に並ぶほうを省く道を開けると、貼られるほど重い面になる。

断るものと、返る状態:

| 当てたもの | 返り |
| --- | --- |
| ログインしていない人の絵 | `401 no token` |
| 4MB を超える絵 / 512バイト未満 | `400 bad size` |
| jpeg・png・webp でない（**中身のバイトで見る**。拡張子も `Content-Type` も信じない） | `400 not an image` |
| base64 でない字 | `400 bad image` |
| 絵を2枚以上（配列） | `400 one picture only` |
| 板に並ぶほうが無い / 600KB 超 | `400 thumb …` |
| その日もう6枚貼っている | `429 too many pictures today` |

**どれに外れても、置き場には1バイトも書かない。** 守りが効いているかは
`node functions/selftest/sticky_pic_selftest.mjs`（0=通った / 1=抜けた /
2=確かめられなかった）。本物の絵3枚で**貼れることを先に**見てから、
断るほうを44件数える。

**ブラウザから Cloud Storage へは触らせない。** `storage.rules` は
`allow read, write: if false` のまま（`docs/island-db.md` 4.4）。

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
| `POST` | `/me` | ログイン済み | 島での見え方を保存する（`nickname` / `showName` / `showPhoto`）＋**チャンネルを結ぶ**（`ytToken`） |

**キャラクターは本人に選ばせない。** 誰にどの絵かはあやとの表が決めていて
`site/content/residents.ts` に焼いてある。本人に選ばせると、他人の絵を
自分のものにできてしまう。

### チャンネルを名乗らせない（2026-10-13）

**`body.channelId` はもう見ない。** 受け取るのは `ytToken`（Google の
OAuth アクセストークン）だけで、口が
`youtube/v3/channels?part=snippet&mine=true` を自分で引く
（`functions/src/youtubeOwner.ts`）。`mine=true` はトークンの持ち主の
チャンネルしか返さないので、**他人のIDを送っても1バイトも書かれない。**

前は送られてきた `channelId` をそのまま `islandUsers` に書いていた。
あれは公開の値なので、ログインできる人なら誰でも他人を名乗れて、
`GET /cards/mine` で他人のカードが読め、`POST /stampline/mine`（2026-10-14 に閉じた）で
他人の「戻らないことば」が上書きできた。3つとも
「送られた値を信じず `islandUsers` から引き直す」形で書いてあったが、
**引き直した先が言い値だった**（`island-db.md` の `islandUsers` の節）。

- `body` から読むのは **`nickname` / `showName` / `showPhoto` / `ytToken`** の4つだけ。
  `handle` `title` `thumbnail` は**1つも読まない**
- **`channelId` が body に在ったら、400 `{"error":"channelId not accepted"}`。**
  黙って無視しても書かれはしないが、**塞がったことを外から確かめる
  手がかりが1つも残らない。** ここが 400 を返すなら、新しいほうが本番に
  出ていることが**1バイトも書かずに**分かる（締め切った宛先を 409 で
  確かめたのと同じ形）。**断る判定は合言葉を見るより前**に置いてある——
  あとに置くと、確かめるのに本物のログインが要る（＝書く側を叩かないと
  確かめられない）。合言葉を持っていない人に新しく分かることは1つも無い:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    https://live-streaming-d3cac.web.app/island-api/me \
    -H 'content-type: application/json' -d '{"channelId":"UCbbbbbbbbbbbbbbbbbbbbbb"}'
  # 400 … 新しいほうが出ている（1バイトも書いていない）
  # 401 … まだ古い（`no token`。言い値はここまで見られていない）
  ```
- **配る順は Hosting が先、Functions があと。** 逆にすると、古い画面が
  `channelId` を送って 400 で弾かれる。先に Hosting を出せば、
  そのあいだ（新しい画面 × 古い口）は結びが1回ぶん増えないだけで、
  **いま結んである人は何も変わらない**
- **合言葉が無い回（空の body ＝ `loadMe`）は YouTube を叩かない。**
  島を開くたびに往復すると割り当てを削る。そのとき `channelId` は
  **触らない**（消しもしない）
- 確かめが取れなかった回（トークンが腐っている／YouTube が落ちている）も同じ。
  **区別しない**——どちらでも「確かめられなかった」だけなので、書けば嘘になる
- 見張り: `functions/selftest/me_channel_selftest.mjs`（対照つき）

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
| `POST` | `/alertbox/:id/superchat` | 席を知っている人 | スパチャ1件を豚の貯金箱の台帳へ（#305）。**同じ item id を2回投げても増えない**。入らないのは5つ（通知のテスト・円以外・0円以下・**1,000万円超**・ほどけないID。12章） |
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

## 11. スタンプのことば（#716。**2026-10-14 に閉じた**。#860）

住人が `/me` で、LINE スタンプに乗せる自分の1行を言い直す口だった。
スタンプは 2026-10-13 に LINE へ申請し、もう書き直しても入らないので、
`/me` の欄を全員から消して（あやとの決定。#860）、口も閉じた。
中身は `functions/src/stampLine.ts`。

| メソッド | パス | 誰が | 返事 |
| --- | --- | --- | --- |
| `GET` | `/stampline/mine` | 誰でも | **410** `{"error":"closed"}` |
| `POST` | `/stampline/mine` | 誰でも | **410** `{"error":"closed"}`。**1バイトも書かない** |

- **誰が送っても同じ返事。** 選ばれた人・外した人・選ばれていない人・
  未ログインのどれでも 410 で、字も同じ。返事が人で変わると、閉じたあとも
  「誰が選ばれたか」が口から割れる（選ばれかたは投げ銭の順位そのもの。
  `docs/island-money.md`）
- **合言葉を見るより前に返す。** だから本番で閉じたことを、
  ログインせず・1バイトも書かずに確かめられる（`POST /me` が言い値を
  400 で断るのと同じ形。開いていた頃の未ログインは 401 だった）:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    "https://live-streaming-d3cac.web.app/island-api/stampline/mine?cb=$(date +%s)"   # 410
  ```

- **404 にしない・409 にしない。** 道ごと消すと、配り替えの途中で道が無いのと
  見分けがつかない。409 は付箋の締め切り（宛先の状態しだい）に使っていて、
  こちらは開け直す予定が無い
- 掛け値は **`no-store`** のまま
- **入れ物（`islandStampLine`）の書類は消さない。** 本人が書いた字は戻らない
  （`docs/island-db.md` 3.1）。口からは読みも書きもしない。触るのは
  管理の道具（`python/admin/stamp_line_*.py`）だけ

確かめかたは `node functions/selftest/stampline_mine_selftest.mjs`
（**本番にも資格情報にも触らない**）。見るのは「5通りの人が `GET` / `POST` して
全部 410・返事が1通り」「偽の Firestore に1バイトも書かず、開きもしない」
「`no-store`」「ほかのパス・動詞は扱わない」の4つ。**先に、偽の Firestore に
わざと1件書いて数に出ることを見てから**本体を叩く（書いたことを数える仕掛けが
壊れていても「0件」になるので）。開いていた頃の本体に当てると、
11件落ちることを確かめてある（2026-10-14）。

## 12. ブラウザから来た値を、どこまで信じているか（2026-10-14）

`POST /me` が**言い値の `channelId`** を書いていた穴（7章）を塞いだあと、
**同じ形が他に無いか**を口ぜんぶで洗った。見たのは4つ。

| | 何を | 見つかったもの |
| --- | --- | --- |
| 1 | 本人のものかを確かめずに、送られた id で書く／読む | **0件**（下の「誰のぶんかの決め方」） |
| 2 | 長さ・型・値域を確かめていない | **2件**（リンクの切り落とし・台帳の額） |
| 3 | 数の上限に当たったことが分からない | **12か所**（窓が黙って切れる。残り2か所は下の断り） |
| 4 | 人の素性が、返ってはいけないところから出る | **2件**（どちらも**ログ**。応答は0件） |

### 口の一覧は、照合式そのものから起こす

```bash
node functions/selftest/api_trust_selftest.mjs --routes
```

`functions/src/*.ts` の `if (method === …)` を全部数えて並べる。
**この一覧が見張りの中にも持たせてあって、1本でも増減すると赤くなる**
（`docs/island-standards.md` §8。手で並べた表は、口が増えた日に黙って
見張りの外に落ちる）。増やしたら、見張りの `KNOWN_ROUTES` と
`OWNER_ONLY` と、下の表を同じ回に直す。

照合式を持たない枝が4本ある（`POST /characters`・`POST /characters/{id}`
は `||` でまとめてあり、`POST /public-purge`・`POST /donors/{どねID}` は
上の `GET` を抜けた先の落ち口）。
**数には入らないが、関所は枝の入口で通っている。**

**`/stampline/mine` は 2026-10-14 に畳んだ**（#860。11章）ので、
いまは照合式を1本も持たず、GET でも POST でも 410 を返す。
見張りは**閉じたままであること**を見る——開いているつもりの行を残すと、
開き直した日に誰も気づかない。

### 誰のぶんかの決め方（1の答え）

**「送られてきた id で持ち主を決める」口は、いま1本も無い。**
人に結びつく読み書きは、ぜんぶ下のどれか。

| 口 | 誰のぶんかを、何で決めているか |
| --- | --- |
| `GET /cards/mine` | `islandUsers/{uid}.channelId`。**送られてきた値は見ない** |
| `POST /cards/{カードID}` | 同じ。カードの `channelId` と突き合わせて、違えば 403 |
| `GET/POST /stampline/mine` | — **畳んだ**（#860。誰が叩いても 410） |
| `GET /stickies?mine=1`<br>`GET /nextplans?mine=1` | `where("uid","==",合言葉の uid)` |
| `POST /nextplans/{id}` | 書類の `uid`。ログインせずに出したぶんだけ `cid`（24字以上の強い端末ID）＋24時間 |
| `POST /me` | 合言葉で `youtube/v3/channels?mine=true` を**こちらが引く**（7章） |
| `POST /remote` | 席の `owner` と `uid` を取引の中で突き合わせ |
| `POST /roulette/{席}/…` | 同じ（5本とも `owner !== uid` なら 404） |
| `POST /fund/replay` | **送られてきた字は1文字も通らない。** 受け取るのは「どの1件か」だけ |

### 塞いだもの（2と4の答え）

| | いままで | いま |
| --- | --- | --- |
| **付箋のリンクが 2,048字を超えたとき** | `clean` が先に切っていたので、`safeLink` の長さの門に**届いていなかった**。2,049字の URL が、2,048字の**別の URL** として貼られる（貼った人にも読む人にも分からない） | `safeLink(body.link)` に生の値を渡す。超えていたら落として `400 bad link` |
| **`POST /alertbox/{合言葉}/superchat` の額** | 上限が無かった。同じ台帳（`islandFundSuperChats`）に書く机の口（`POST /fund/chats`）は 1,000万円超を断っているのに、**口を1つ替えるだけで素通り**できた | `fundDesk.ts` の `YEN_MAX` を借りて 400。**2か所に別の数を置かない**（`MAX_FUND_TEXT` と同じ） |
| **ハンドルを引き損ねたときのログ** | `logger.warn("handle lookup failed", channelId, …)`。落ちた回だけ、その人のチャンネルIDが1件ずつログに並ぶ | チャンネルIDを出さない |
| **500 になった回のログ** | `logger.error("islandApi failed", {path})`。`POST /cards/{画像ID}__{チャンネルID}` の道がそのまま出る | 道の `UC…22字` を潰してから出す |

**応答のほうは0件だった。** 誰でも読める10本を端まで歩いて、uid・
チャンネルID・端末ID・それらを名乗る欄名を数えて0
（見張りの5章。同じことを本番に対して `python python/public_ids_selftest.py`）。

### 窓が埋まったら鳴る（3の答え）

`.limit(N)` は、N 件を超えた日に**黙って N 件で返す。** 返した側は
「これで全部」の顔をする。鳴らす口を1本（`functions/src/capWatch.ts`）に
まとめて、**12か所**に付けた。

| 窓 | 大きさ | 埋まると |
| --- | --- | --- |
| `waitingStickies`（机の札の数） | 3,000 | 札が本当より小さい数を言う（前からここだけ鳴っていた） |
| `seenStickies`（既読の一覧） | 3,000 | **兄弟なのに鳴っていなかった** |
| `GET /stickies?theme=` | 300 | `more: false` のまま古いぶんが消える |
| `GET /stickies?mine=1` | 300 | 同じ |
| `GET /nextplans?mine=1` | 300 | 同じ |
| `listResidents`（島に立てる人） | 500 | 島の名札とカードの名前が黙って減る |
| `eventsOnDay`（その日の企画） | 30 | その日の企画が落ちる |
| `GET /streamevents/{id}/images` | 600 | 写真が落ちる |
| `GET /characters` | 500 | 図鑑が減り、`total` まで嘘になる |
| `GET /alertbox/{合言葉}/characters` | 500 | OBS の当てが外れて、絵の出ないアラートになる |
| `charactersByChannel`（カードの絵） | 500 | カードの絵が既定に落ちる |
| `GET /donors` | 300 | 結べていない行が表から消える |

**`streamEvents.ts` の2か所（`resyncCardsOfImage` / `dropCardsOfImage`、
どちらも 1,000）だけ付けていない。** あのファイルは島の見張り
（`site/selftest/cardplace_selftest.mjs`）が**単独で `tsc --noResolve` に通して**
偽の `require` で読み込む作りなので、`import` を1本足すと**あちらが
読み込めずに落ちる**（当ててみて落ちた）。鳴らすなら、あちらの偽の
`require` に `./capWatch` を足すのが先——`site/` を触る回に合わせる。

**鳴ったら窓を広げるのではなく、送り（ページング）を入れる**
（`/cards` の `CARDS_HARD_CAP` と同じ決め）。`>=` で見るのは、`.limit(N)` に
対して「ちょうど N 件」と「N 件より多い」が区別できないから——
**鳴らしすぎて困るのは人の手間だけで、鳴らさずに切れるのは数が狂う。**

### 塞いでいないもの（分かったうえで残した1件）

**`GET /characters/lookup` は、ログインも上限も無い。** 名乗りを1つ打つと
「その名前の人の絵はこれ」が返る——図鑑（`GET /characters`）は101人の絵を
**名前なしで**出しているので、この口は**名前と絵を結ぶ**ことになる。
（実測 2026-10-14: 丸腰で10回続けて 200。上限に当たらない）

**残したのは、塞ぐと配信が止まるから。** 絵を引いているのはスパチャと
ドネルの名乗りで（`python/admin/characters_add.py` ほか3本が合言葉なしで
叩いている）、ここを閉じると図鑑に人を足す手順がその日から通らない。

直すなら**口の側ではなく、呼ぶ側に合言葉を持たせてから**閉じる。
`python/admin/*` を触る回に合わせる。

### 見張り

```bash
node functions/selftest/api_trust_selftest.mjs
```

**本物のルータを動かす。** `onRequest` を差し替えて `islandApi.ts` が
登録しようとした関数を掴み、Firestore と YouTube を手元の偽物に差し替えて
叩く（**本番にも資格情報にも1バイトも触らない**）。字を読む確かめ
（`me_channel_selftest.mjs`）は「無いこと」しか言えず、欄の名前を変えられたら
黙って通るので、こちらは**叩いて断られることを見る。**

- **どの断りも「4xx」と「書き込み0」の2つで見る。** 400 を返しながら
  先に1件書いていたら、塞がっていない
- **先に「通る」ことを6本見てから**、断るほうを数える。偽の Firestore が
  壊れていると**どの口も 500 で落ちて「全部拒まれた」に見える**
  （`docs/island-standards.md` §15）。通る本数が4本未満なら、
  数字を1つも出さずに 2 で落ちる
- あやとだけの口は**46本 × 2（丸腰・よその人）= 92回**を一度に当てる
- 対照は9本。`POST /me` の断り・カードの持ち主・ことばの名簿・台帳の額・
  本文の切り落とし・窓の鳴り・道のログ・ハンドルのログ・リンクの長さを
  1つずつ外した写しで回して、**狙った行が赤くなるか**を見る

---

## 確かめかた

### 配ったあと、本番で見るところ（2026-10-13 の3件）

**どれも GET か、書く前に断られる側。1バイトも書かない。**
左が配る前に実測した値で、右が配ったあとに見たい値。

```bash
B=https://live-streaming-d3cac.web.app/island-api

# 1. チャンネルを名乗れないこと（**書く側を叩かない。断られる側だけ**）
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$B/me" \
  -H 'content-type: application/json' -d '{"channelId":"UCbbbbbbbbbbbbbbbbbbbbbb"}'
#   配る前 401（no token。言い値はそこまで見られていない）→ 配ったあと **400**

# 2. 旅の写真が、新しい入れ物から出ていること（枚数が変わらないこと）
curl -s "$B/nordic/photos" | python3 -c \
  'import json,sys;d=json.load(sys.stdin)["days"];print(len(d),sum(len(x["photos"]) for x in d))'
#   配る前 **27 117** → 配ったあとも **27 117**（減ったら旧にしか無い写真があった）

# 3. 字の長さが口から出ていること
curl -s "$B/state" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("limits"))'
#   配る前 None → 配ったあと {"note":120,"reply":300,"name":20,"link":2048,"planTitle":60}
```

### 配ったあと、本番で見るところ（2026-10-14 の2件）

**どちらも、書く前に断られる側。1バイトも書かない。**

```bash
B=https://live-streaming-d3cac.web.app/island-api

# 4. 2,048字を超えるリンクが、切られずに断られること
L=$(python3 -c 'print("https://x.invalid/" + "a"*2048)')
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$B/stickies" \
  -H 'content-type: application/json' \
  -d "{\"theme\":\"zatsudan\",\"text\":\"かくにん\",\"cid\":\"$(python3 -c 'print("c"*36)')\",\"link\":\"$L\"}"
#   **配ったあとにだけ叩く。** 配る前は 200 が返って、掲示板に1枚貼られる
#   （それが直した中身そのもの）。配ったあとは **400**（bad link）で、1バイトも書かない
#   ※ 200 が返ってしまったら、貼られた1枚を `POST /stickies/{id}/archive` で下ろす

# 5. 台帳に 1,000万円超が入らないこと（**合言葉が要るので 404 で止まる**）
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$B/alertbox/$(python3 -c 'print("9"*32)')/superchat" \
  -H 'content-type: application/json' -d '{"currency":"円","jpy":99999999,"id":"LCC.x"}'
#   配る前も配ったあとも **404**（知らない合言葉。額の門はその先）
#   額の門そのものは `node functions/selftest/api_trust_selftest.mjs` が
#   **本物のルータを動かして**見る——本番の台帳に1円も入れずに確かめられる
```

**配る順は Hosting が先、Functions があと**（1の理由。上の7章）。

---

この文書の口の一覧は、**コードの照合式そのもの**から起こしてある（2026-09-11）。
**2026-10-14 から、起こすのは手ではなく見張り**——下の `--routes` が同じ
一覧を書き出し、**1本でも増減すると `api_trust_selftest.mjs` が赤くなる**（12章）。

```bash
# 口の一覧を、照合式から起こす（77本）
node functions/selftest/api_trust_selftest.mjs --routes

# 信じてはいけない値を送ったら拒まれるか（**本物のルータを偽の置き場で動かす**）
node functions/selftest/api_trust_selftest.mjs

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
