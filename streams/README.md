# streams/ — 配信アーカイブの文字起こしとチャット

配信1本ごとに、**何を話したか**（YouTube の自動字幕）と**チャット**を文字で置いてある。
あとから「あの配信で何があったか」を読むための元。

## 読むときは、上から

1. **月の目次 `streams/YYYY/MM.md`** — その月の配信と、1本ずつの一言
2. **議事録 `streams/YYYY/MM/<stem>.md`** — 1本ぶんの流れと出来事
3. 生の文字起こし・チャット（下）— **要るときだけ開く。** 1本で数万字ある

目次と議事録の作りかたはスキル `stream-notes`（`.claude/skills/stream-notes/SKILL.md`）。
まだの回・形の確かめ・目次づくりは `python/stream_notes.py`（`pending` / `check` / `index`）。
**目次は手で直さない**（`index` が議事録から作り直す）。

## 何がどこにあるか

| ファイル | 中身 |
| --- | --- |
| `streams/YYYY/MM/<stem>.transcript.txt` | 自動字幕を **30秒ごとに1行** `[h:mm:ss] 発話`。流れる字幕の重なりは落としてある |
| `streams/YYYY/MM/<stem>.chat.txt` | チャットを時刻順に `[h:mm:ss] 名前: 本文`。投げ銭は `[h:mm:ss] ¥500 名前: 本文` |
| `streams/manifest.tsv` | 1配信1行の一覧。字幕の状態（`ok` / `none` / `error`）・字数・チャット件数・取った日・取りに行った回数 |

`<stem>` は `YYYY-MM-DD_HHMM_<videoId>`（**配信の開始時刻、JST**）。年月の階も JST で切る。
**曲の区間は伏せてある（#969）。** 自動字幕は流した曲の歌詞まで字にすることがあるので、
`[音楽]` / `♪` のある30秒は話ごと `[h:mm:ss] [音楽]` だけにしてある（`manifest.tsv` の note に「曲の区間 N行を伏せた」）。

どちらのファイルも頭の `# ` の行がヘッダ（題名・URL・開始時刻・字幕の種類・行数）。
時刻はどちらも**アーカイブの中の時刻**なので、同じ時刻で突き合わせられる。

字幕が無い・取れなかった配信は、`manifest.tsv` に行だけあって `transcript.txt` が無い。
自動字幕は配信のあと遅れて付くことがあるので、**3回まで**取り直してから諦める。

## 誰が書くか

**手で書かない。** `.github/workflows/stream_transcripts.yml`（Fetch Stream Transcripts）が、
毎晩のチャットの取り込みが終わったあとに、まだ無い配信を新しい順に取ってコミットする。
取り方は `python/stream_transcripts.py`、整え方は `python/stream_text.py`。
