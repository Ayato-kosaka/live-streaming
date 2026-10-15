---
name: viral-shorts-creator
description: 配信アーカイブの URL から、初見の人が止まって最後まで見る縦型ショート（YouTube Shorts / TikTok、60秒未満、AI の第三者ナレーション）を企画・制作し、人の承認を2回通して出し、数字から次の企画を直す。取り込み（Actions）→ 見どころ → 企画3案 → Gate 1 → 本編集 → Gate 2 → 投稿 → 数字 → 改善。トリガー語:「viral-shorts-creator」「ショートを作って」「この配信をショートに」「企画3案」「バズるショート」。
---

# 配信アーカイブから、ショートを作る

```
/viral-shorts-creator <YouTube の URL>
```

**仕組みと「なぜそうしたか」は `docs/shorts.md`。** ここは手順と判断の基準。
親の issue は #907。段ごとの issue と、あやとに聞いていること（#908 声・#909 BGM・#911 投稿）はそこから引く。

## 0. 先に知っておくこと（2026-10-15 に実測）

- **この箱からは YouTube・TikTok・fish.audio に届かない。** YouTube を落とすのは Actions（`shorts_ingest.yml`）
- **リポジトリは公開。** 途中の結果（フレーム・文字起こし）は暗号化して作業枝に置き、手元で復号して読む。平文をリポジトリに書かない
- **承認は AI と人を名前で見分けられない**（このセッションはあやとのアカウントで書く）。承認は `shorts_gate.yml` が記録したものだけを数える（`tools/shorts/gate.md`）
- **やってはいけない:** `YOUTUBE_COOKIES` を書き換える／21:30〜23:59 UTC に取り込む（毎晩の取り込みとぶつかる）／あやとが企画を決める前に本編集をする（決まるのは issue の返事かチャット）／Gate 2 の承認の前に投稿する／承認のコメントを AI が書く

## 1. 段と、どこまで終わったかの見分け

| 段 | やること | 終わった印 | 手引き |
| --- | --- | --- | --- |
| 1 取り込み | 依頼ファイルを作業枝に push（`archive`）→ Actions → 復号 | `shorts/.work/<id>/archive/manifest.json` が ok、手元に `captions.txt`・`transcript.txt`・`sheets/` | `tools/shorts/ingest/README.md` |
| 2 見どころ | 字幕・コマ・音・チャットを重ねて候補を8本以上。上位は zoom で1秒刻みに確かめる | 候補の表（時刻・前後の文脈・根拠・採点） | `references/highlight_rubric.md` |
| 3 企画 | 体験の違う3案。原稿・絵コンテ・尺の確認・自己評価・事実の表 | `shorts/videos/<id>/p1/plan.md` と絵コンテの絵 | `references/planning.md` |
| 4 Gate 1 | 制作 issue に提出（`gate.py submission`）→ あやとの返事（`A`・`全部`）を待つ。チャットで決まったら待たない | bot の承認記録、またはチャットで決まったことの書き置き | `tools/shorts/gate.md` |
| 5 本編集 | （これから: ナレーション #916・書き出し #917・品質チェック #918） | — | — |
| 6 Gate 2 | （これから: #919） | — | — |
| 7 投稿 | （これから: #920） | — | — |
| 8 数字・改善 | （これから: #921 #922） | — | `references/playbook.md` |

**落ちた段だけをやり直す。** 段の出力が揃っていれば、前の段は回し直さない。

## 2. 取り込み

```bash
# 鍵はセッションごとに作る（秘密鍵はスクラッチパッドから出さない）
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out <scratch>/keys/ref_private.pem
openssl pkey -in <scratch>/keys/ref_private.pem -pubout -out <scratch>/keys/ref_public.pem
```

依頼ファイルの形・mode（`archive` / `reference` / `zoom` / `channel`）・復号のしかたは `tools/shorts/ingest/README.md`。
master からは `workflow_dispatch` でも回せる。

**文字は2系統を突き合わせて読む。** whisper は固有名詞に強く、自動字幕は数字と英単語に強かった（実測: 「SIM」を whisper は「新聞」と書いた）。

配信チャットは BigQuery（`youtube_chat.chat_messages`、配信開始 `videos.actual_start_time` からの秒）。**出来事の 15〜35秒あと**に付く。
視聴者さんの名前はチャットから読まない・どこにも書かない。

## 3. 見どころ（いちばん大事な段）

`references/highlight_rubric.md` に従う。要点だけ:

- **チャットの山＝初見に刺さる、ではない。** 北マケドニアの回の最大の山は登録者1900人のお祝い（常連向け）だった
- **前後の文脈（原因と結末）を必ず確かめる。** 結末の無いハプニングは面白くならない
- **依頼文の説明を信じない。元動画で確かめる。** 北マケドニアの回は「国境を越える」と説明されていたが、アーカイブに国境越えは入っていなかった
- 外の事実（建物の由来・値段・歴史）は出典を付ける。チャットの「〜らしい」は事実ではない
- 1候補に、元動画の区間・冒頭に置ける画の時刻・根拠（字幕の時刻・見たコマ・チャット）を付ける

コマを切り出す・並べる道具: `tools/shorts/plan/frame_at.py`（指定の秒の1コマ）、`tools/shorts/plan/mont.py`（並べて1枚に）

## 4. 企画3案

`references/planning.md` に従う。要点だけ:

- 3案は**視聴体験が違う**もの（ハプニング／グルメ／日本との違い／発見／クイズ など、素材に合わせる）
- **0秒目にいちばんの画と、1行で言い切ったタイトル。4〜8秒に2つ目の山。** あやとの過去ショートは4〜8秒で離れていた（`references/playbook.md` の H1）
- ナレーションは**第三者**。本人の声や口調を AI に真似させない
- 原稿は1文ずつ根拠の時刻を持つ。言い切れないことは「本人いわく」「〜とも」にする
- 尺は**読ませて測る**（`tools/shorts/plan/readtime.py`）。字数で見積もらない

作る順:

```bash
python3 tools/shorts/plan/storyboard.py <spec_A.json> <復号した材料/videoId> <出力>   # 表と絵コンテの絵
python3 tools/shorts/plan/assemble.py <本体.md> <出力> <spec の接頭辞> shorts/videos/<videoId>/p1
```

## 5. Gate 1（企画の承認）

1. 制作 issue を立てる（札 `shorts`）。題は「【ショート制作】<回の名前>（<videoId>）」
2. 提出コメントは `gate.py submission` で1行目のブロックを作り、そのあとに plan.md の中身を貼る（絵は raw.githubusercontent.com のコミット固定の URL）
3. 札 `待ち-あやと` を付け、`call_ayato.yml` で通知する（`ask-ayato` スキル。**自分のアカウントの @ は飛ばない**）
4. **あやとが決めるまで本編集に進まない。** 決まるのは issue の返事（`A`・`全部`）かチャット。チャットで決まったら、その言葉を issue に書き置いて進む——**issue で書き直してもらわない**（書き置きの1行目は案の字で始めない）。待つあいだは別の段（取り込み・調べ）を進める
5. `/revise` が来たら、直して次の版（p2）として出し直す。前の版の承認は効かない
6. 3案とも作るとき（`全部`）の Gate 2 は、3本を**1つの提出**にまとめ（`gate.py submission --gate video --options A,B,C …`）、あやとは `B` と返事して出すものを選ぶ（`B C`・`全部` も可。**1行目は案だけ**）。後段は `gate.py require` の `options` に並んだ案だけを扱う

## 6. 学びの置き場

- 動画ごとの制作記録: `shorts/videos/<videoId>/`（企画・原稿・絵コンテ・編集指示書・投稿の URL・確かめる仮説）
- 仮説とベストプラクティス: `references/playbook.md`。**複数の動画で支持されたものだけを上げる。** 矛盾したら規則のほうを疑う
- 参考ショートの分析（日付つきの記録。あとから直さない）: `references/reference_shorts_2026-10.md`
