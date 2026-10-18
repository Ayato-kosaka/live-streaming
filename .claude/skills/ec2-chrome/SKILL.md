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
| `ec2.py` | 手元 | `run <sh> [秒]`（EC2 で実行して出力を出す）・`get <EC2> <手元>`・`put <手元> <EC2>`（**道具だけ。中身が SSM のログに残る**。4）・`state`/`start`/`stop`・`guard`（止め忘れの見張りを入れ直す。2） |
| `tools/shorts/post/send.py`（リポジトリの） | 手元 | `put <手元> <EC2> …`。**動画・秘密はこちらで送る。** GCS の署名付き URL を EC2 が `curl` で落とし、sha256 を照らす（中身は SSM のコマンドに載らない。4） |
| `ec2_exec.sh` | 手元 | **起こして → 実行して → 必ず止める。** 箱が止まっているときの1回ぶん（Doneru の cookie 取りがこれ）。実行の前に `cdp.py` を EC2 へ置き直す |
| `idle_stop.sh` | EC2（`/usr/local/sbin/idle-stop`、root の cron で5分ごと） | 誰も使っていない時間が30分続いたら EC2 を止める（2） |
| `cdp.py` | EC2（`/home/ubuntu/cdp/cdp.py`） | `up(名前)` で Chrome を起動（無ければ既定のプロファイルから1回だけ複製）・`tab()`・`go`・`js`・`click_at`・`set_files`・`shot`・**`fetch_image(url, out)`** |
| `../chatgpt/chatgpt.py` | EC2（`/home/ubuntu/cdp/`） | ChatGPT の会話を開く・送る・書き終わりを待つ・返事を Markdown で読む・ファイルを渡す（`chatgpt` スキル）。絵を作るのは `chatgpt-image` |
| `google_login.py` | EC2（`/home/ubuntu/cdp/`） | 「Google でログイン」を押し進める。アカウントはメールの SHA-256 で当てる・パスワード欄で止まる・スマホ確認の数字をファイルに書いて待つ・サイト側の画面（SUZURI の確認コード）は `on_site` で渡す。SUZURI（`suzuri/login.py`）が使う。Doneru の `remote_refresh.sh` は同じ手順をまだ自前で持っている |

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
- **待つあいだに止めるかは、待ちの長さで決める**（あやと 2026-10-12「回答まちはインスタンス落とすか、
  そこまでするほどではないか考えて」）。箱は t3.medium で1時間 約8円。起こし直しは1〜2分 + Chrome の起動
  + SSM が繋がるまでで、`/tmp` と開いていたタブも消える
  - **サイトの返事・処理の待ち（数秒〜数十分）は止めない。** 止めても数円しか浮かず、起こし直しの時間を払う
  - **人の返事の待ち（ログインしてもらう・issue で聞いた）は止める。** いつ来るか分からないので、
    1日つけっぱなしで約200円になる。あやとに EC2 で何かしてもらうときは「止めてあるので起こしてから入って」と書く
  - 止める前に、開いた Chrome は `down(名前)` で閉じる（セッションを書き戻させる）

### 止めるのを、手元のセッションに頼らない（見張り `idle_stop.sh`）

**セッションは唐突に切れる**（利用の上限・箱の作り直し）。切れたセッションは `ec2.py stop` を打てない。
2026-10-13、裏で流したスタンプの一括が 16:36 に終わったあと、こちらのセッションが上限で止まっていて、
**17:22 まで誰も止めずに起きていた**（あやとが気づいて止めた）。

だから止めるのは、止まらずに残る側（EC2）に持たせてある。`/usr/local/sbin/idle-stop` を root の cron が
5分ごとに回し、**次のどれも無い時間が30分続いたら止める**:

| 「使っている」とみなすもの | なぜ |
| --- | --- |
| 起きてから20分以内 | 起こしたセッションが最初のコマンドを送るまでの間 |
| SSM のコマンドが走っている | セッションが何かを流している最中 |
| 鍵のファイルが6時間以内に触られている（`/home/ubuntu/locks/*`・`/home/ubuntu/chatgpt/LOCK`・`/home/ubuntu/stamp/RUNNING`） | 裏で回している一括。**6時間を超える一括は、鍵を触り続ける**（`os.utime`）。消し忘れた鍵で永久に起きっぱなしにならないよう、古い鍵は数えない |
| Chrome リモートデスクトップの画面に30分以内の入力（`xprintidle`） | あやとが入っている |

- 入れ直しは `ec2.py guard`（何度でもよい）。見張りの記録は EC2 の `/var/log/idle-stop.log`
- **武装している**（2026-10-14 から）。中からの shutdown は、インスタンスの「シャットダウン動作」が **停止** なら止まり、
  **終了** なら EC2 そのものが消える。こちらの権限ではその設定を読めない（`ec2:DescribeInstanceAttribute` も、
  EC2 の役割からの `StopInstances` も拒否）ので、**あやとがコンソールで「停止」になっているのを見てから**武装した（#857）
- 武装は `/etc/idle-stop/armed` の**中身が `behavior=stop`** のときだけ効く（空の `touch` では効かない）。
  EC2 を作り直したり、シャットダウン動作を変えたりしたら、もう一度コンソールで見てから書く
- 武装したあとも、**自分で起こしたら自分で止める**（`ec2.py stop`）。見張りは、セッションが切れて止め忘れたときの受け皿
- **裏で何かを回すときは、必ず鍵を置く。** 置かずに `nohup` だけで流すと、30分後に止められる

## 3. プロファイル

- ログインが残っているのは**既定のプロファイル**（`~/.config/google-chrome/Default`）。
  あやとが Chrome リモートデスクトップで入って、ここでログインする
- **Chrome 136 以降は、既定の user-data-dir ではデバッグポートを開かない。**
  なので `up(名前)` は `~/cdp-<名前>` に `Default` を**1回だけ複製**して、そちらで起動する
  （Doneru だけは先に作られた `~/doneru-chrome`）。以後はその複製が正
- 既定のほうでログインし直したら `up(名前, reseed=True)` で複製し直す
- **cookie を中身で調べに行かない**（sqlite で名前を引くのも、権限の判定で止められた）。
  ログインしているかは、**ログインが要るページの中身が読めるか**で見る。「ログアウト」のボタンが
  DOM に在るかでは決めない（SUZURI は切れているのにボタンが在った。2026-10-10）
- 切れたら、あやとに入り直してもらわずに **`google_login.py` で押して入る**（SUZURI・Doneru とも
  あやとの同じ Google アカウント）。止まるのはパスワード・スマホの数字・メールの確認コードのところだけで、
  数字とコードはあやとからもらう

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
- **`put` で送った中身は、SSM エージェントのログに base64 のまま残る。秘密や動画は `put` で送らない。**
  `put` は中身を SSM のコマンドに載せるので、EC2 の `/var/log/amazon/ssm/amazon-ssm-agent.log*`
  （ファイルは 644。上のディレクトリは root だけ）に、コマンドの本文ごと**1回につき3か所**書かれる。
  ショートの下見3本を送った日には、ローテートした分が約130MB 溜まっていた（承認前の動画の断片）。
  - **ログは消さない。** 前はここに「送ったら終わりにログを消す」と書いてあったが、2026-10-18 に
    「監査ログの改ざん」として安全確認に止められた。操作の記録は残す（消す・空にする・回すのどれもしない）
  - だから**中身がログに残らない送り方を使う。** 動画・人に見せる前の絵・投稿文・秘密は
    `python3 tools/shorts/post/send.py put <手元> <EC2> [<手元> <EC2> …]`。GCS の `transfer/` に置き、
    EC2 には署名付き URL を `curl` で落とさせて、EC2 の上で sha256 を照らす。**SSM のコマンドに載るのは URL だけ**
  - **URL は EC2 のログに残る。それは仕方ないとする。** 寿命が3時間で、EC2 が落とし終えたら send.py が
    すぐ GCS から消す（以後その URL は 404）。置いたものも1日で消える。URL はこちらの標準出力・コミット・
    issue には出さない（send.py は出さない作り）
  - `put` のままでよいのは、**中身がリポジトリの公開物と同じもの**（`cdp.py` のような道具・スクリプト・
    設定の JSON）。ログに残っても困らない。`put` は動画（`.mp4` `.mov` など）を断る
- 落とし直しで Chrome のキャッシュ（`<プロファイル>/Default/Cache/Cache_Data`）に入った人に見せる前の動画は、
  Chrome を閉じてから消す（ログではなく、こちらが落としたものの写し）。
  動画のような大きいものは、そもそも EC2 の Chrome で開かない（ショートの下見は GCS の署名付き URL で渡す）
- **大きい HTML を何度も DOMParser に通すと、タブが固まる。** SUZURI の編集画面（3.8MB）を
  1件ごとに組み立てて20件ほどで、CDP の WebSocket が返らなくなった（メモリは足りていた）。
  欲しい属性だけを正規表現で抜く。重い画面は用が済んだら軽い画面へ移る。
  固まったら `down(名前)` → `up(名前)` で起こし直す（サイトのスキルの入口に入れてある）
- **このセッションの箱は途中で作り直されることがある**（2026-10-09 に1回）。裏で回していた
  `ec2.py run` は消えるが、EC2 の上のコマンドは走り続ける。手元に残したいものは早めに
  コミットし、EC2 の上の進み具合はログの JSON で確かめる
- **前の send-command で開いたタブに繋ぎ直すと、固まっていることがある。** `Page.enable` も `Runtime.evaluate` も
  返らない（YouTube Studio で 2026-10-10 に2回。ダイアログは出ていなかった）。`/json/close` ではなく、
  ブラウザの WebSocket から `Target.createTarget` で新しいタブを作り、古いタブを `Target.closeTarget` で閉じる。
  形は `youtube-studio/yt_studio.py` の `studio()` と `current()`
- **最初の `up(名前)` は、既定のプロファイル（1.2GB）を複製するので数分かかる。** 120秒を超えるので裏で回す
- **複製したプロファイルを長く使い続けると、Google のログインがまとめて切れることがある。** 2026-10-12 01:30 UTC、
  10日に複製した `~/cdp-ytstudio` で YouTube Studio を2日使ったところで 401 になり、**既定のプロファイルのほうも
  3アカウントとも Signed out** になっていた（#768）。原因は確かではないが、同じログインを2つの Chrome で
  使い続けたのを Google が怪しんだ見立て。戻すには、あやとに Chrome リモートデスクトップでログインし直してもらうしかない。
  **401 や accounts.google.com への転送が出たら、すぐ止める**（その先を流しても全部落ちるだけ）
- **「測った数が合わない」ときは、見えていない変数を疑う。** SUZURI の大きさを1つの数で
  見積もって3回外した。原因は「倍率が絵の画素数に掛かる」ことで、画素数の違う絵を
  混ぜて測っていたから。数を2つ以上の見本で測り、**合わなければ何が違う見本かを先に並べる**
