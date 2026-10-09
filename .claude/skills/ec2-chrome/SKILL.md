---
name: ec2-chrome
description: EC2（i-0684d39b0c1b1abb6）のログイン済み Chrome を、このセッションから CDP で操作する共通の土台。SSM でコマンドを送り、結果やスクリーンショットを分けて持ち帰る。SUZURI・Doneru など「ログインが要って、この箱からは届かないサイト」を触るときは、まずこれを読む。トリガー語:「EC2」「EC2 の Chrome」「ブラウザ操作」「ログイン済みの Chrome」「SSM」「ec2-chrome」。
---

# EC2 の Chrome を操作する（共通の土台）

サイトごとのスキル（`suzuri/`・`doneru-cookie/`）は、**ここにある道具の上に乗っている。**
サイトに依らない躓きは、サイトのスキルではなく**ここに足す。**

## 0. 形

```
このセッション ──SSM send-command──▶ EC2 ──CDP──▶ Chrome（~/cdp-<サイト名>）
       ◀── 標準出力（24,000字まで）・ファイルは base64 で分けて ──
```

- **この箱からは、SUZURI も本番の島（web.app）も届かない**（プロキシが 403）。
  外のサイトに触るのは全部 EC2 から
- **EC2 へのポート転送（`ssm:StartSession`）と S3 は権限が無い。** 使えるのは
  `send-command` だけ。なので Playwright を手元から繋ぐ形にはできない
- Chrome は EC2 の上で、**CDP（デバッグポート）を python から叩いて**動かす。
  `claude --chrome`（拡張）を EC2 で走らせる形もあるが（nanitabeyo の `ec2-chrome-operate`）、
  1手 1〜3分かかり、同じ手順を何十件も繰り返すのには向かない

## 1. 道具

| ファイル | どこで動く | 何をするか |
| --- | --- | --- |
| `ec2.py` | 手元 | `run <sh> [秒]`（EC2 で実行して出力を出す）・`get <EC2> <手元>`・`put <手元> <EC2>`・`state`/`start`/`stop` |
| `ec2_exec.sh` | 手元 | **起こして → 実行して → 必ず止める。** 箱が止まっているときの1回ぶん（Doneru の cookie 取りがこれ）。実行の前に `cdp.py` を EC2 へ置き直す |
| `cdp.py` | EC2（`/home/ubuntu/cdp/cdp.py`） | `up(名前)` で Chrome を起動（無ければ既定のプロファイルから1回だけ複製）・`tab()`・`go`・`js`・`click_at`・`set_files`・`shot`・**`fetch_image(url, out)`** |

**`ec2.py run` と `ec2_exec.sh` の使い分け:** 箱がもう起きている（あやとが入っている・何回にも分けて触る）
なら `ec2.py run`。止まっている箱で1回だけ回すなら `ec2_exec.sh`（終わったら止める）。
起きている箱に `ec2_exec.sh` を使うと、**あやとが使っている最中でも止めてしまう。**

### ページの絵を取る（ChatGPT の共有リンクなど）

```bash
python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && python3 cdp.py fetch-image https://chatgpt.com/s/m_… /home/ubuntu/shots/x.png') 150
python3 .claude/skills/ec2-chrome/ec2.py get /home/ubuntu/shots/x.png /tmp/claude-0/scr/x.png
```

ページを開いて、いちばん大きい絵を**ページの中の fetch で**取る。ChatGPT の絵の URL は数分で切れる
署名付きなので、URL を写して後から curl しても取れない。ログインの要らないページなら、どこでも同じ。

最初に1回、`cdp.py` を置く:

```bash
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/ec2-chrome/cdp.py /home/ubuntu/cdp/cdp.py
```

EC2 で走らせる中身は、スクラッチパッドに `.sh` で書いて `run` に渡す:

```sh
cd /home/ubuntu/cdp && python3 - <<'PY'
import sys; sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import *
up("suzuri", "https://suzuri.jp/")
t = tab("suzuri")
print(t.js("document.title"))
t.shot("/home/ubuntu/shots/a.jpg")
PY
```

```bash
python3 .claude/skills/ec2-chrome/ec2.py run /tmp/claude-0/scr/a.sh 120
python3 .claude/skills/ec2-chrome/ec2.py get /home/ubuntu/shots/a.jpg /tmp/claude-0/scr/a.jpg   # Read で見る
```

## 2. 起こす・止める

- **起きているかを先に見る**（`ec2.py state`）。あやとが Chrome リモートデスクトップで
  入っていることがある（2026-10-09 は `running` で、既定のプロファイルの Chrome が開いていた）。
  **そのときは止めない。** 自分で起こしたときだけ、終わったら `ec2.py stop` で止める
- `/tmp` は止めると消える。持ち越すものは `/home/ubuntu/` の下に置く

## 3. プロファイル

- ログインが残っているのは**既定のプロファイル**（`~/.config/google-chrome/Default`）。
  あやとが Chrome リモートデスクトップで入って、ここでログインする
- **Chrome 136 以降は、既定の user-data-dir ではデバッグポートを開かない。**
  なので `up(名前)` は `~/cdp-<名前>` に `Default` を**1回だけ複製**して、そちらで起動する
  （Doneru だけは先に作られた `~/doneru-chrome`）。以後はその複製が正
- 既定のほうでログインし直したら `up(名前, reseed=True)` で複製し直す
- **cookie を中身で調べに行かない**（sqlite で名前を引くのも、権限の判定で止められた）。
  ログインしているかは、**画面を開いて「ログアウト」が在るか**で見る

## 4. 躓いたところ

- **SSM の標準出力は 24,000 字で切れる。** 大きいものはファイルに書いて `get` で持ち帰る。
  `get` は 20,000 字ずつ 8本並べて取る（順に取ると 1MB で10分かかった）
- **`run` が 120秒を超えると、Bash が裏に回す。** 長い一括は `run_in_background` で回し、
  出力はファイルに落として読む
- **CDP の WebSocket は Origin を付けると 403**（Chrome 111+）。`suppress_origin=True` と
  起動側の `--remote-allow-origins` の両方が要る（`cdp.py` に入れてある）
- **タブが複数あると、`tab()` は手前の1枚を拾う。** よそのサイトのタブで
  `fetch('/account/...')` を投げると、そのサイトに飛んで空が返る（ChatGPT の共有リンクを
  開いたあとに踏んだ）。サイトのスキルは「そのサイトのタブを1枚だけ残す」入口を持つ
- **閉じた直後の `/json/list` には、閉じたタブがまだ載っている。** 一覧を取り直して
  `tab()` すると `No such target id` で落ちる。残したタブの情報をそのまま使う
- **`DOM.setFileInputFiles` に無いパスを渡しても、Chrome は黙って空のファイルを渡す。**
  画面は「PNGまたはJPEG」と言うだけで、原因が分からない。渡す前にこちらで存在を確かめる
- **EC2 の python は PEP 668。** 足りないものは `apt-get install python3-<名前>`
  （`python3-websocket`・`python3-pil` は入っている）
- **ログイン済みのページの中からの `fetch` は、そのサイトの cookie で通る。**
  画面の「保存する」が送る要求を JS から読み解き、同じものをページの中から送ると、
  ドラッグやクリックより確実（SUZURI でやった。`suzuri/SKILL.md`）。
  CSRF の札は `meta[name=csrf-token]` から取って `X-CSRF-Token` に付ける
- **ページに埋まっている JSON を先に探す。** Rails / Backbone の画面は、編集中のものを
  `data-*` 属性に JSON で持っていることが多い。画面の字を読むよりずっと確実
- **SSM は、前のコマンドが終わるまで次を始めない**（同じインスタンスへの send-command は
  1本ずつ）。長い一括を流しているあいだに `run` で様子を見ようとしても、一括が終わるまで
  返ってこない。`get` / `put` の並列も、その間は効かない。**様子はファイル（ログの JSON）に
  書かせて、一括が終わってから読む。** 一括は「済んだものを飛ばす」形にしておけば、
  止まっても同じスクリプトをもう一度流すだけで続きから進む
- **大きい HTML を何度も DOMParser に通すと、タブが固まる。** SUZURI の編集画面（3.8MB）を
  1件ごとに組み立てて20件ほどで、CDP の WebSocket が返らなくなった（メモリは足りていた）。
  欲しい属性だけを正規表現で抜く。重い画面は用が済んだら軽い画面へ移る。
  固まったら `down(名前)` → `up(名前)` で起こし直す（サイトのスキルの入口に入れてある）
- **このセッションの箱は途中で作り直されることがある**（2026-10-09 に1回）。裏で回していた
  `ec2.py run` は消えるが、EC2 の上のコマンドは走り続ける。手元に残したいものは早めに
  コミットし、EC2 の上の進み具合はログの JSON で確かめる
- **「測った数が合わない」ときは、見えていない変数を疑う。** SUZURI の大きさを1つの数で
  見積もって3回外した。原因は「倍率が絵の画素数に掛かる」ことで、画素数の違う絵を
  混ぜて測っていたから。数を2つ以上の見本で測り、**合わなければ何が違う見本かを先に並べる**
