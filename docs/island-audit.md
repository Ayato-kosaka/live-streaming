# 島の棚おろし — いま何が、どこに、いくつあるか

**これは「やること」の表ではない。**「いま、こうなっている」を数えて置いてある表。
手を付けるかどうかを決める前に、**数を見に来るところ。**

2026-09-11 に4本の調査（スプシとドライブの依存 / 責務分割 / 水平展開 / 永続化）と、
2026-09-19 に1本（見張りの範囲）を出した。どれも issue に置いてあったが、
**issue は「期限と状態を持つもの」の場所**で、調べた結果の置き場ではない（`CLAUDE.md`）。
向きが逆だったので、こちらへ移した。出どころは #284 #287 #288 #290 #291 #570 #884。

**この紙は、もう数を持っていない。**

2026-09-19 に数えて、そのまま1か月置いたら #884 が立った。
「見張り60本」「口46本」「`ownerUid` 27回」と書いてあったところは、
2026-10-15 に数え直すと**どれも2割〜2倍ちがっていた。**
`functions/src` は 24日で +18〜26% 伸びていた回もある。
**数えかたはどれも正しくて、数だけが古い**——このリポジトリでいちばんよく出る壊れかたで、
手で書き直すかぎり、来月また同じ札が立つ。

だから**書き写すのをやめて、数えかたを名指しする。**

```bash
python3 python/counts.py          # 表で出す（0 を答えにしない。数えられなければ 2 で落ちる）
python3 python/counts.py --json   # 機械で読む形
```

---

# 0. この紙の数は、どこから出るか

**3通りある。どれで出る数かを、必ず書く。**

| | どういう数か | どう出すか | 古くなるか |
| --- | --- | --- | --- |
| **A** | その場で数えられるもの（字・ファイル・設定） | `python3 python/counts.py`。この紙は **`counts.py: <鍵>`** と鍵だけを書く | **ならない。**回すたび今の数 |
| **B** | 書き出してからでないと測れないもの（面の重さ・押しどころ・字の濃さ・書体） | 道具を回す。**終了コードで読む**（0＝通った / 1＝見つかった / **2＝数えるものが無い**） | 測った日の記録として残す |
| **C** | 本番を引くもの（BigQuery / Firestore / YouTube） | この箱からは出られない。ワークフローか手元の道具で引く | **なる。** 日付を必ず添える |

**A の欄に数を書かない。** 鍵の隣に「（いまは◯◯本）」と添えた瞬間、
そこがまた古くなる場所になる。**その1行だけ古くなるのが、いちばん質が悪い**
——道具を回さずに読んでしまうので。

**この紙と `counts.py` の繋がりは、機械が当てている。**

```bash
python3 python/audit_counts_selftest.py
```

見ているのは3つ——(1) この紙が名指しした鍵が `counts.py` に在るか、
(2) 棚おろし向きの欄が、この紙から1度は名指しされているか、
(3) 鍵の**すぐ隣に**数を手で書いていないか。
鍵の名前を変えた日に、この紙は赤くならずに黙って切れる——
`CLAUDE.md` の「繋ぎは `name:` で解決される。あちらを変えると黙って切れる」と同じ形なので、
**両側から当てている。**

## 数え直すときの決まり

- **生 grep のヒットを件数にしない。** `/* */` と `//` を落としてから数える。
  直した記録（コメント）を、直っていない証拠として数えたことが実際にある
  （`counts.py` の `_hits()` が、この決まりを1か所に持っている）
- **数えかたを2か所に書かない。** 口の数は `api_trust_selftest.mjs --routes`、
  見張りの数は `selftest_runner.py --list --json`、繋ぎは `workflow_link_selftest.py` が
  持っている。`counts.py` はそれを**呼んで数えるだけ**で、正規表現を写さない
- **数える道具そのものを数に入れない。** `counts.py` は探す字（`script.google.com/…`）を
  自分の中に書いているので、**自分と自分の対照を外す。** 入れたまま数えたら
  GAS の口が 4 → 6、ドライブの絵が 8 → 10 に見えた（2026-10-15）
- **まず `git fetch`。** 49コミット遅れた木で数えて、既に直っているものを「残っている」と
  報告したことが実際にある
- **「直っている」を grep で言わない。** 画面のことなら、落として撮る（`tools/sprites/lieshot.mjs`）

---

# 1. スプレッドシートと Google ドライブの依存

出どころは #284（2026-09-11。20件あった）。
**配信と島の画面からは、全部剥がれた**（2026-10-15 に確かめた）。
残っているのは**画面のログ1本**と、**手元の移行・突き合わせの道具**だけ。

## 1-1. 何が残っていて、何が消えたか

| | 何だったか | いま（2026-10-15） |
| --- | --- | --- |
| **Viewers 表**（名前↔キャラクターの絵↔絵文字） | `app/alertbox` と `app/ve-comment` が GAS 越しに全件読んでいた | **読む側0。** 両方 `GET /alertbox/{合言葉}/characters` に移った |
| **Goals 表**（目標金額） | `app/alertbox/api.utils.ts` が GAS の `getById` で読んでいた | **画面からは0**（#305 で落ちた）。`app/alertbox/api.utils.ts` は島の口しか叩かない |
| **SuperChats 表**（スパチャの控え） | 同じく GAS の `insert` で書いていた | **画面からは0。** 正は Firestore（`islandFundSuperChats`）と BigQuery |
| **画面のログ** | OBS の面がスプシへ1行ずつ POST | **残件。** 送る本は `lib/log.ts` 1本、呼ぶところは `counts.py: gas_log_calls` |
| **gviz の直読み**（料理ランキング） | `public/料理ランキング変動.html` | **0本。** 面ごと消した（2026-09-21 / #388） |
| **ドライブのキャラクター画像** | `lh3.googleusercontent.com/d/{id}=s{大きさ}` が島のほぼ全面 | **本番0。** `/island-api/characters/{icon}/plain-128.webp` に移った（残りは 1-2） |
| **使っていない env**（`PYTHON_GAS_API_URL` / `_PW`） | 毎晩の取り込みに渡していた | **消した。** `python/fetch_chat_data_old.py` ごと無い |
| **クレジット巻き・なに食べよの進捗バー・チャット表示** | OBS の3面 | **面ごと無い**（`app/` の直下に残る route は `counts.py: obs_pages`。うち `index` は Expo の雛形で、OBS には出さない） |

**ただし、GAS の表そのものは生きている。** 読む側が手元へ移っただけで、
あやとのスプレッドシートは消していない（1-3）。

**`app/alertbox/__tests__/` には `table=Goals` を返す偽物が残っている**（2026-10-15）。
いまのコードはその口を叩かないので、**当たらない枝を立てているだけ。**
消しても誰も困らないが、**配信に出る面の試験なので、消す回は配信の無い日に。**

## 1-2. `lh3.googleusercontent.com/d/` が残っているところ（本番ではない）

**本番の画面は1つも無い。** 残っているのは手元の道具と、移行の記録。

| 何 | 何本か |
| --- | --- |
| 手元の撮影・移行の道具（`tools/sprites/` と `python/admin/characters_migrate.py`） | `counts.py: drive_img`（コメントは数えない） |

`tools/sprites/crawlcheck/stub.html` と `tools/sprites/route.mjs` の1本は
**「届かない先」をわざと置いてある**もの。消さない。

**この欄は、片づいたら 0 になってよい。** 0 でも `counts.py` は落ちない
（`OPTIONAL`）。そのかわり**分母**（`counts.py: code_files`）が落ちたら 2 で止まる——
「片づいた 0」と「1本も見に行っていない 0」を見分けるのはそこ。

## 1-3. GAS の口（`script.google.com/macros/s/…/exec`）

数は `counts.py: gas_exec`。**島の口ではないものが混ざっている**ので、1本ずつ見る。

| どこ | 何の口か | 島のものか |
| --- | --- | --- |
| `python/fund_box.py` の `gas_table()` | Goals / SuperChats を**読むだけ**。呼ぶのは `python/admin/fund_migrate.py` と `fund_diff.py` | **島。** 手元の移行・突き合わせ用。配信も島の画面も通らない |
| `functions/src/nanitabeyoWeeklyReportProxy.ts` / `app/daily_user_stats/lib/api.ts` | なに食べよの週報 | 別のサービス |
| `public/nanitabeyo-improvement-theme-survey/index.html` | なに食べよのアンケート | 別のサービス |

**鍵は1本も要らない口。** `?table=` を付ければ誰でも全件取れる。
**`EXPO_PUBLIC_` は「隠す」ではなく「公開してよい」の宣言**なので、
ここに鍵を持たせても意味がない。閉じるなら口を移す（Functions の中へ）。

**島の側で残っている仕事は1つだけ。** `python/fund_box.py` の頭に
「`GET /fund` は GAS から読む」と書いてあるが、**いまは Firestore を読んでいる。**
字のほうが古い。

## 1-4. なぜ画面のログだけ残っているか

`lib/log.ts` の `sendLog()` は、**OBS の面が「いま何をしたか」をスプシへ1行ずつ送る**もの。
投げ銭のアラートが出た・名前を当てた・口が落ちた、が全部ここを通る。

**配信中に落ちると、画面にそのまま出る。** `app/alertbox` の初期化を通るので、
しくじると OBS に「初期化に失敗しました」の1行だけが映る。
**配信の無い日にやる**、と決めてある。

移す先は Functions のログ（`logsafe` を通る側）だが、
**あやとが配信のあとにスプシで見ている**のであれば、見る先ごと決める話になる。
決める前に動かさない。

---

# 2. 責務分割 — 誰の書類に何が入っているか

出どころは #288（2026-09-11）。

## 2-1. `islandApi.ts` の大きさ

| | いくつか |
| --- | --- |
| `functions/src` 全部（行） | `counts.py: functions_lines` |
| `islandApi.ts`（行） | `counts.py: island_api_lines` |
| 口（`/island-api/*`） | `counts.py: api_routes` |
| `ownerUid(` の呼び出し（`islandApi.ts` の中） | `counts.py: owner_uid_api` |
| `ownerUid(` の呼び出し（`functions/src` 全部） | `counts.py: owner_uid_all` |
| `requireOwner()`（関所を1本にまとめたもの） | `counts.py: require_owner` |
| `islandApi.ts` が直に触るコレクション | `counts.py: api_collections` |

**ファイルは割れていない。** 新しい責務（`islandCharacter.ts` `publicPurge.ts` `fundDesk.ts`）が
外に立ったぶん占める割合は下がったが、**中身そのものは増え続けている**
（2026-09-11 に 3,683行、2026-09-19 に 4,215行、2026-10-15 に数え直すとさらに増えていた）。

**困るのは3つ、それぞれ別。**

1. **同じ関所が何十回もコピーされている。** 1回ごとに `verifyIdToken` + Firestore の読み1回。
   **書き忘れた口が1本でもあれば、そこは誰でも書ける。数えないと分からない形になっている**
2. **並列で作業を配れない。** 企画を直す人と旅の写真を直す人が、必ず同じファイルを踏む
3. **落ちたら全部止まる。** Functions は1つのデプロイなので、付箋・企画・カード・旅の写真・
   ルーレット・アラートボックスが同時に死ぬ

先に `requireOwner()` だけを入れて全部を差し替える回を独立させると、あとが安全になる。
`remote.ts` `donors.ts` `cards.ts` `streamEvents.ts` `islandCharacter.ts` `fundDesk.ts` が
**すでに割れた形**なので、真似る先が中にある。

**関所の数え漏れは、別の見張りが見ている。**
`functions/selftest/api_trust_selftest.mjs` が口を1本ずつ洗って、
**1本でも増減すると赤くなる**（#864）。ここの数はその口から取っている。

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

| | 2026-10-15 に数え直した |
| --- | --- |
| `canDraft` | **ソース0件。** Firestore にも無い |
| `islandUsers.character`（本人がキャラクターを選ぶ欄） | **0件。** `functions/src` の `character` は全部 `islandCharacter.ts` の「キャラクター帳」で、別物 |
| `nickname`（島の側） | `counts.py: nickname`。`app/alertbox/` の `nickname` は**Doneru の通知に入っている別物**（投げ銭した人の表示名）なので、**数えていない。混ぜて消さない** |

## 2-4. 同じ事実が2か所にある

| | どこ | いまどうなっているか |
| --- | --- | --- |
| **顔写真** | `islandUsers.photo` / `islandChannels.photo` | 看板とマイページは新しいほう。**島の名札は古いほう**（`listResidents()` が `u.showPhoto ? u.photo : null` で返す）。アイコンを変えると名札だけ古い顔のまま。**残件** |
| **名前** | `islandApi.ts` の `whoIs()`（ハンドル > チャンネル名 > Google 表示名） / `python/island_channels.py`（毎晩入れ直る） | 名前を決める規則が2系統ある。**残件** |
| **旅の写真** | `islandStreamEventImage`（新） / `nordicPhotos`（旧） | **片づいた**（2026-10-13）。読むのも書くのも新しいほう1本。旧に残った書類を消す側だけ両方を触る |

`islandNextPlans`（旧・企画）は `firestore.rules` で `read, write: if false` に閉じてあり、
`streamEvents.ts` のコメントも「改名しただけ」と書いてある。**閉じ終わっている。**

## 2-5. 同意（`showName` / `showPhoto`）の関所は1か所しかない

判定は **`listResidents()` の中の1か所だけ。** 読む面は `/state`・`/cards`・
`/nordic/photos` の3つで、全部この1か所を通る。
**他人の名札を画面側で出し分けているところは0件**（2026-10-15 に確かめた。
`site/components/me/MyPage.tsx` が `showName` を読んでいるのは
**自分の設定の見出し**（「いまは出しています」）で、名簿には関わらない）。

**移すのが安い理由がこれ。** 書き換えるのは (1) `listResidents()` (2) `POST /me` の保存先
(3) 画面の `IslandMe.tsx` の3つ。

**ただし、移している最中に同意が落ちると取り戻せない。**（4章の退避が効くようになったので、
2026-09-11 当時より条件は良い）

## 2-6. `listResidents()` の上限

`USERS.where("channelId","!=",null).limit(RESIDENT_SCAN)`（いまは 500）。
**同意を出した人がそこを超えると、超えたぶんは名簿に出ない。**

**2026-09-19 からここは変わった。** いまは `capHit()` が通っていて、
上限に当たると Functions のログに「窓が埋まりました」と出る（#864）。
**黙って落ちるのではなくなった**が、**画面にはまだ何も出ない**ので、
押した人からは「名前を出したのに名札が出ない」に見える。

同意を `islandChannels` に移すと、この突き合わせ自体が要らなくなる
（`islandChannels` を1回引けば名前・顔・同意・日数が揃う）。

---

# 3. 水平展開 — 同じ形の失敗が、他にも残っていないか

出どころは #290（2026-09-11）。`docs/island-misses.md`（節の数は `counts.py: misses_sections`）を
**個別の経緯ではなく「同じ形」で束ねた**もの。

| | 同じ形 | いま | 確かめかた |
| --- | --- | --- | --- |
| **A** | 読めなかったことを、0件・空・オフと同じ絵にする | **0**（撮った面のぶん。下） | 落として撮る（grep では言わない） |
| **B** | 1か所直して、同じものを読む他を探さない | **2**（画面1・サーバー1。下） | コメント除去 grep |
| **C** | `!` で「無いことがありうる」を黙らせる | `counts.py: bang_asserts` | 下。**数は分母で、全部が悪いわけではない** |
| **D** | 溜まったときに、上限で黙って落とす | 下 | `counts.py` の3つ |
| **E** | 日付で変わるものを、その日を過ぎた形で見ていない | 仕組みは直っている。残るのは確かめる手順 | `tools/sprites/timetravel.mjs` |
| **F** | 画面でシステムの仕様を説明する | **2**（下） | コメント除去 grep + 1件ずつ読む |
| **G** | 導出があるのに、手で名簿を並べる | **0** | ファイルを読む |
| **H** | 移し先を作って、読む側を移していない | **0**（旅の写真は 2026-10-13 に片づいた） | grep + 行を読む |

## 3-A. 「読めなかった」を空と同じ絵にする

**grep では判定しない。API を落として、実際に撮る。**

```bash
cd site && NEXT_DIST_DIR=.next-lie npx next build
python3 -m http.server 4711 --directory .next-lie &
SPORT=4711 OUT=/tmp/lie-all PART=cases ONLY=503-ぜんぶ node tools/sprites/lieshot.mjs
```

**嘘の字（「からっぽ」「ぜんぶ返した」「まだ書いていません」）は 0**
——**ただしこれは 2026-09-19 に撮った回の話で、B の数**（書き出してからでないと測れない）。
芯の2面（`/me` `/me/desk`）は `abort` と「45秒返さない」でも撮ってあり、そちらも0だった。
**読めなかったときは、押しどころそのものが出ない。**
面はそれから増えているので、**撮り直すまで「いまも0」とは言わない。**

**残っているのは、`lieshot.mjs` が撮る面が島の全部ではないこと。**
撮る面の数は `counts.py: lieshot_pages`、島の面の数は `counts.py: pages`（書き出してから）。
**差が「直っているかどうか分かっていない面」。**
`/`（表紙）・`/now`・`/roulette` の表示側などは載っていない。
**「撮っていない面は、直っていない」ではない。「分かっていない」が正しい。**

面を足すときに `PAGES` へ1行足す、という決めが要る。

## 3-B. 1か所直して、他を探さない — 2件

| | どこ | いまどうなっているか |
| --- | --- | --- |
| 画面 | `site/components/live/IslandMe.tsx` の見本 | 「名札はこう出ます」の見本だけ、ログインを押した日の顔（`user.photo`）を出している。`site/lib/auth.tsx` は `channelPhoto`（毎晩入れ直る）を持っているのに、ここだけ使っていない。**1行** |
| サーバー | `listResidents()` | 画面側3か所は直したが、**そこへ値を渡していた側が直っていない。** 2-4 の1件目と同じもの |

## 3-C. `!` で黙らせる

**数（`counts.py: bang_asserts`）は分母で、全部が悪いわけではない。**
`CHAPTERS.find(...)!` のように「必ず在る」ことが同じ行で読めるものは、
`!` のほうが短くて正しい。

**危ないのは、外から来たものに付いている `!`。** `process.env.…!` と、
口の返しに付いているものがそれ。**字の中の `!` は数えない**ようにしてある
（`ts_read.spans` で code の側だけ見る。素の grep だと `"Konbanwa!"` まで当たって、
2026-10-15 に 51 が 62 に膨らんだ）。

1件ずつ読むのは、数が動いたときでよい。

## 3-D. 上限で黙って落とす

| | いくつか |
| --- | --- |
| `functions/src` の `.limit(` | `counts.py: fn_limits` |
| うち、当たったことを言う口（`capHit()`） | `counts.py: cap_hits` |
| 続きが取れる口（`pageOf<T>()` を通るもの） | `counts.py: page_of` |

**2026-09-19 からいちばん動いたのがここ。** あのときは「続きが取れるのは付箋1本だけ、
当たっても何も言わない」だったが、#864 で `capHit()` が入って、
**埋まったらログに出る**ようになった。

**上限の値はここに書かない。** 名前が付いているものは、その名前で引く
（`functions/src` の `const`。値を写すと、変えた日にこちらだけ古くなる）。

| どこ | 名前 | 溜まったらどうなるか |
| --- | --- | --- |
| 名簿（`listResidents()`） | `RESIDENT_SCAN` | 同意した人がそれを超えると名簿に出ない（2-6）。ログには出る |
| 付箋（お題ごと・待ち・見た・自分の） | `STICKY_THEME_SCAN` / `WAITING_SCAN` / `MINE_SCAN` | 続きが取れるのは付箋の一覧だけ |
| 企画とその画像 | `MAX_EVENTS` / `MAX_IMAGES` / `DAY_EVENT_SCAN` | 画像は `at` の降順なので、落ちるのは古いほう（落ち方は正しい） |
| キャラクター帳・投げ銭の台帳 | `MAX_CHARACTERS` / `MAX_DONORS` | 増えるほうなので、いつか必ず当たる |

**名前の付いていない上限もある**（`.limit(12)` `.limit(5)` のような直書き）。
数の差（`fn_limits` − `cap_hits`）がそれを含んでいて、**当たっても誰も気づかない側。**

`pageOf<T>()` が既に汎用なので掛け替えるだけだが、**画面側が `{items, more, next}` を
受けられる必要がある**（付箋以外は素の配列を受けている）。サーバーと画面を同時に出す。

## 3-F. 画面でシステムの仕様を説明する — 2件

| どこ | 何の字か |
| --- | --- |
| `site/components/live/IslandMe.tsx` | 「どちらかを出すと、島を開いているあいだ、いま見ているところに丸いアイコンが立ちます。」 |
| `site/app/cards/page.tsx` | 同じ説明が `metadata.description` と面のリードに二度 |

**1件目は消すだけでは反対側に倒れる。** 置いてある理由もコメントに書いてある
（「名前を出した人が『見ているのが知られる』ことを知らないまま出すことになる」）。
**消すなら代わりに何で伝えるかを決める。**

## 3-まとめて1人に渡すもの

**3-B の画面1件・3-F の1件目・2-4 の顔写真・2-5 の同意の移動は、全部
`IslandMe.tsx` と `listResidents()` の2か所に集まっている。** 別々に配ると同じファイルを踏む。

---

# 4. 永続化 — 何が消えて、何が戻るか

出どころは #291（2026-09-11。当時「バックアップが1本も無い」）。**いま退避は動いている。**

## 4-1. 2026-09-11 に挙げた7本のいま（2026-10-15 に確かめた）

| | やること | いま |
| --- | --- | --- |
| 1 | `monthlyReview` を閉じる | **済。** `firestore.rules` に `owner()` が入り、`islandUsers/{uid}.admin` を見る。`list` は閉じ、OBS が要る `get` だけ開けてある |
| 2 | Firestore の退避 | **済。** `python/backup/` と `.github/workflows/backup.yml`（cron ＋ 取り込みへの `workflow_run` 繋ぎ） |
| 3 | BigQuery の書き出し | **済。** 4表とも。置き場は `island_backup`（asia-northeast1。**本番は US**） |
| 4 | 視聴者さんの IP を書くのを止める | **済。** `functions/src` の `x-forwarded-for` は **0件。** 溜まっていた38件も落とした |
| 5 | `firestore_delete.py` に dry-run 既定 | **済** |
| 6 | `islandRate` に TTL | **まだ。** `functions/src` に `expireAt` は1件も無い（`expiresAt` は Doneru のトークン期限で別物）。下 |
| 7 | 旧コレクションを消す | **読む側は片づいた**（2-4）。`nordicPhotos` に残った書類を消すのはこれから |

**退避は「取るだけ」ではない。** `backup.yml` の `drill` が毎晩 Firestore エミュレータへ
1コレクション戻して、**件数と中身の指紋が合うか**まで見る。旅の写真も置き場から1枚取り出して
**バイト列が一致するか**まで見る。**本番には1バイトも書かない。** 戻しかたは `docs/island-backup.md`。

## 4-2. 失ったら戻らないもの（C の数。**この箱からは数え直せない**）

BigQuery（`live-streaming-d3cac.youtube_chat`・US）。**最後に数えたのは 2026-09-19。**

| テーブル | 2026-09-11 | 2026-09-19 |
| --- | ---: | ---: |
| `chat_messages` | 135,427行 / 161.1MB | 145,028行 / 174.2MB |
| `doneru_donations` | 974行 | 1,014行 |
| `videos` | 763行 | 778行 |
| `doneru_ingest_runs` | 14行 | 23行 |

数え直すときは BigQuery に聞く（`bq query` か `python/bq/`）。
**ここに書いた数は、書いた日のもの。** 伸び方だけを読む——
8日で 9,601行（+7%）なので、**月に3〜4万行**のつもりでいればよい。

`maxTimeTravelHours` は **168（7日）**。**7日を過ぎた事故は、退避が無ければ戻らない。**
だから退避が要る。

Firestore の件数は **2026-09-11 の実測のまま。数え直していない**
（`run_admin_script.yml` → `collections_audit` を回す必要がある）。
当時の並び:
`islandChannels` 2,260 / `islandTips` 1,357 / `islandRate` 150 / `islandHearts` 31 /
`islandDonors` 28 / `islandNotes` 25 / `islandStreamEvent` 16 / `islandPollVotes` 10 /
`islandIdeas` 8 / `islandPolls` 7 / `islandVisits` 7 / `nordicDays` 6 / `islandCards` 4 /
`islandUsers` 2 / `islandNextPlans` 2 / `islandStreamEventImage` 2 / `nordicPhotos` 2 /
残り5本が1件ずつ。

**この2つは1年経っても古いままになりうる。** 回すのに本番の鍵が要るので、
**数え直した回に、必ず日付ごとここへ書く。**

## 4-3. 消えてよいものと、困るものが同じ箱に並んでいる

**TTL のフィールドも、TTL ポリシーも、掃除のジョブも、Firestore 側には1つも無い。**

`islandRate`（回数制限のカウンタ。書類ID = `{種別}_{日付}_{端末ID}`）は、
**その日限りのものなのに永久に積む。** `takeQuota()` が書く。

**いまは誰も困らない。困るのは2つ。**

1. 島に人が来るほど、**戻らないゴミが毎日増える**（1日20人 × 5種別なら年3.6万件）
2. **投げ銭の台帳と同じ箱に入っているせいで、「Firestore を消してよいか」の判断が一生できない。**
   消してよいものと戻せないものが混ざっていると、掃除する人は毎回全部を疑うことになる

直すのは「書類に `expireAt` を持たせて TTL ポリシーを1本張る」だけ。**ただし TTL ポリシーは
コンソールか gcloud の操作**で、サービスアカウントに `datastore.indexAdmin` が無い。

そして `takeQuota()` は**付箋・企画・日記・訪問者数の全部の書く口が通る関所**なので、
落ちたら島に何も書けなくなる。**配信のある日にやらない。**

## 4-4. `firestore.rules` と、実際にあるコレクション

ルールが名指ししている箱の数は `counts.py: rules_collections`。
2026-09-11 に「ルールに無いのに本番にある4本」と書いたうち、
`islandPolls` `islandPollVotes` `islandVisits` は**明示された。**

**ここは本番（C）と突き合わせないと意味が半分になる。**
ルールに在って本番に無い箱は害が無いが、**本番に在ってルールに無い箱は開いている。**
突き合わせるのは `collections_audit`（4-2 と同じ回で回す）。

---

# 5. 見張りと繋ぎが見ている範囲

出どころは #570（2026-09-19）と #884。**いま壊れてはいないが、範囲が狭いもの。**

## 5-1. 見張り

| | いくつか |
| --- | --- |
| `python3 python/selftest_runner.py` が拾う本数 | `counts.py: watches` |
| `logsafe` を取り込んでいる本 | `counts.py: logsafe_books` |
| うち `logsafe_selftest` が登録してある口 | `counts.py: logsafe_checks` |
| `text_expires_watch` が見ていない置き場 | `counts.py: outside_text_watch` |

**2026-09-19 から倍以上に増えた。** あのとき60本だったものが、2026-10-15 には3桁になっている。
**増えたこと自体は良い。** 問題は下の4つで、どれも「範囲」の話。

| | 見張り | 範囲が狭いところ | 当ててみた結果 |
| --- | --- | --- | --- |
| 1 | `public_ids_selftest` | 毎 PR で回るのは**対照だけ**（回し役が `--offline` を渡す）。本番に当てる回は、どのワークフローからも自動では走らない。見に行く道は手書き | **身元の当たり0件**（2026-09-19） |
| 2 | `logsafe_selftest` | 登録してある口（上の表）より、`logsafe` を使う本のほうが**4倍以上多い** | 登録外の本も `mask` / `detail_lines` を使っていて、自前の書き直しは無い。**守りが外れた日に、登録外だけ黙る** |
| 3 | `crosscall_selftest` | `python/*.py` の**1階層だけ**（`glob("*.py")`。`rglob` ではない）。`python/admin/` `python/bq/` `python/backup/` を1行も読まない | 同じ目を `python/` 配下ぜんぶに当てて**食い違い0件**（2026-09-19） |
| 4 | `text_expires_watch` | `site/{app,content,components}` の `.ts/.tsx` だけ。範囲外は `public/*.html`・直下の `app/`・`site/lib/` | 2026-10-13 に**本物の判定器を範囲外へ当て直した**（写しを作って `--dir`）。画面に出る字 203件・うち日付を持つ 1件・**嘘0件**。ただし誰も見ていないので、明日1件入っても赤くならない |

**1〜4 はどれも「いま実害0」。** 直す価値があるのは 1 と 3 で、
どちらも**範囲を広げても結果が変わらないことを確かめてある**ので、広げるのは安い。

## 5-2. 繋ぎ（`workflow_run`）と cron

| | いくつか |
| --- | --- |
| ワークフロー | `counts.py: workflows` |
| 繋ぎ（`workflow_run`） | `counts.py: workflow_links` |
| 繋ぎを持つワークフロー | `counts.py: workflow_linked` |
| **繋ぎ先** | `counts.py: workflow_targets` |
| `cron:` を持つワークフロー | `counts.py: cron_workflows` |

**いちばん大事なのは「繋ぎ先」の少なさ。** 繋ぎの数に対して繋ぎ先がひと握りしかない
——つまり**毎晩の仕事のほとんどが、数本の親にぶら下がっている。**
親が1本止まると、下流が黙って動かなくなる（赤くならない。走らなくなるだけ）。

- **繋ぎの名前が実在するか**は `python/workflow_link_selftest.py` が毎 PR で当てている
- **繋いだ先が起きるか**は `Fetch Doneru Donations` を `probe: true` で押して見る
  （1バイトも書かずに40秒で終わる）
- **cron がいつ走ったか**は `python3 python/cron_lag.py`。
  **ここに遅れの数字を書かない**（6日で古くなり、しかも「遅すぎる」と誤って騒ぐ側に倒れる）

## 5-3. 書き出してからでないと測れないもの（B の数）

**この紙には数を置かない。** 測った回の数字は、日付のついた記録のほう
（`docs/island-misses.md` と issue）に残す。ここに置くのは**何で測るか**だけ。

| 何を | 道具 | 読み方 |
| --- | --- | --- |
| 面の数 | `counts.py: pages`（`tools/build.sh` のあと） | 一覧は書き出しを歩いて作る（`tools/sprites/islepages.mjs`） |
| 1面の重さ（転送バイト） | `tools/sprites/pagebytes.mjs` | 種類ごとに分ける。合計だけ見ても何が重いか出ない |
| 押しどころ・字の濃さ | `tools/sprites/tapink.mjs`（`hitbox` `shotstable` `inkpx` `inkband` を起こす） | **4本ぜんぶの終了コードを見るまで「測った」と言わない** |
| 書体のバイト数 | `tools/sprites/fontweigh.mjs` と `fontbudget_selftest.mjs` | 太さごとに切り分けてある |

**「違反0件」は、見た面の数と一緒に読む**（`docs/island-standards.md` §15）。
0件は「守れている」と「何も見ていない」の2通りに読める。

---

# 6. 手を付けるなら、この順

**上から順にやると、後ろが楽になる。**

| | やること | なぜこの順か |
| --- | --- | --- |
| 1 | **`IslandMe.tsx` と `listResidents()` をまとめて1人に渡す**（2-4 顔写真・2-5 同意の移動・3-B・3-F の1件目） | 全部同じ2か所。別々に配ると踏み合う。関所が1か所しかない**いま**がいちばん安い |
| 2 | **`requireOwner()` を入れて `ownerUid(` を差し替える** | ファイルを割る前にこれを独立させると、あとが安全になる |
| 3 | **`islandApi.ts` の長いハンドラを割る** | 2 のあと。7〜9本に分けて**1本ずつ出す** |
| 4 | **`islandRate` に TTL**（4-3） | 全部の書く口が通る関所。**配信の無い日に** |
| 5 | **上限に続きを付ける**（3-D） | `capHit()` でログには出るようになった。次は画面に出す側 |
| 6 | **画面のログの置き場を決める**（1-4）・**`lieshot.mjs` に面を足す**（3-A）・**`nordicPhotos` の書類を消す**（4-1 の7） | 急がない |

**1件直したら、同じ理由で壊れているところを探しに行く。**
この文書に挙がっているのは「見つかった数」であって、「直すべき全部」ではない。
