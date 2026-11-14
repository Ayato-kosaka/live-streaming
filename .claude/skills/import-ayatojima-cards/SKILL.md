---
name: import-ayatojima-cards
description: Google フォトの旅の写真をまとめて取り込み、機械で選び、あやとが要らないものだけ外して、残りを一括で「あやと島カード」に登録する手順。前回の取り込みから期間を決める → Takeout（EC2 の Chrome）→ EC2 で数えて選ぶ → 候補を私有の置き場へ → /cards/import で外してもらう → 登録 → 本番で数える。定期実行はしない（呼ばれたときだけ）。トリガー語:「新しい旅行写真をあやと島カードに取り込んで」「写真を取り込んで」「Google フォトからカード」「カードの一括登録」「import-ayatojima-cards」。
---

# 写真を取り込んで、あやと島カードにする

仕様は `docs/card-import.md`（流れ・置き場・データの形・選びかた・消しかた）。
**ここは回しかただけ。** 形を変えたら docs を直す。

**あやとの手が要るのは2回だけ**: 初回の認識合わせ（24枚）と、最後の登録ボタン。
**登録ボタンが押されるまで、公開のカードは1枚も作らない**（候補は私有の置き場にしか無い）。

## 0. 期間を決める

```bash
gh api -X POST repos/Ayato-kosaka/live-streaming/actions/workflows/card_import.yml/dispatches \
  -f ref=master -f 'inputs[mode]=status'
```

job summary の表に、回ごとの `range` と状態の内訳が出る。**次の期間は、いちばん新しい `range.to` の翌日〜今日。**
指定されたらそれに従う（`--from` `--to`）。2026-09-11 以降は、手で貼った写真と重なる——
重なりは既存カードとの重複判定（`existing`）が落とすので、そのまま回してよい。

## 1. Takeout を作る（EC2 の Chrome・列 `gphotos`）

`ec2-chrome` スキルの 0〜2.5章を先に読む。プロファイルは `~/cdp-gphotos`（あやとの Google、
kosaka.ayato@gmail.com）。2026-11-14 はログインのし直し無しで Takeout に入れた。
**パスワードの画面が出たら、そこで止めて `/ask-ayato`**（画面を出したまま知らせる。札は持ち続けない）。

1. `https://takeout.google.com/settings/takeout/custom/photos`
2. 「All photo albums included」→ Deselect all → 期間にかかる「Photos from YYYY」だけに印 → OK
3. Next step → 既定のまま（メールでリンク・1回・.zip・**2GB**）→ Create export
4. **仕上がりは数時間〜数日。** `send_later` で3時間おきに `https://takeout.google.com/manage` を見る。
   待つあいだ EC2 は止める（`ec2.py stop`）

年のアルバム単位なので、期間の外も入ってくる。期間で絞るのは `scan`（`--from` `--to`）。

## 2. 落として数える（EC2・`/home/ubuntu/cardimport/`）

道具の置き直し（版が変わったとき・初回）: `python/card_import/` を EC2 の `app/` に置いて `setup.sh`。

zip は**1つずつ**落として、読んで、消す（ディスクが小さい。空きが 0.8GB を切ると scan が止まる。
同じ命令で続きから）。1枚 1.0〜1.3秒、2万枚で6〜7時間。**裏で回すときは札を持つ**:

```sh
nohup /usr/local/sbin/ec2-queue hold gphotos --who card-import --purpose 'Takeout を数える' -- \
  sh -c 'cd /home/ubuntu/cardimport/app && ../venv/bin/python -m card_import.run scan --from <開始> --to <終了> --delete <zip>' &
```

続けて `existing`（公開のカード写真を落として、既に配っている写真を見分ける）。

## 3. 選ぶ

```sh
../venv/bin/python -m card_import.run select --batch <YYYY-MM-DD-takeout>
../venv/bin/python -m card_import.run sheet  --batch <同じ>     # 迷うものだけの一覧画
```

一覧画（`<root>/sheets/`）を `ec2.py get` で持ってきて**こちらが見る**。全部の写真は見ない。
決めた番号を `judge 3=drop 5=keep` で書き戻す。数は `status`（名前もパスも出ない）。

閾値は `python/card_import/config.json` だけを触る（理由は `conf.py`）。

## 4. 候補を上げる

```bash
# 作業箱: 受け口の署名付き URL を1本（この回だけの鍵で包んで返ってくる。表に出さない）
U=$(python3 python/card_import_url.py --batch <B>)
```

EC2 で `pack` → `CARD_IMPORT_PUT_URL="$U" … upload <tar>`（URL は SSM のコマンドに1本だけ載る。ファイルに残さない）。
上がったら Actions の `card_import.yml` を `mode=ingest` `batch=<B>` で押す。summary の数を読む。

## 5. 認識合わせ（最初の回だけ）

答えがまだ1つも無ければ、`select` が `calib` の24枚を混ぜる。`/cards/import` を開くと先に
「この写真をカードに入れますか？」が出る。**`/ask-ayato` で1回だけ頼む**（issue に「何枚・何分」と、面の URL）。

答えが来たら:

```bash
gh api -X POST …/card_import.yml/dispatches -f ref=master -f 'inputs[mode]=labels'
```

summary の JSON を EC2 へ `labels` で読ませ、`select` → `sheet` → `pack` → `upload` → `ingest` をやり直す。
答えは `islandCardImport` に残り、次の回からも効く（2回目以降は聞かない）。

## 6. 最終確認を頼む

`/cards/import` に候補が並んでいるのを、**本番で**あやとのアカウントの形で確かめてから（数と日付の束）、
`/ask-ayato` で「候補 N 枚。要らないものを押して外して、最後に『残り N 枚を登録』」と頼む。
確認の窓に、どの日に何枚・カードが渡る人数が出る（`register` の `dryRun`）。

## 7. 登録されたら

- `GET /island-api/nordic/photos` の写真の数が、登録した枚数ぶん増えたか（キャッシュバスタを付ける）
- `card_import.yml` `mode=status` で `registered` と `failed` の数。`failed` があれば画面の「失敗したものだけもう一度」
- EC2 で `clean --batch <B>`（手元の絵を消す。数と埋め込みは次の回の重複判定に残す）
- issue に1行で報告して閉じる（`docs/card-import.md` 5章の消しかたもここで済ませる）

## 消さないもの

Google フォトの元。Takeout の zip は EC2 では読み終えたら消すが、Takeout の画面から1週間は落とし直せる。
