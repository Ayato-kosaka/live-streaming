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
| `ec2.py` | 手元 | `run <sh> [秒]`（EC2 で実行して出力を出す）・`get <EC2> <手元>`・`put <手元> <EC2>`（**道具だけ。中身が SSM のログに残る**。4）・`state`/`start`・`stop [--force]`（**使っている人が居れば止めずに 1**。2）・`guard`（止め忘れの見張り・`desktop-input`・`ec2-queue`・`cdp.py` の正の版と戻す見張り `cdp-heal` を入れ直す。2・2.5）・**`hold <列> --who --purpose -- <コマンド>`**（札を取って回し、必ず返す）・`queue`（誰が何を持ち、誰が待っているか）。Python からは `with ec2.lease(列, …):`（2.5） |
| `ec2_queue.py` | EC2（`/usr/local/sbin/ec2-queue`。`guard` が置く） | 順番待ちの札。列ごとに1人だけが持つ札と、先着の待ち札を EC2 の中（`/var/lib/ec2-queue`）に置く。`take`・`beat`・`release`・`list`・`busy`（idle-stop が聞く）・`stop-mark`（止める印）・`hold <列> -- <コマンド>`（EC2 の上の一括用）（2.5） |
| `ec2_queue_selftest.py` | 手元 | 札の見張り。偽の EC2・偽の時計・偽の pid・偽の起動時刻で14本の足を回し、守りを1つずつ外した対照26個も当てる（2分ほど）。**本物の EC2 に触らない**。札・`ec2.py`・`idle_stop.sh`・`ec2_exec.sh`・`cdp.py` の札の段を触ったら回す |
| `cdp_heal.sh` | EC2（`/usr/local/sbin/cdp-heal`。`guard` が置く。systemd の `cdp-heal.path` と5分ごとの cron が呼ぶ） | `/home/ubuntu/cdp/cdp.py` の版の番号が**正の版**（`/usr/local/lib/ec2-chrome/cdp.py`。root だけが書ける）より小さく（無く）なったら、書かれた瞬間に正の版に戻し、`/var/log/cdp-heal.log` に1行書く。手元の道具が置くときの比べ（`place`）もこれ（2.5） |
| `cdp_heal_selftest.py` | 手元 | `cdp-heal` の見張り。古い版が戻る・同じ番号と大きい番号は戻さない・手元の置く道具（`ec2.put`・`ec2.py put`・`ec2_exec.sh`・`post.py send`）が下げない・戻した版で `up()` が札を取る・guard と .path / cron、の5本と、守りを1つずつ外した対照（30秒ほど）。**本物の EC2 に触らない**。`cdp_heal.sh`・`cdp.py`・`ec2.py` の put / guard・`ec2_exec.sh` の置き直しを触ったら回す |
| `stop_guard_selftest.py` | 手元 | `ec2.py stop` の守りの見張り。偽の EC2（`run` と `aws` を差し替え）で回し、守りを1つずつ外した対照も当てる。**本物の EC2 に触らない**。`ec2.py`・`idle_stop.sh` を触ったら回す |
| `tools/shorts/post/send.py`（リポジトリの） | 手元 | `put <手元> <EC2> …`。**動画・秘密はこちらで送る。** GCS の署名付き URL を EC2 が `curl` で落とし、sha256 を照らす（中身は SSM のコマンドに載らない。4） |
| `ec2_exec.sh` | 手元 | **起こして → 札を取って実行して → 返して → 止めてよければ止める。** 箱が止まっているときの1回ぶん（Doneru の cookie 取りがこれ。列は `EC2_QUEUE_LANE`、既定 `exec`）。実行の前に `cdp.py` を EC2 へ置き直す（`ec2.py put` を通すので、EC2 のほうが新しい版なら置かない）。止めるのは `ec2.py stop` を通すので、使っている人が居れば止めずに「idle-stop に任せる」とログに書く |
| `idle_stop.sh` | EC2（`/usr/local/sbin/idle-stop`、root の cron で5分ごと） | 誰も使っていない時間が30分続いたら EC2 を止める（2） |
| `desktop_input.py` | EC2（`/usr/local/sbin/desktop-input`、systemd の `desktop-input.service`） | 遠隔デスクトップ（:20）に**人の本物の入力**が最後にあった時刻を控える。`desktop-input idle` が「何ミリ秒前か・出どころ」を1行で出す。投稿の GUARD と idle-stop が聞く（2） |
| `cdp.py` | EC2（`/home/ubuntu/cdp/cdp.py`） | `up(名前)` で Chrome を起動（拡張・部品の更新なし。無ければ既定のプロファイルから不要物を落として1回だけ複製。3）・`tab()`・`go`・`js`・`click_at`・`set_files`・`shot`・**`fetch_image(url, out)`**。**`up`・`tab`・`pages` は、列 `名前` の札を持っていなければ、そのプロセスの pid で取る**（取れるまで待つ。2.5）。頭に版の番号 `CDP_VERSION`。**EC2 の上では正の版より古くなると戻る。中身を変えたら番号を上げる**（2.5） |
| `../chatgpt/chatgpt.py` | EC2（`/home/ubuntu/cdp/`） | ChatGPT の会話を開く・送る・書き終わりを待つ・返事を Markdown で読む・ファイルを渡す（`chatgpt` スキル）。絵を作るのは `chatgpt-image` |
| `google_login.py` | EC2（`/home/ubuntu/cdp/`） | 「Google でログイン」を押し進める。アカウントはメールの SHA-256 で当てる・パスワード欄で止まる・スマホ確認の数字をファイルに書いて待つ・サイト側の画面（SUZURI の確認コード）は `on_site` で渡す。SUZURI（`suzuri/login.py`）が使う。Doneru の `remote_refresh.sh` は同じ手順をまだ自前で持っている |

**`ec2.py run` と `ec2_exec.sh` の使い分け:** 箱がもう起きている（あやとが入っている・何回にも分けて触る）
なら `ec2.py run`（Chrome を触るなら `ec2.py hold` の中で。2.5）。止まっている箱で1回だけ回すなら `ec2_exec.sh`
（札を持って回し、終わったら止めてよければ止める）。前は `ec2_exec.sh` が無条件に止めていて、あやとが使っている最中でも
止めていた。2026-10-24 から下の 2 の `ec2.py stop` の守りを通す。

### ページの絵を取る（ChatGPT の共有リンクなど）

```bash
python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && python3 cdp.py fetch-image https://chatgpt.com/s/m_… /home/ubuntu/shots/x.png') 150
python3 .claude/skills/ec2-chrome/ec2.py get /home/ubuntu/shots/x.png /tmp/claude-0/scr/x.png
```

ページを開いて、いちばん大きい絵を**ページの中の fetch で**取る。ChatGPT の絵の URL は数分で切れる
署名付きなので、URL を写して後から curl しても取れない。ログインの要らないページなら、どこでも同じ。

最初に1回、`cdp.py` を置く（EC2 のほうが新しい版なら「置かなかった」と出て、そのまま EC2 の版で続ければよい。2.5）:

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
  **そのときは止めない。** 自分で起こしたときだけ、終わったら `ec2.py stop` を打つ（使っている人が居れば
  断られる。下の「止めるのは `ec2.py stop` で」）
- `/tmp` は止めると消える。持ち越すものは `/home/ubuntu/` の下に置く
- **待つあいだに止めるかは、待ちの長さで決める**（あやと 2026-10-12「回答まちはインスタンス落とすか、
  そこまでするほどではないか考えて」）。箱は t3.medium で1時間 約8円。起こし直しは1〜2分 + Chrome の起動
  + SSM が繋がるまでで、`/tmp` と開いていたタブも消える
  - **サイトの返事・処理の待ち（数秒〜数十分）は止めない。** 止めても数円しか浮かず、起こし直しの時間を払う
  - **人の返事の待ち（ログインしてもらう・issue で聞いた）は止める。** いつ来るか分からないので、
    1日つけっぱなしで約200円になる。あやとに EC2 で何かしてもらうときは「止めてあるので起こしてから入って」と書く
  - 止める前に、開いた Chrome は `down(名前)` で閉じる（セッションを書き戻させる）

### 止めるのは `ec2.py stop` で（使っている最中なら断られる）

2026-10-23 23:45 UTC、ショートの投稿の担当が EC2 で YouTube を読み直している最中に、EC2 が
`Client.UserInitiatedShutdown`（外からの stop-instances）で止まった。見張りの記録（`/var/log/idle-stop.log`）には
その時刻の行が無く、見張りではない。「自分で起こした EC2 は、誰も使っていないのを見てから止める」は、
**2人が同時に EC2 を使うと見分けが外れる**（自分が起こしたあとに、別の担当が乗ってくる）。
だから `ec2.py stop` は、止める前に EC2 の中を見る。並びは見張り（下の `idle_stop.sh`）と同じで、
**どれか1つでも当たれば止めずに理由を出して終了コード 1**:

| 見るもの | 止めない条件 |
| --- | --- |
| ほかの SSM コマンド | この確かめを流している自分の ssm-document-worker（先祖）以外が走っている |
| 鍵（ファイルでもディレクトリでも） | **15分以内**に触られている。置き場は `idle_stop.sh` の `LOCKS` をそのまま読む（`~/locks/*`・`~/chatgpt/LOCK`・`~/stamp/RUNNING`） |
| 遠隔デスクトップ | `desktop-input idle` が**7分未満**（投稿の GUARD と同じ）。答えが無い・数でない・`0 none-…` も触っている側に倒す |
| 札（2026-10-24 から） | 上のどれにも当たらなければ、同じ1回の SSM の中で `ec2-queue stop-mark` を呼ぶ。列に生きている札か待ち札があれば止めない。空なら EC2 の鍵（flock）を持ったまま「止める印」を立て、外で stop-instances を打つ（2.5）。`ec2-queue` が無い EC2 には札も無いので、そのまま進む |
| 確かめそのもの | 答えが返らない（ほかのコマンドが居座っていると、それが終わるまで始まらない。60秒＋待ち120秒で切る） |

- **既に止まっている（stopped / stopping）なら何もせずに 0。** pending（誰かが起こしている途中）は止めない
- **断られたら、理由を読む。** 自分の鍵なら外してからもう一度。ほかの人の鍵・SSM・あやとの入力なら**止めずに置いておく**
  （誰も使わなくなって30分で見張りが止める）。置いておくのは損ではない（1時間 約8円）
- **`--force` は中を見ずに止める。** あやとに「止めて」と言われたときなど、使っている人ごと止めると決めたときだけ
- 自分の worker を除くのは**先祖を辿って**いる。偽の EC2 でしか確かめていない（2026-10-24。本物は別の担当が使っている
  かもしれないので触らなかった）。1人きりのはずなのに `ssm: ほかの SSM コマンドが走っている（… pid N）` と出たら、
  先祖の辿りかたが EC2 で外れている。そのときは EC2 で `ps -o pid,ppid,args -p N` を見てから直す
- 見張りの見張りは `stop_guard_selftest.py`（`python3 .claude/skills/ec2-chrome/stop_guard_selftest.py`）。
  回し役（`python/selftest_runner.py`）は `.claude/` を降りないので、**`ec2.py` か `idle_stop.sh` を触ったら手で回す**

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
| 鍵（ファイルでもディレクトリでも。2026-10-24 から。前はファイルだけで、mkdir で取る鍵を数えていなかった）が6時間以内に触られている（`/home/ubuntu/locks/*`・`/home/ubuntu/chatgpt/LOCK`・`/home/ubuntu/stamp/RUNNING`） | 裏で回している一括。**6時間を超える一括は、鍵を触り続ける**（`os.utime`）。消し忘れた鍵で永久に起きっぱなしにならないよう、古い鍵は数えない |
| Chrome リモートデスクトップの画面に30分以内の本物の入力（`desktop-input idle`） | あやとが入っている |
| 順番待ち（`ec2-queue busy`）に生きている札か待ち札がある（2026-10-24 から） | 誰かが列を持っている・待っている。失効した札（心拍が途切れた・pid が死んだ・起動より前・6時間超・壊れた）は数えない。**`ec2-queue` が無い・答えない・嘘をつくときも、札の置き場が6時間書かれていなければ数えない**（止める側を札に頼り切らない） |

- 入れ直しは `ec2.py guard`（何度でもよい。置くのは `.new` に書いてから mv するので、cron が書きかけの字を読まない）。
  見張りの記録は EC2 の `/var/log/idle-stop.log`。**判断だけを見るなら `DRY=1 /usr/local/sbin/idle-stop`**（何も書かず、止めない。
  流している SSM の自分の worker は数えず、札の段の答えを1行で出す）
- **「あやとが触っているか」を xprintidle で見ない。** xprintidle は、こちらの Chrome が動画を止める・閉じるだけで0に戻る
  （2026-10-23 に測った。`desktop_input.py` の頭）。`desktop-input` は X に入った生の入力（XI2 の Raw*）だけを数える。
  遠隔デスクトップの入力は XTest で入るので数えられ、CDP の入力とタブの開け閉めは数えない。答えは
  `1834000 xi2`（本物の入力から何ミリ秒）・`2147483647 xi2-never`（X が立ってから一度も無い）・`… xprintidle-dead`
  （見張りが居ないので前の xprintidle に戻った）の形。自分の道具で「触っているか」を見るときも、これを聞く
- **武装している**（2026-10-14 から）。中からの shutdown は、インスタンスの「シャットダウン動作」が **停止** なら止まり、
  **終了** なら EC2 そのものが消える。こちらの権限ではその設定を読めない（`ec2:DescribeInstanceAttribute` も、
  EC2 の役割からの `StopInstances` も拒否）ので、**あやとがコンソールで「停止」になっているのを見てから**武装した（#857）
- 武装は `/etc/idle-stop/armed` の**中身が `behavior=stop`** のときだけ効く（空の `touch` では効かない）。
  EC2 を作り直したり、シャットダウン動作を変えたりしたら、もう一度コンソールで見てから書く
- 武装したあとも、**自分で起こしたら自分で `ec2.py stop` を打つ**（使っている人が居れば断られるので、そのときは置いておく）。
  見張りは、セッションが切れて止め忘れたときと、断られて置いておいたときの受け皿
- `idle_stop.sh` を直したら `ec2.py guard` で入れ直すまで EC2 の上は前のまま（鍵のディレクトリを数えるのは、入れ直してから）
- **裏で何かを回すときは、必ず札を持つ。** `nohup /usr/local/sbin/ec2-queue hold <列> --who … --purpose … -- <コマンド>`
  で流すか、道具が `cdp.py` の `up(列)` を呼ぶなら、それが pid で取る（2.5）。札も鍵も無しに `nohup` だけで流すと、30分後に止められる。
  鍵（`~/locks/*`・`~/chatgpt/LOCK`・`~/stamp/RUNNING`）は、札に移していない道具のために、まだ数えている

## 2.5 札（順番待ち。2026-10-24 から）

EC2 をいくつものセッションが同時に使う。10-23 23:45 UTC に片方の「済んだので止める」がもう片方の作業ごと止め、
10-24 01:01 UTC には2人が fish の Chrome で同時に `tt_post.py` を回し、片方の `fresh_tab` がもう片方のタブを閉じた。
だから **Chrome の束（`cdp.py` の `up(名前)`）ごとに列があり、1人ずつ持つ。** 列の名前は束の名前:
`fish`（Fish の声作りと **TikTok の投稿**。同じ Chrome）・`ytstudio`（YouTube の投稿・Studio）・`suzuri`・`chatgpt`・`doneru`・`line`・`web`。
Chrome を触らない読むだけのコマンド（`ls`・`get`・`sha256sum`）は列を取らなくてよい。

**札を取る（手元から）:**

```bash
E=.claude/skills/ec2-chrome/ec2.py
python3 $E hold fish --who <セッション名> --purpose '<何のため>' -- python3 $E run /tmp/…/gen.sh 600
python3 $E queue                                   # いま誰が何を持ち、誰が待っているか
```

```python
with ec2.lease("fish", who="voice", purpose="A/01〜A/13"):   # 取れるまで待つ。EC2 が止まっていれば起こす
    ec2.run(...)                                              # 札は EC2 の上の up("fish") にも渡る（自分の札を待たない）
```

- **待つ:** 何番目で誰が何のために持っているかを出す。`--wait`（既定30分）を超えたら、持ち主と目的を出して諦める（終了コード 75）
- **何回にも分けて触る（会話の中で1手ずつ）:** `python3 $E hold <列> --who … --purpose …`（コマンド無し）を `run_in_background` で流すと、
  止められるまで持ち、`EC2_QUEUE_TICKET=<列>:<札>` を出す。続く `ec2.py run` の頭にそれを付ける（付けないと、EC2 の上の
  `up(列)` が自分の札を他人の札と見分けられず、空くまで待つ）。済んだら、その裏のコマンドを止める（返してから終わる）
- **EC2 の上の一括:** `nohup /usr/local/sbin/ec2-queue hold <列> --who … --purpose … -- <コマンド> &`。札を取ってから
  コマンドに成り代わる（pid が同じ）ので、コマンドが終われば（kill -9 でも）次の確かめで札も消える
  - **`ec2.py hold` の中から nohup の一括を起こさない。** 一括は手元の札（`EC2_QUEUE_TICKET`）で通るので、hold を抜けた
    とたん札なしで走り続ける。一括は hold の外から流し、一括自身に札を持たせる（`ec2-queue hold`、または道具の `up()`）
  - 何本かを続けて流すあいだに割り込まれたくなければ、1本の `ec2-queue hold <列> … -- sh -c '<1本目> && <2本目> …'` にまとめる
    （中のプロセスは札を受け継ぐ）
- **呼ぶ側が忘れても守る:** `cdp.py` の `up`・`tab`・`pages` は、列の札を持っていなければそのプロセスの pid で取る（取れるまで待つ）。
  ほかのタブを全部閉じる道具（各スキルの `fresh_tab`・`studio()`・`fresh()`）はどれもここを通る。効くのは EC2 の
  `/home/ubuntu/cdp/cdp.py` が札を取る版のときなので、**古い版で上書きされたら EC2 の上で正の版に戻す**（下の「EC2 の cdp.py は正の版に戻る」）
- **止める:** 自分の札を返してから `ec2.py stop`。札が1枚でも残っていれば断られる。止める印を見た人（札を取りに来た人・`run`）は、
  止まりきるのを待って起こし直してから続ける。印は10分か起動で消える（止める人が途中で死んでも、列は塞がったままにならない）

### EC2 の cdp.py は正の版に戻る（2026-10-24 から）

札を入れた日の 10:10 UTC、EC2 の `/home/ubuntu/cdp/cdp.py` が札を取らない古い版に戻っていた。古い枝のセッションが、
使うたびに手元の版を置き直す道具（`ec2_exec.sh`・`post.py send`）で書き戻した。「最後に置いた人の版が効く」形では、
古い枝が1回置くだけで札の守りが黙って外れ、古い枝の道具はこちらから直せない。だから戻すのは EC2 に持たせてある。

- `cdp.py` の頭に版の番号 `CDP_VERSION`（行頭から `CDP_VERSION = <数>`）。行が無い版は 0（札の前の版と、札を入れた最初の版）
- `ec2.py guard` が、root だけが書ける `/usr/local/lib/ec2-chrome/cdp.py` に**正の版**を置く（今の正の版より小さければ置かない）
- EC2 の `cdp-heal`（`cdp_heal.sh`）が、`/home/ubuntu/cdp/cdp.py` の番号が正の版より小さい（無い・ファイルが消えた）ものを
  **書かれた瞬間に**戻す（systemd の `cdp-heal.path` の `PathChanged=`。1秒置いて読み直してから戻す）。保険に root の cron で
  5分ごと（`/etc/cron.d/cdp-heal`。idle-stop の cron とは別のファイルなので、古い枝の guard が idle-stop を入れ直しても消えない）。
  戻したら `/var/log/cdp-heal.log` に「どの番号（sha256）を、正の版の何番（sha256）に戻した」を1行
- **番号が正の版と同じか大きいものは触らない。** 新しい枝のセッションが新しい版を置いたら、それが生きる
- 手元から置く道具（`ec2.py put` で `/home/ubuntu/cdp/cdp.py` に置くもの全部・`ec2_exec.sh`・`ec2.py guard`）も、
  EC2 の版（生きている版と正の版の大きいほう）が手元より大きければ置かない（「置かなかった」と出て、落ちずに続く）
- 呼び名は変えない。古い枝の道具（`up(name)` など）は、戻された版をそのまま呼んで札を取る

**新しい版を出すときは、番号を上げる。** 上げずに中身だけ変えると、EC2 に残っている同じ番号の古い中身は戻されずに残る
（同じ番号は「新しい枝のもの」として触らないので）。上げたら master に入れて `ec2.py guard` で正の版を入れ直す。
試すだけなら番号を上げずに `put` する（同じ番号は置ける。上げて置くと、その版が EC2 に居座る）。
いまの版と見張りは `ec2.py run` で `/usr/local/sbin/cdp-heal status`（`cdp: live=<番号> <sha256> canon=<番号> <sha256> path=active cron=…`）。

**札の消えかた:** 手元のセッションの札は、**心拍（同じプロセスのスレッドが2分ごと）が10分途切れたら**失効する。
心拍を切り離した裏のプロセスで打たない（セッションが死んでも心拍だけ生き残ると、EC2 が止まらなくなる）。
待ち札は2分。EC2 の上の札は pid が死ねば次の確かめで。どれも、起動より前のもの・持って6時間を超えたもの・読めないものは数えない。

**セッションが死んでから EC2 が止まるまで（最長）:** 札の心拍が途切れて10分で失効 → idle-stop の「使っている」の最後の
確かめはその前 → そこから30分（cron の秒のずれで1回分遅れると35分）→ shutdown。**最長45分**（＋止まりきるまで1分ほど）。
待ち札だけなら2＋35＝37分、EC2 の上の札（pid）だけなら35分。ほかに、死んだセッションが流していた SSM のコマンドが
EC2 の上で走り続けていれば、その終わり（`run` の秒数）まで延びる。`--ttl` を最大の30分にした札なら最長65分。

## 3. プロファイル

- ログインが残っているのは**既定のプロファイル**（`~/.config/google-chrome/Default`）。
  あやとが Chrome リモートデスクトップで入って、ここでログインする
- **Chrome 136 以降は、既定の user-data-dir ではデバッグポートを開かない。**
  なので `up(名前)` は `~/cdp-<名前>` に `Default` を**1回だけ複製**して、そちらで起動する
  （Doneru だけは先に作られた `~/doneru-chrome`）。以後はその複製が正
- 既定のほうでログインし直したら `up(名前, reseed=True)` で複製し直す。**ただし fish は複製し直さない**
  （`~/cdp-fish` に TikTok の下書き約564MB があり、消える）。fish は `tools/shorts/voice/fish_login.py` でその Chrome の中で入り直す
- **既定の Chrome をまるごと写さない。** あやとの普段の Chrome の `Default` は 1.15GB のうち約 1.1GB が
  拡張（AdBlock・画面録画・VPN）・サービスワーカーのキャッシュ・Google ドキュメントのオフラインで、
  ログインとは関係が無い。`up()` の複製は `cdp.py` の `SEED_SKIP` を rsync で除いて写す（35MB）。
  手で写すときも同じものを落とす（`cp -a` でまるごと写すと、7つで 10.5G になった。#1013）
- **Chrome は `--disable-extensions` と `--disable-component-update` を付けて起こす**（`up()` が付ける）。
  付けずに起こすと、Preferences に載っている拡張を、ファイルを消してあってもウェブストアから入れ直す
  （cdp-fish で、消して 764M → 起動2回で 1.3G。2026-10-22）。旗を付けて80秒置いても、`Extensions` と
  `component_crx_cache` は増えなかった。`--disable-background-networking` は付けない
  （同期やログインの更新まで止めるおそれがある。Google のログインは一度まとめて切れている。4）
- **消してよい置き場**（Chrome を止めてから。2026-10-22 に7つとも、消す前と後でログインが変わらないのを確かめた）:
  - `Default/` の下の `Extensions`・`Local Extension Settings`・`Extension State`・`Extension Rules`・
    `Extension Scripts`・`Service Worker`・`File System`。`Cache`・`Code Cache`・`GPUCache` も消してよい
    （こちらは同じ日に先に空けた分。4）
  - `Default/IndexedDB/` の `https_drive.google.com_0.*` と `https_docs.google.com_0.*` **だけ**。
    ほかの項目は消さない（`~/cdp-fish` の `https_www.tiktok.com_0.*` 564MB は TikTok の下書き）
  - プロファイル直下の `extensions_crx_cache`・`component_crx_cache`
  - 直下の `optimization_guide_model_store`・`WasmTtsEngine`・`Safe Browsing`・`OnDeviceHeadSuggestModel`
    （7つで計 720M）は、**消して確かめていない**ので残してある
  - 触らない: `Network/`（Cookie）・`Local Storage`・`Login Data`・`Preferences`・`Local State`
- **cookie を中身で調べに行かない**（sqlite で名前を引くのも、権限の判定で止められた）。
  ログインしているかは、**ログインが要るページの中身が読めるか**で見る。「ログアウト」のボタンが
  DOM に在るかでは決めない（SUZURI は切れているのにボタンが在った。2026-10-10）
- 切れたら、あやとに入り直してもらわずに **`google_login.py` で押して入る**（SUZURI・Doneru とも
  あやとの同じ Google アカウント）。止まるのはパスワード・スマホの数字・メールの確認コードのところだけで、
  数字とコードはあやとからもらう

## 4. 躓いたところ

- **`npm` は root にも ubuntu の PATH にも無い。** nvm の下（`/home/ubuntu/.nvm/versions/node/v24.19.0/bin/npm`）を
  直に呼ぶ。`sudo -u ubuntu npm` は command not found になる（2026-10-22、#1013 で npm のキャッシュを空けるときに踏んだ）
- **ディスクは 29G。Chrome のプロファイルの複製7つは、既定の Chrome をまるごと写して作っていたので、
  `Cache`・`Code Cache`・`GPUCache` を空けた（1.5G）あとでも計 10.5G（1つ 1.2〜1.9G）あり、空きは 3.4G だった。**
  不要物を落として計 2.2G（うち `~/cdp-fish` の TikTok の下書き 564MB）、使われていなかった
  `~/.local/share/pnpm`（1.5G）も消して、空きは 13G になった（2026-10-22、#1013）。
  空けてよい置き場は 3 の「消してよい置き場」。ログ・Cookie・Local Storage は触らない
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
- **最初の `up(名前)` は、既定のプロファイルを複製する。** 不要物を落とすので 35MB（2026-10-22 に rsync の
  dry-run で数えた）。まるごと写していたころは 1.15GB で数分かかり、120秒を超えるので裏で回していた
- **複製したプロファイルを長く使い続けると、Google のログインがまとめて切れることがある。** 2026-10-12 01:30 UTC、
  10日に複製した `~/cdp-ytstudio` で YouTube Studio を2日使ったところで 401 になり、**既定のプロファイルのほうも
  3アカウントとも Signed out** になっていた（#768）。原因は確かではないが、同じログインを2つの Chrome で
  使い続けたのを Google が怪しんだ見立て。戻すには、あやとに Chrome リモートデスクトップでログインし直してもらうしかない。
  **401 や accounts.google.com への転送が出たら、すぐ止める**（その先を流しても全部落ちるだけ）
- **「測った数が合わない」ときは、見えていない変数を疑う。** SUZURI の大きさを1つの数で
  見積もって3回外した。原因は「倍率が絵の画素数に掛かる」ことで、画素数の違う絵を
  混ぜて測っていたから。数を2つ以上の見本で測り、**合わなければ何が違う見本かを先に並べる**
