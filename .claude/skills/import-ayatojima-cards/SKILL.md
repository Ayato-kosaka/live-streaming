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
3. Next step → **届け先を「Add to Drive」**・1回・.zip・**2GB** → Create export
4. **Create export でパスワードを聞かれる**（2026-11-15）。画面を出したまま `/ask-ayato` で1回だけ頼む
5. **仕上がりは数時間。** `send_later` で3時間おきに `https://takeout.google.com/manage` を見る。
   待つあいだ EC2 は止める（`ec2.py stop`）

**メールのリンク届けにしない。** 落とすたびに Google がパスワードを聞き直す（本物で当たった）。
ドライブ届けなら落とすときに聞かれないので、あやとの手は作るときの1回で済む。
ドライブを書き出しの大きさぶん使う（2026-11 は 約36GB）。**登録が済んだら、その zip をドライブから消す**（8章）。

年のアルバム単位なので、期間の外も入ってくる。期間で絞るのは `scan`（`--from` `--to`）。

## 2. 落として数える（EC2・`/home/ubuntu/cardimport/`）

道具の置き直し（版が変わったとき・初回）: `python/card_import/` を EC2 の `app/` に置いて `setup.sh`。

`python/card_import/takeout_dl.py` を EC2 の `/home/ubuntu/cdp/` に、`takeout_loop.sh` を `app/card_import/` に置き、
**札を持って裏で回す**。ドライブから zip を1つずつ「落とす → 数える → 消す」を繰り返し、最後に一覧を取り直して
抜けを拾い、`existing`（公開のカード写真と比べる用）と `status` まで回す（2026-11 は 18個・約5時間）:

```sh
nohup /usr/local/sbin/ec2-queue hold gphotos --who card-import --purpose 'Takeout を数える' -- \
  sh /home/ubuntu/cardimport/app/card_import/takeout_loop.sh <開始> <終了> > ~/cardimport/loop.log 2>&1 &
```

- 進みは `loop.log` と `zips_done.txt` の行数（札は取らずに読むだけ）。止まっても同じ命令で続きから
- **ドライブの検索は全部を描かないことがある**（18個中2個が出なかった）。抜けた名前は
  `drive.google.com/drive/search?q=<名前>` で引いて控え（`drive_zips.json`）に足し、`drive-get` → `scan` を手で
- **SSM が `Undeliverable` で応答しなくなったら**、メモリで詰まっている（4GB に Chrome と CLIP が同時に乗った）。
  再起動の権限は無いので `ec2.py stop --force` → `start` で起こし直し、同じ命令で続きから

## 3. 選ぶ

```sh
../venv/bin/python -m card_import.run select --batch <YYYY-MM-DD-takeout>
../venv/bin/python -m card_import.run sheet  --batch <同じ>     # 迷うものだけの一覧画
```

一覧画（`<root>/sheets/`）を `ec2.py get` でスクラッチパッドに持ってきて**こちらが見る**。全部の写真は見ない。
決めた番号を `judge 3=drop 5=keep` で書き戻し、もう一度 `select`。数は `status`（名前もパスも出ない）。
**視聴者さんの名前・ハンドルが写った画面の写真は落とす。**

目安（2026-11）: 写真 9,861 → 期間内 5,341 → 候補 330（255日）。カメラの無い絵（スクショ・配信やアプリの画面・
AI の絵）は `irrelevant.requireCamera` で落ちる。候補が多すぎたら `day.sqrtGain` と `day.max` を下げる。

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

ログの `LABEL <sha> <yes|no>` の行を `{sha: 答え}` の JSON にして EC2 へ置き、`labels` で読ませ、`select` → `sheet` → `pack` → `upload` → `ingest` をやり直す。
答えは `islandCardImport` に残り、次の回からも効く（2回目以降は聞かない）。

## 6. 最終確認を頼む

`/cards/import` に候補が並んでいるのを、**本番で**あやとのアカウントの形で確かめてから（数と日付の束）、
`/ask-ayato` で「候補 N 枚。要らないものを押して外して、最後に『残り N 枚を登録』」と頼む。
確認の窓に、どの日に何枚・カードが渡る人数が出る（`register` の `dryRun`）。

## 7. 登録されたら

- `GET /island-api/nordic/photos` の写真の数が、登録した枚数ぶん増えたか（キャッシュバスタを付ける）
- `card_import.yml` `mode=status` で `registered` と `failed` の数。`failed` があれば画面の「失敗したものだけもう一度」
- EC2 で `clean --batch <B>`（手元の絵を消す。数と埋め込みは次の回の重複判定に残す）
- **ドライブの Takeout の zip を消す**（EC2 の Chrome で `drive.google.com` の検索 `takeout-<日時>` → ゴミ箱）。
  こちらが作った書き出しの写しで、Google フォトの元ではない
- issue に1行で報告して閉じる（`docs/card-import.md` 5章の消しかたもここで済ませる）

## つまずいたところ

- `card_import.yml` が**キューに入ったまま20分以上動かない**ことがある（ほかのワークフローは動いていた）。
  `card_import_url.py` は15〜25分で待つのをやめるので、終わるのを待ってから取り直す
- Actions のログでは、複数行の秘密を伏せる都合で `{` `}` が `***` に化ける。数を読むときは中身だけ見る

## 消さないもの

Google フォトの元。Takeout の zip は EC2 では読み終えたら消すが、Takeout の画面から1週間は落とし直せる。
