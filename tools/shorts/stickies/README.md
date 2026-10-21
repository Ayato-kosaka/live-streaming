# 島の付箋を読む（視聴者さんの「これショートにして」）

視聴者さんは島の付箋（テーマ `shorts-idea`）に「この回をショートにして」を貼る。
それを **Actions の「付箋を読む」（`.github/workflows/stickies_pull.yml`）で読み、暗号化して作業枝に置き、
手元で開く。**

**EC2 を起こして curl しない。** 作業箱からは島（`live-streaming-d3cac.web.app`）に届かない
（プロキシが断る）ので前はそうしていたが、Actions からは届く。EC2 を起こす待ちも要らない。

**視聴者さんの名前は、どこにも出さない。** issue・コミット・企画・台本・投稿文・ログのどれにも。
本文もそのまま写さない（「どの回の、どのあたりを」だけを自分の言葉で書く）。
島では、あやとが「しまう」で下ろせるし、本人が名前を変えることもできる。
**git の履歴と Actions のログは、あとから消せない**（どちらも公開）。

## 使い方（作業箱で）

```bash
# 1. 鍵（セッションごとに作る。秘密鍵はスクラッチパッドから出さない）
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out <スクラッチパッド>/keys/priv.pem
openssl pkey -in <スクラッチパッド>/keys/priv.pem -pubout -out <スクラッチパッド>/keys/pub.pem

# 2. 依頼を作業枝に push（名前は毎回変える。同じ名前の書き換えでも走る）
python3 - <<'EOF'
import json, pathlib
pub = pathlib.Path("<スクラッチパッド>/keys/pub.pem").read_text()
pathlib.Path("shorts/stickies/2026-10-21-shorts-idea.json").write_text(
    json.dumps({"theme": "shorts-idea", "limit": 300, "pubkey": pub}, ensure_ascii=False) + "\n")
EOF
git add shorts/stickies/ && git commit -m "…" && git push origin HEAD:claude/<作業枝>

# 3. run が終わったら、枝を切り替えずに開いて表にする
git fetch origin claude/<作業枝>
python3 tools/shorts/stickies/read.py --key <スクラッチパッド>/keys/priv.pem --ref FETCH_HEAD
```

master に入ったあとは、手で起こしてもよい（入力は依頼と同じ。`branch` に結果を置く枝）:

```bash
gh workflow run stickies_pull.yml --ref master -f theme=shorts-idea -f limit=300 \
  -f branch=claude/<作業枝> -f pubkey="$(cat <スクラッチパッド>/keys/pub.pem)"
```

| 依頼の欄 | 意味 | 既定 |
| --- | --- | --- |
| `theme` | 付箋のテーマ。**空（`""`）ならテーマ横断の新着** | `shorts-idea` |
| `limit` | 何枚まで読むか（1〜300。島の口が 300 で切る） | 300 |
| `pubkey` | 応答を包む公開鍵。RSA 2048bit 以上（ショートの取り込みと同じ形） | 必須 |

**依頼の置き場は `shorts/stickies/`。`shorts/requests/` に置かない。** あちらはショートの取り込み
（`shorts_ingest.yml`）が見ていて、置くと取り込みまで起きて「mode が無い」で赤くなる。

## 置かれるもの

```
shorts/.work/stickies/<テーマ>/      （テーマ横断は shorts/.work/stickies/_all/）
    manifest.json   平文。枚数・返事済みの枚数・いちばん新しい日（JST）・続きがあるか・バイト数・sha256
    key.enc         RSA-OAEP(SHA-256) で包んだ AES 鍵・HMAC 鍵・IV
    payload.enc     中身の tar.gz を AES-256-CBC で包んだもの
```

形はショートの取り込みと同じ（`tools/shorts/ingest/seal.py` をそのまま使う）。だから
`tools/shorts/ingest/decrypt.py` でも開ける。中身は2つ。

- `stickies.json` — 島の口（`GET /island-api/stickies`）の応答を**1バイトも書き換えずに**。
  欄は `docs/island-api.md` 4章（id・theme・text・by・link・pic・hearts・byOwner・reply・repliedAt・createdAt）
- `request.json` — 何を頼んで何が来たか（テーマ・枚数・HTTP の状態・読んだ時刻・run の URL）

1ページだけ読む。テーマ1つなら島の口は最大 300 枚を `more: false` で返す。テーマ横断で
300 枚を超えると `続き あり` と出る（古いほうは読まない）。

## read.py の表

`id | 作成（JST） | テーマ | あやと | ♥ | 返事 | 名前 | リンク | 本文`。
**名前と本文はこの画面にだけ出す。** YouTube のリンクは動画IDと時刻だけに直して出す
（共有のリンクに付く `si=` は共有した人のアカウントに紐づくので、写すときに混ざらないように）。
中身を残したいときは `--out <リポジトリの外>`。

## ログに出るもの

```
読んだ: HTTP 200・2,566バイト・6枚（返事済み 3）・いちばん新しい 2026-10-20（JST）・続き なし
包んだ: stickies/shorts-idea  暗号文 1,104バイト  鍵 3f2a…
```

これだけ。**テーマの名前も応答からは出さない**（島の口は表に無い宛先にも貼れるので、宛先の
名前を視聴者さんが決められる）。**例外の文面も出さない**（型の名前だけ）。読めなかった値や、
openssl に渡した引数（AES の鍵を含む）が文面に入るから。

## 赤くなるとき

200 でない・本文が空・JSON でない（Hosting は口が無いと 200 で HTML を返すことがある）・
`notes` が無い・**0枚**。0枚を赤にするのは、テーマの綴りを1字間違えても島の口は 200 と
空の一覧を返すから（「頼みが無い」と「読む先を間違えた」が同じ緑になる）。
赤のときは何も置かない。平文はどの場合も、その step の中で消える。

## 見張り

```bash
python3 tools/shorts/stickies/pull_selftest.py
```

手元に偽の島の口（127.0.0.1）を立てて、本物の `order.py` → `pull.py` → `decrypt.py` / `read.py` を回す。
名前・本文・リンク・返事・テーマ・id にその回だけの印を埋め、**印がログにも manifest.json にも、
ランナーの一時の場所に残ったものにも1つも出ない**こと・開くと応答と1バイトも違わないこと・
200 以外／空／HTML／0枚が赤になること・ワークフローの権限と繋ぎを見る。
回し役（`python/selftest_runner.py`）が拾う。島にも GitHub にも触らない。

2026-10-21 に `pull.py` を1か所ずつ壊して、5通りとも赤くなることを確かめた
（本文をログに出す・200 以外を通す・平文を消さない・例外の文面をそのまま出す・0枚を通す）。
