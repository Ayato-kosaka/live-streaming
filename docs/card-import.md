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

### 私有の置き場（Firebase の bucket、接頭辞 `cardImport/`）

| パス | 中身 |
| --- | --- |
| `cardImport/inbox/<batch>.tar` | EC2 が上げる1本。開いたら消す |
| `cardImport/cand/<sha>.webp` | 候補の本体。長辺1600px・webp・EXIF なし（位置情報を落とす） |
| `cardImport/thumb/<sha>.webp` | 一覧用。長辺400px |

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

- 取り込み（Actions）は `registered` `registering` `excluded` を**書き換えない**。
  同じ batch の候補で、新しい manifest から消えたものは `withdrawn`
- `excluded` ⇄ `candidate` は画面から何度でも行き来できる
- 登録は `candidate`（と `failed` の再試行）だけを拾う

**`islandCardImportRuns/{batch}`** — 取り込み1回の記録。次の回の期間はここから決まる
（いちばん新しい `range.to` の翌日から今日まで）。中身は manifest の `range` `missing`
`counts` と、`createdAt` `registeredAt` `registered`。

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
| `POST /cardimport/register` `{batch, max, dryRun}` | `max` 枚まで登録して、残りの数を返す。画面が0になるまで呼ぶ |

登録は**手で貼る `POST /nordic/photos` と同じ `saveEventImage` を通す**（`role: "card"`・
写真の日・その場でカードを作る）。違うのは2つだけ:

- 1日120枚の枠（`nphoto`）を使わない。数百枚を一度に登録するため
- `importSha` を書き、先に同じ `importSha` の写真が無いかを見る。
  あれば作らずに `registered` に直す（途中で落ちて再開したときの二重登録の止め）

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
- EC2 に落とした Takeout の zip は、読み終わったら消す（ディスクが 29GB しかない）。
  Takeout の画面から1週間は落とし直せる
- `cardImport/inbox/` の tar は開いたら消す
- `cardImport/cand` `thumb` は、登録しなかった回の候補を次の回の取り込みで片づける
  （登録したものは `nordic/photos/` に別に置かれる）

## 6. 回しかた

`/import-ayatojima-cards`（`.claude/skills/import-ayatojima-cards/SKILL.md`）。
