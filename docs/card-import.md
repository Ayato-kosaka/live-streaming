# 写真の取り込み（Google フォト → あやと島カード）

**これは仕様である。** 旅の写真をまとめて取り込み、機械で選び、あやとが要らないものだけ
外して、残りを一括で「あやと島カード」の写真として登録する。手で1枚ずつ貼る
`/cards` の口（[`island-cards.md`](./island-cards.md)）の、まとめて版。

**登録した写真は、手で貼った写真とまったく同じ扱いになる。** 写真の日に投げ銭して
くれた人へカードが渡る（`island-cards.md` 2章の掛け算）。過去の日の写真を登録すれば、
その日の台帳（`islandTips`）にいる人へ、さかのぼってカードが渡る。

---

## 1. 流れ

```
Google フォト ──Takeout（EC2 の Chrome）──▶ EC2: zip を1つずつ落とす
   ──▶ EC2: 読む・数える（重複・質・無関係・CLIP）──▶ EC2: 選ぶ（日ごとの釣り合い）
   ──▶ 1本の tar にまとめて、私有の置き場（GCS）へ PUT（署名付き URL は Actions が出す）
   ──▶ Actions: tar を開いて候補を置き、Firestore に候補を書く
   ──▶ /cards/import（あやとだけ）: 要らないものを外す → 「残り N 枚を登録」
   ──▶ Functions: 1枚ずつ、手で貼るのと同じ処理で登録（カードもその場で作られる）
```

| 段 | どこで | なぜそこか |
| --- | --- | --- |
| Takeout を作る・落とす | EC2 の Chrome（`~/cdp-gphotos`） | ログインが要る。Google の正規の書き出し口 |
| 読む・選ぶ | EC2（`/home/ubuntu/cardimport/`） | 写真の元を EC2 の外へ出さない。ディスクが小さいので zip は1つずつ |
| 候補を置く | 私有の置き場 `cardImport/`（ダウンロードの合言葉を付けない） | ルールが全部 deny。Admin SDK だけが読める |
| 外す・登録する | `/cards/import` と `/island-api/cardimport/*` | 既存の「あやとだけ」の口（`ownerUid`）に乗る |

**Actions のログ・成果物に写真を置かない。** このリポジトリは公開で、ログも成果物も
誰でも読める。Actions が受け取るのは私有の置き場の中のものだけで、ログに出すのは数だけ。

## 2. 置き場とデータの形

### 私有の置き場

| バケット | パス | 中身 | 書くのは |
| --- | --- | --- | --- |
| `live-streaming-d3cac-shorts-preview` | `transfer/cardimport/<batch>.tar` | EC2 が上げる1本（受け取り口）。開いたら消す。**開かなくても1日で消える** | EC2（署名付き PUT URL） |
| Firebase の既定（`…firebasestorage.app`） | `cardImport/cand/<sha>.webp` | 候補の本体。長辺1600px・webp・EXIF なし（位置情報を落とす） | Functions（`POST /cardimport/put`） |
| 同上 | `cardImport/thumb/<sha>.webp` | 一覧用。長辺400px | 同上 |

**受け取り口が Firebase の置き場でないのは、Actions がそこに1つも権限を持たないから**
（`docs/island-misses.md` #61・#283。`python/admin/_owner.py` の頭）。そこへの署名付き URL を
作っても、上げると 403 になる。Actions が `roles/storage.admin` を持っているのは
ショートの下見の非公開バケット（#938。公開アクセス防止を強制）だけなので、そこの
`transfer/`（1日で消える決まりが掛かっている。`tools/shorts/preview/gcs.py`）に受ける。
**候補の本体は Functions に頼んで置く**（キャラクターの移行と同じ道）。登録と一覧の口が
Functions から読むので、置き場は Firebase の既定のものでないといけない。

`<sha>` は**元の写真ファイルの SHA-256**（64桁）。同じ写真は何度取り込んでも同じ名前になる。

**ダウンロードの合言葉（`firebaseStorageDownloadTokens`）を付けない。** 付けると URL を
知っている人に見える。画面へは `GET /island-api/cardimport/img/<sha>` が、あやとの
ID トークンを見てから中身を返す。

### tar の中身

```
manifest.json
<sha>.webp        長辺1600px
<sha>.t.webp      長辺400px
```

`manifest.json`:

```json
{
  "batch": "2026-11-14-takeout",
  "source": "takeout",
  "range": {"from": "2024-09-11", "to": "2026-09-10"},
  "missing": [{"from": "…", "to": "…", "why": "…"}],
  "counts": {"scanned": 0, "notImage": 0, "outOfRange": 0, "exactDup": 0, "broken": 0,
             "lowQuality": 0, "irrelevant": 0, "nearDup": 0, "alreadyCard": 0,
             "pool": 0, "selected": 0, "calib": 0},
  "items": [
    {"sha": "64桁", "day": "YYYY-MM-DD", "takenAt": "ISO8601",
     "w": 1600, "h": 1200, "tw": 400, "th": 300,
     "category": "food", "score": 0.73, "group": "g0012",
     "kind": "candidate", "ambiguous": false, "reasons": ["…"]}
  ]
}
```

- `kind` は `candidate`（登録予定に並ぶ）か `calib`（認識合わせ用に1回だけ聞く）
- `day` は**写真の日。撮った土地の日付**（EXIF の撮影時刻はその土地の時刻）。
  カードの `day` はここから決まる
- `group` は「似た写真の束」。一覧で並べて比べるのに使う
- **位置（緯度経度）・ファイル名・元のパスは入れない**

### Firestore

**`islandCardImport/{sha}`** — 候補1枚。書くのは Actions（取り込み）と Functions（外す・登録）。

| 欄 | 意味 |
| --- | --- |
| `batch` | どの取り込みか |
| `day` `takenAt` `w` `h` `tw` `th` `category` `score` `group` `reasons` | manifest のまま |
| `status` | `candidate` / `calib` / `excluded` / `registering` / `registered` / `failed` / `withdrawn` |
| `calibAnswer` | 認識合わせの答え。`yes` / `no` / 無し |
| `imageId` | 登録したあとの `islandStreamEventImage` の ID |
| `error` | 失敗の理由（短い字） |
| `updatedAt` | ms |

状態の決まり:

- 取り込み（Actions）は `registered` `registering` `excluded` を**書き換えない**
  （状態だけでなく、`batch` も含めて書類に1文字も触らない）。
  同じ batch の `candidate` `calib` `failed` で、新しい manifest から消えたものは `withdrawn`
- それ以外（無い・`candidate`・`calib`・`failed`・`withdrawn`）は manifest の中身で上書きする。
  `calibAnswer` と `imageId` は残す。`failed` は `candidate` に戻る（`error` は消える）
- `excluded` ⇄ `candidate` は画面から何度でも行き来できる。だから取り込みは、
  `excluded` の書類には触らないが、**本体と一覧用は置き直す**（戻したときに要る）
- 登録は `candidate` と、`registering` のまま**10分以上たったもの**（途中で落ちた回の続き）を拾う。
  `failed` は `retryFailed: true` のときだけ拾う（直らない1枚で画面が回り続けないように）
- 取り込みは、置き場に置けなかった1枚を候補として書かない（中身の無い1枚が並ぶので）

**`islandCardImportRuns/{batch}`** — 取り込み1回の記録。次の回の期間はここから決まる
（いちばん新しい `range.to` の翌日から今日まで）。中身は manifest の `range` `missing`
`counts` `source` と、`items`（manifest の写真の数）`createdAt` `updatedAt`（取り込みが書く）、
`registeredAt` `registered`（登録の口が書く。`registered` はその回で登録済みの数）。

**`islandStreamEventImage` に `importSha` を足す。** 登録した写真がどの候補から来たか。
**二重登録の止め**はこれで引く（単一の欄なので索引は要らない）。

どちらのコレクションも `firestore.rules` に書かない（＝ブラウザからは読めない・書けない）。

## 3. 口（`/island-api/cardimport/*`、全部あやとだけ）

| 口 | 何をする |
| --- | --- |
| `GET /cardimport` | 取り込みの一覧と、いちばん新しい（`?batch=` で指定した）回の候補を返す |
| `GET /cardimport/img/<sha>?s=t` | 中身（webp）。`s=t` で一覧用、無ければ本体 |
| `POST /cardimport/decide` `{shas, exclude}` | 外す／戻す |
| `POST /cardimport/calib` `{answers:[{sha, answer}]}` | 認識合わせの答え |
| `POST /cardimport/register` `{batch, max, dryRun, retryFailed}` | `max` 枚まで登録して、残りの数を返す。画面が0になるまで呼ぶ |
| `POST /cardimport/put` `{sha, cand, thumb}` | 取り込み（Actions）が候補の本体と一覧用を置く。画面は使わない |

**あやとでなければ、どの口も最初に 403。** 形の検め（sha・本文）はそのあと。
どの口も `Cache-Control: no-store`（中身だけ `private, max-age=86400`）。

入出力（中身を返す口のほかは JSON）:

| 口 | 受けるもの | 返すもの |
| --- | --- | --- |
| `GET /cardimport` | `?batch=`（無ければいちばん新しい回） | `{runs:[{batch, range, missing, counts, items, createdAt, registeredAt, registered}], batch, status:{状態: 数}, items:[…], more}`。`items` の1枚は `{sha, batch, status, day, takenAt, w, h, tw, th, category, score, group, ambiguous, reasons, calibAnswer, imageId, error, updatedAt}`。`withdrawn` は `status` に数えるだけで並べない。`runs` は新しい順に30回まで |
| `GET /cardimport/img/<sha>` | `<sha>` は16進64桁（小文字）だけ。違えば 400 | webp。無ければ 404 |
| `POST /cardimport/decide` | `shas`（16進64桁を1〜400個。1つでも形が違えば 400）・`exclude`（true / false） | `{changed, skipped}`。動くのは candidate ⇄ excluded だけ |
| `POST /cardimport/calib` | `answers`（1〜400個）。`answer` は `"yes"` `"no"` か `null`（消す） | `{saved, skipped}`。書くのは `status: calib` の書類だけ |
| `POST /cardimport/register` | `batch`・`max`（1〜20、既定10）・`dryRun`・`retryFailed` | 登録: `{batch, registered, failed:[{sha, error}], remaining, results:[{sha, status, error}], already, moved, failedTotal}`。`registered` はこの呼び出しで registered になった数（同じ `importSha` の写真がもう在ったので作らずに直した `already` も含む）、`failed` はこの呼び出しで落ちた写真、`remaining` は残り（**failed は入れない**）、`moved` は拾ったあと状態が動いていて触らなかった数、`failedTotal` はその回で failed のままの数。下見（`dryRun: true`）: `{dryRun, batch, total, days:[{day, count, people}], people}`。**1バイトも書かない**。日ごとの `people` はその日の写真に当たる人数（`tipsForImage` で、同じ人は1人）、上の `people` はその和（延べ）。名前も ID も返さない |
| `POST /cardimport/put` | `sha`・`cand`（base64 の webp、1KB〜4MB）・`thumb`（base64 の webp、600KB まで） | `{ok, bytes}`。ダウンロードの合言葉は付けない |

登録は**手で貼る `POST /nordic/photos` と同じ `saveEventImage` を通す**（`role: "card"`・
写真の日・その場でカードを作る）。違うのは2つだけ:

- 1日120枚の枠（`nphoto`）を使わない。数百枚を一度に登録するため
- `importSha` を書き、先に同じ `importSha` の写真が無いかを見る。
  あれば作らずに `registered` に直す（途中で落ちて再開したときの二重登録の止め）

手で貼る口は何も渡さないので、前と1バイトも変わらない（枠を使い、`importSha` の欄を作らない）。
写真の企画は手で貼るのと同じく、その日のいちばん古い企画に付く。

### Actions 側（`.github/workflows/card_import.yml`、workflow_dispatch だけ）

本体は `python/card_import_actions.py`。**ログ・summary・成果物に写真も URL も出さない**（数と sha と日付の範囲だけ）。

| mode | 何をする |
| --- | --- |
| `url` | 受け取り口への署名付き PUT URL（1時間）を1本作り、依頼の公開鍵で包んで作業枝 `shorts/.work/cardimport/<nonce>/` に置く（`tools/shorts/ingest/seal.py` の形） |
| `ingest` | tar を開いて検める（ふつうのファイルだけ・名前は `manifest.json` `<sha>.webp` `<sha>.t.webp` だけ・中身が webp・大きさ・day が日付・kind・位置や名前の欄が無い・manifest と tar の写真が一致）。1つでも外れたら回ごと断って何も書かない。通れば本体と一覧用を Functions に置かせ、状態の決まりに沿って Firestore に書き、tar を消す。置けなかった1枚があれば tar を残して赤く終わる |
| `labels` | `{sha: "yes"\|"no"\|"excluded"}` を job summary に出す（`batch` を空にすれば全部の回） |
| `status` | 回ごとの範囲・選んだ数・状態の内訳を job summary に表で出す |

作業箱から URL をもらうのは1コマンド（Actions を起こす → 待つ → 開く → 作業枝の暗号文を下ろす）。
標準出力には URL だけが出る:

```bash
curl --fail -T batch.tar "$(python3 python/card_import_url.py --batch 2026-11-14-takeout)"
```

秘密鍵はリポジトリの外の一時の場所にだけ作り、終わったら消す。結果を置く枝は
`claude/card-import-inbox`（無ければ Actions が作る）。見張りは
`python/card_import_actions_selftest.py` と `functions/selftest/card_import_selftest.mjs`。

## 4. 選びかた

設定は `python/card_import/config.json`。閾値を変えるときは、ここだけを触る。

1. **機械で落とす**: 読めない・小さすぎる・期間の外・完全重複（SHA-256）・
   スクリーンショット／書類／レシート／画面の写真・ひどいブレ／暗さ／白飛び
2. **似た写真をまとめる**: pHash と CLIP の近さで束ね、束の中で質のいちばん良いものを残す。
   **構図や中身が違えば、同じ場所でも残す**
3. **すでにカードになっている写真を落とす**: 公開の `GET /nordic/photos` の写真と比べる
4. **日ごとに配る**: 1日に出す枚数は、その日の良い写真の数で緩やかに増やす（上限あり）。
   同じ日の中では、種類（食事・街並み・自然・宿…）と見た目がばらけるように選ぶ。
   **固定の総数は決めない**
5. **あいまいなものだけ、まとめて見る**: 点が境目にあるものだけ番号付きの一覧画にして
   1回で見る（全部を1枚ずつ見ない）
6. **認識合わせ（最初の1回）**: 採りそう・迷う・落としそうを混ぜた24枚を、
   `/cards/import` で「入れる／入れない」で答えてもらう。答えは `islandCardImport` に
   残り、次の回からも選びかたに効く（似た写真の答えに寄せる）

人の写った写真は落とさない（旅の写真の大事な一部）。ただし**書類・画面・番号の写った
もの**は落とす。迷ったら候補に残す——最後に外せるから。

## 5. 消しかた

- **Google フォトの元は、どの段でも消さない**
- EC2 に落とした Takeout の zip は、読み終わったら消す（ディスクが 29GB しかない）
- Takeout は**ドライブ届け**にする（メールのリンク届けは、落とすたびにパスワードを聞き直される）。
  ドライブに置かれた zip は、登録が済んだら消す（あやとのドライブを 約36GB 使うため）
- `cardImport/inbox/` の tar は開いたら消す
- `cardImport/cand` `thumb` は、登録しなかった回の候補を次の回の取り込みで片づける
  （登録したものは `nordic/photos/` に別に置かれる）

## 6. 回しかた

`/import-ayatojima-cards`（`.claude/skills/import-ayatojima-cards/SKILL.md`）。
