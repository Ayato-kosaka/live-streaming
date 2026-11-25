# 撮影の素材（あやとが自分で撮った動画）

あやと（2026-11-25、#1441・帳面 F-094）「今回から動画素材を自分で撮影して、ショートの画質向上作戦とします」
「※ルール 動画の音声はミュートにすること」。

Google フォトの共有アルバムに入った動画を、**音を外した作業用**にして私有の置き場に置き、指示書から ID で呼べるようにする。
道具は `footage.py` 1本。見張りは `footage_selftest.py`。

## 置き場

| 何 | どこ | 公開 |
| --- | --- | --- |
| 台帳（ID・撮った時刻・長さ・縦横・1行の説明・中身の sha256・どの配信の何分目か） | `shorts/footage/index.json` | する |
| 作業用の動画（音の流れなし・付け札なし）・1本ごとの一覧の絵・回ごとの1枚の一覧の絵 | GCS の非公開バケット `live-streaming-d3cac-shorts-preview` の `footage/<sha256>`（寿命の決まりの掛からない道。`tools/shorts/preview/gcs.py`） | しない |
| 同じものの手元の写し | 作業箱の `~/.cache/shorts/footage/`（`SHORTS_FOOTAGE_DIR`。**リポジトリの外**。中に向けると断る） | しない |
| アルバムの URL | 手元のファイル（既定 `~/.cache/shorts/footage/album.url`）だけ。**リポジトリ・issue・PR に書かない** | しない |

元の動画（Google フォトから落としたもの）は作業用を作ったら消す。元は Google フォトに在る。
位置・Google の写真の ID・元のファイル名は台帳に書かない（`public_row`）。顔の写る絵は私有の置き場にしか置かない。

## 取り直し（アルバムに足されたとき）

```bash
F=tools/shorts/footage/footage.py
python3 $F scan  --album ~/.cache/shorts/footage/album.url     # 何本あり、台帳に無いのが何本か
python3 $F pull  --album ~/.cache/shorts/footage/album.url --ref origin/master
#   台帳に無い ID だけ落とす → 音を外した作業用・1秒ごとの一覧の絵 → 配信に結ぶ → 回ごとの1枚
python3 $F desc  <ID> '<何が写っているか1行>'                   # 一覧の絵を見て、こちらが書く（60字まで）
python3 $F stash --key <秘密鍵.pem> --out <リポジトリの外>       # 私有の置き場（GCS の footage/）へ上げる
```

- **ID で差分を取る。** ID は Google の写真の ID の sha256 の頭9桁に `f`（`f3a9c21b0…`）。台帳に在る ID は落とさない
- アルバムの URL が手元に無いセッションは、運営（main）に聞く。URL はあやとの依頼（帳面 F-094 の会話）にある
- `--ref origin/master`: 作業枝の `streams/` が古いとき、配信の開始と長さを master から読む。配信が取り込まれる前に撮った素材は
  「配信の外」になる。毎晩の取り込みのあとで `python3 $F link --ref origin/master` を回すと結び直す
- `stash` は `remote.py` と同じ道（作業枝に依頼 → `shorts_render.yml` の prepare が上げる URL を公開鍵で包んで返す →
  作業箱から直に上げる）。私有の置き場に在るものは上げない。**作業枝に push してある版の `remote.py` が動く**
- 作業用: 元が縦 1080x1920（横なら 1920x1080）に収まり 30コマ/秒・h264 の 8bit なら、**画は符号化し直さずに写す**。
  そうでなければ 30コマ/秒・箱に収めて x264（CRF 14・slow）。どちらも音・字幕・データの流れと付け札を外し、作ったあと
  音の流れを数えて、1本でも残れば作業用を置かずに止まる

### 取れる画質（2026-11-25 に測った）

共有リンクからログインせずに落とすと（`=dv`）、Google が変換したものが返る。17本のうち14本は 1080x1920・約10Mbps、
**3本（11-23 の街の3本）は 720x1280・約1Mbps** だった（アルバムの一覧の縦横は 1080x1920 と出ていても）。
元の画質は、あやとのアカウントで入った Chrome から落とすしかない。EC2 の `~/cdp-gphotos` は 2026-11-25 には
共有のページで「Sign in」が出ていて、入れていなかった。

## 使いかた（制作の担当）

その回に撮った素材は、配信の id で引く。読むのは表と1枚の絵だけでよい。

```bash
python3 tools/shorts/footage/footage.py table <配信の id>
python3 tools/shorts/footage/footage.py look  <配信の id> --key <秘密鍵.pem> --out <リポジトリの外>
#   → <out>/footage/stream_<配信の id>.jpg（1本1行・1秒ごとのコマ）。--videos で作業用の動画も落とす（7日の URL）
```

`table` は、その配信の時間帯に撮ったもの（配信の何分目か）と、配信の前後12時間に配信の外で撮ったものを分けて出す。
`brief_section(<配信の id>)` が同じ表を `brief.py edit` の1枚に差し込む形で返す。

指示書の素材には ID だけを書く（道は書かない）:

```json
"sources": { "f1": { "footage": "f3a9c21b0" } },
"cuts": [ { "src": "f1", "in": 0, "out": 90 } ]
```

- 書き出し（`render.py`）は、手元では `SHORTS_FOOTAGE_DIR` の `<ID>.mp4` を読む。Actions（`remote.py up`）では
  作業箱から上げず、prepare が私有の置き場から CAS に写す（私有の置き場に無ければ止まる。先に `stash`）
- **音は必ず無い。** 撮影の素材のカットに `audio_db` を書くと、書き出しが断る。音の流れの残ったファイルを
  撮影の素材として渡しても断る。声と BGM はふつうどおり足す
- 作業用は 30コマ/秒。`in`/`out` は作業用のコマ番号

## 見張り

`python3 tools/shorts/footage/footage_selftest.py`（ffmpeg・numpy・Pillow。`.github/workflows/shorts_selftest.yml` が名指しで回す）。
作業用に音が残らない・残ったら止まる・付け札を外す・書き出しが `audio_db` と音の流れを断る・音の束が撮影の素材を読まない・
本物の書き出しで画が出て声の無い所が無音・台帳が決まった欄だけ・置き場がリポジトリの外・書き出しの依頼で撮影の素材を
作業箱から上げない、と、本物のリポジトリに動画・絵・アルバムの URL が入っていないこと。守り10個を1つずつ外して、
その足だけが落ちるかも当てる。
