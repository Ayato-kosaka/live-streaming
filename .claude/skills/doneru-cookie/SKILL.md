---
name: doneru-cookie
description: Doneru の取り込みが cookie（_dt）切れで止まったときに、EC2 のログイン済み Chrome から _dt を取り直して GitHub Secret の DONERU_COOKIE に入れ、取り込みを流し直す手順。値は一切出さない。Google のスマホ確認（数字の照合）はあやとに数字を伝えて押してもらう。パスワードは絶対に打たない。トリガー語:「Doneru の cookie」「_dt」「DONERU_COOKIE」「ingest-down」「Doneru が入っていない」「doneru-cookie」。
---

# Doneru の cookie を EC2 で取り直す

Doneru の取り込み（`Fetch Doneru Donations`）の認証は、ブラウザの cookie `_dt` だけ。
**寿命はおよそ7日**（2026-09-15 に入れ直した `_dt` が、9/22 17:18 UTC に切れた。
取り込みが止まった時刻と一致）。切れると `ingest-down` の札の issue が立つ。

ログインが Google OAuth なので、Actions の中では取り直せない。代わりに
**EC2 に置いてあるログイン済みの Chrome から取る。**

## 0. 道具

**EC2 の Chrome を触る土台は `ec2-chrome`（共通）。** Chrome の起こし方・CDP の繋ぎ方・
SSM の躓きはそちらに書いてある。ここに残すのは **Doneru に固有のこと**（ログインの道すじ・
本人確認・Secret への入れ方）だけ。

| ファイル | 何をするか |
| --- | --- |
| `ec2_exec.sh` | 土台の `ec2-chrome/ec2_exec.sh` へ渡すだけの1行。EC2 を起動 → 列 `doneru` の札を取る → `cdp.py` を置き直す → SSM でスクリプトを実行 → 札を返す → **止めてよければ止める**（ほかの人が使っていれば止めずに「idle-stop に任せる」とログに書く。`ec2-chrome` 2.5）。最後に `final state` を出す |
| `remote_refresh.sh` | EC2 上で走る。`cdp.up("doneru")` で Chrome を起こす → `_dt` を読む → 切れていれば押してログイン → `api.doneru.jp` で 200 を確かめる → `gh secret set DONERU_COOKIE` |
| `wait_challenge.sh` | 本人確認の数字が画面に出た瞬間に1行出して抜ける |

- EC2: `i-0684d39b0c1b1abb6`（ap-northeast-1）、aws の profile は `sandbox`
- **必ずこの固定パスから呼ぶ。** `.claude/settings.json` の allow は `doneru-cookie/ec2_exec.sh` に対して書いてある。
  中身は土台にあるが、呼ぶのはこちらのパス。スクラッチパッドに写して回すと、権限の確認で止められる
- 1行目が `#TIMEOUT=<秒>` なら、その秒数が SSM の待ち時間になる（`remote_refresh.sh` は 1200）

### 試すときは CHECK_ONLY で（あやとのスマホを鳴らさない）

`_dt` が生きているかだけを見て、**ログインは押さない・Secret も触らない**形がある。
スクリプトを直したあとは、まずこれで回す。EC2 がもう起きているときは止めずに回せる:

```bash
{ echo 'export CHECK_ONLY=1'; tail -n +2 .claude/skills/doneru-cookie/remote_refresh.sh; } > /tmp/claude-0/scr/doneru_check.sh
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/ec2-chrome/cdp.py /home/ubuntu/cdp/cdp.py
python3 .claude/skills/ec2-chrome/ec2.py run /tmp/claude-0/scr/doneru_check.sh 300
```

`CHECK_ONLY: _dt は 生きている` なら寄付一覧まで読めている。`切れている` なら exit 4 で止まる
（このときは下の「1. 回す」を、あやとがスマホを持てる時刻に）。2026-10-09 に土台へ載せ替えたあと、
これで `browser fetch: 200` まで通ることを確かめた。

## 1. 回す（あやとがスマホを手に持てるときに）

**Google は毎回スマホの本人確認（数字の照合）を出す**（2026-09-23 に4回回して4回とも出た）。
なので、**あやとがスマホを手に持っている時刻に回す。** 先にチャット（または issue）で
「1〜2分後に Google の通知が届きます。数字はここに書きます」と伝えてから起動する。

```bash
aws --profile sandbox --region ap-northeast-1 sts get-caller-identity   # 通らなければ止める
bash .claude/skills/doneru-cookie/ec2_exec.sh .claude/skills/doneru-cookie/remote_refresh.sh   # run_in_background: true
bash .claude/skills/doneru-cookie/wait_challenge.sh <上の出力ファイル>                          # 前で回す（timeout 660000）
```

**`wait_challenge.sh` が `CHALLENGE: … numbers=['51', '51']` を出したら、その場で
「数字は 51」とだけ書いて turn を終える。** 結果の確認はそのあと。
あやとが押す5分の窓は、数字が画面に出た瞬間から減り始める。

**やってはいけない（2026-10-01 に全部やって、通知を1回無駄にした）:**

- **`ec2_exec.sh` の出力ファイルを前で待たない。** あの出力は SSM が終わってから
  まとめて届く。数字の行がそこに見えた時点で、5分の窓はもう閉じている
- **Monitor で数字を拾う形にしない。** 前で別の道具を待っているあいだ、Monitor の
  知らせはこちらに届かない。あやとが「数字何番？」と聞いてきて、答えたときには切れていた
- **数字を伝える turn で、ほかの仕事（issue を見る・次の段取り）を挟まない**

`NO-CHALLENGE:` が出たら、続く行を下の表で読む（`existing _dt valid: True` なら本人確認は要らなかった）。

窓を逃したら、**その通知は無視してよい**とあやとに書いてから、もう1回回す
（前の回の `RUN FINISHED` を待ってから）。

合格は、出力に次の2行が**両方**あること:

- `OK: DONERU_COOKIE を更新しました（_dt length=33）`
- `final state: stopped`（ほかの人が EC2 を使っていたときは `running` と「止めなかった: ほかの人が使っている…idle-stop に任せる」。それで合格）

`final state` が `stopped` でなく、「idle-stop に任せる」も出ていなければ、`python3 .claude/skills/ec2-chrome/ec2.py stop` で止める
（使っている人が居れば断られる。`aws … stop-instances` を直に打たない。ほかの人の作業ごと止まる）

1回の起動は2〜7分（本人確認の待ちを含む）。**続けて回すときは、前の回の `RUN FINISHED` を待ってから。**

## 2. 出力の読みかた

| 出力 | 意味 | 次の手 |
| --- | --- | --- |
| `existing _dt valid: True` と `browser fetch: 200` | 切れていない。そのまま入れる（本人確認は出ない） | — |
| `existing _dt, browser fetch: 403 {"message":"Forbidden","userType":"streamer"}` | Doneru には入っているが**別の YouTube チャンネルで**入っている | スクリプトがログインし直す |
| `account chooser: 2 件、一致 [0]` | Google アカウントを `ACCOUNT_SHA256` で当てた | 一致が空なら止まる |
| `challenge/pwd -> PASSWORD` と `STOP: パスワードを求められた` | **Doneru ではなく Google のログインが切れている。** `_dt` だけの切れではない | **7章。** 複製し直しでは戻らない。あやとに入り直してもらう |
| `challenge/dp: 画面の数字 [...]` | スマホの本人確認。**あやとに数字を伝える** | — |
| `delegation: 押す -> ayato_arigato Youtube` | YouTube チャンネルを選んだ | 決まらなければ選択肢を書き出して5分待つ（下） |
| `browser fetch: 200 csv` / `api.doneru.jp -> HTTP 200` | `_dt` が本物で、寄付一覧が読める | — |
| `STOP: …` | 終了コード3。**何も打っていない・押していない** | 文言を読んで直す／あやとに渡す |

チャンネルが1つに決まらないときは、`/tmp/doneru_challenge.txt` に `channels=[...]` が出る。
番号（0 始まり）を SSM で `/tmp/doneru_choice.txt` に書けば、それを押す:
`--parameters 'commands=["echo 15 > /tmp/doneru_choice.txt"]'`

## 3. ログインの道すじ（2026-09-23 の実測）

1. `https://doneru.jp/auth/youtube?type=streamer`（配信者ログイン `/auth/login?loginType=streamer` の
   「Sign in with YouTube」の行き先。あやと 2026-09-23）。`https://doneru.jp/login` は**存在しない**
2. `accountchooser`: Google アカウントが2つ並ぶ。**Doneru に使うのは上**だが、位置では決めず
   `ACCOUNT_SHA256`（メールを小文字にした SHA-256。公開リポジトリなのでメールそのものは置かない）で当てる
3. `challenge/dp`: スマホに通知 → あやとが「はい」→ 数字を選ぶ
4. `oauth/delegation`: **どの YouTube チャンネルで入るか。** 同じアカウントに「あやと」
   「あやと と アプリ作り」「うらこう」などが並ぶ。**`ayato_arigato` だけを押す**。
   先頭（個人のチャンネル）を押すと、Doneru には入れるが寄付一覧が 403 になる
5. `oauth/id` → `consentsummary`: `Continue` を2回
6. doneru.jp に戻って `_dt` が付く（寿命7日、httpOnly）

## 4. 入れたあと

1. `Fetch Doneru Donations` を `workflow_dispatch` で流す（inputs なし = 去年の元日〜今日。
   欠けた日はさかのぼって埋まる）
2. BigQuery で、入っている最後の日が今日か昨日になったかを見る:
   ```sql
   SELECT DATE(donated_at, 'Asia/Tokyo') d, COUNT(*) n
   FROM `live-streaming-d3cac.youtube_chat.doneru_donations`
   WHERE donated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 10 DAY) GROUP BY d ORDER BY d
   ```
3. `投げ銭の台帳を入れ直す`（`tips_after_doneru.yml`）が `workflow_run` で後に続いたかを見る。
   **台帳は直近7日しか引き直さない**（`island_tips.py` の `DEFAULT_DAYS`）。
   7日より前にこぼれた投げ銭のカードは、これでは戻らない
4. `ingest-down` の issue を閉じる。書くのは「何をしたか」と `_dt` の**形**（長さ 33）だけ

## 5. 本人確認とあやと

**パスワードは絶対に打たない。** パスワード欄が出たら止まる。
`/challenge/dp` 以外の本人確認（SMS・認証アプリなど）でも止まる。
`/challenge/` の画面は**開いた時点で、あやとのスマホに通知が飛ぶ。**
あやとがスマホを手にしていないときに回すと、知らない通知を1通送ることになる。
そうなったら「いつ頃の通知がこちらのものか」と「無視してよいこと」を必ず添える。

同じ理由で、**毎日ひとりでに取り直させることはできない**（毎回あやとの手が要る）。
`_dt` は7日で切れるので、**切れる前に、あやとと時刻を合わせて回す。**

## 6. ハマったところ（同じ所で転ばない）

（Chrome 136 のデバッグポート・CDP の Origin・PEP 668 など、**Doneru に限らない躓きは
`ec2-chrome/SKILL.md` にも書いてある**。ここは経緯として残す）

- **ログインが残っているのは既定のプロファイル**（`~/.config/google-chrome/Default`）。
  `doneru-chrome` は最初は無かった
- **Chrome 136 以降は、既定の user-data-dir ではデバッグポートを開かない。**
  そこで `Default` と `Local State` を `~/doneru-chrome` に**1回だけ複製**して、そちらで起動する。
  以後はこちらが正（ログインし直したセッションもここに残る）
- **CDP の WebSocket は Origin を付けると 403 で弾かれる**（Chrome 111+）。
  起動に `--remote-allow-origins`、接続に `suppress_origin=True` の両方を付けてある
- **Ubuntu の pip は PEP 668 で素のままでは入れてくれない。** `python3-websocket` を apt で入れる
- **終わるときは `Browser.close`** で閉じる（`pkill` だけだと、取ったセッションが書き戻されなかった回がある）
- **押すのは JS の `.click()` ではなく座標のクリック**（`Input.dispatchMouseEvent`）。
  Google のボタンが GSI の iframe に描かれる画面でも届く
- **「Google」の字を含むリンクを雑に押すと、規約のリンクを押し続ける**
  （「Googleプライバシーポリシー」を15回押して終わった回がある）。規約・ポリシー系は外してある
- **止める前に Chrome を閉じる**（`trap`）。閉じずにインスタンスを止めると、取り直した
  セッションがディスクに書き戻されないことがある
- `ec2_exec.sh` の `#TIMEOUT` 行を剥がした本体は `/tmp` に書く（前はスクリプトの隣に
  `.body` を残していて、リポジトリに未追跡のファイルが出た）
- **`_dt` が本物でも、EC2 からの curl で 403 が出ることがある。** 中身が
  `{"message":"Forbidden","userType":"streamer"}` なら、**別の YouTube チャンネルで入っている**
  （Cloudflare ではない）。ブラウザの中の `fetch` でも同じ文言が出るのでそちらで確かめる
- **本人確認の待ちは「新しい `_dt` が付いたか」で抜ける。** 「`_dt` がある」で抜けると、
  残っている古い `_dt` で毎回5秒で抜けて、押す回数の上限を食い尽くす（あやとが押した瞬間に上限に届いた回がある）
- **チャンネルの当てかたを緩くしない。** `ayato|あやと` で当てると3つ当たって止まる
- 値の扱い: `_dt` は `/tmp/.doneru_dt`（600）を経由して `gh secret set` の stdin に渡すだけ。
  ログ・標準出力・issue・コミットに出すのは**長さ**と HTTP コードだけ

## 7. パスワード画面で止まったとき（Google のログインごと切れている）

`step N: accounts.google.com/v3/signin/challenge/pwd -> PASSWORD` で止まったら、
**切れているのは `_dt` だけではなく、EC2 の Chrome の Google のログインそのもの。**
ここから先へ進む道は**パスワードを打つことだけなので、こちらでは直せない**（2026-10-25 に初めて出た）。

いつもの切れかた（7日で `_dt` が切れる）との違いは、**アカウント選択のあとどこへ行くか**:

| アカウント選択のあと | 何が切れているか | 誰が直すか |
| --- | --- | --- |
| `challenge/dp`（スマホの数字） | `_dt` だけ。Google のログインは生きている | こちら（あやとは数字を1つ押すだけ） |
| `challenge/pwd`（パスワード） | **Google のログインごと** | **あやとが EC2 の Chrome で入り直す** |

### 複製し直し（reseed）で戻るかを、先に見る

`up("doneru")` の複製元は既定のプロファイル（`~/.config/google-chrome/Default`）。
**そちらが生きていれば `up("doneru", reseed=True)` で戻る**ので、あやとを呼ぶ前にここを見る。
**`doneru-chrome` には触らない**（触ると、分かっている状態まで失う）。使い捨ての名前で複製して、
**ボタンを押さずに**「ログインが要るページが読めるか」だけを見る:

```sh
cd /home/ubuntu/cdp && python3 - <<'EOS'
import sys, time, re
sys.path.insert(0, "/home/ubuntu/cdp")
import cdp
cdp.up("doneruprobe", "about:blank")
t = cdp.Tab(cdp._port("doneruprobe"), cdp.pages("doneruprobe")[0], timeout=30, strict=False)
t.call("Page.navigate", url="https://myaccount.google.com/"); time.sleep(10)
print("landed:", re.sub(r"[?#].*", "", t.js("location.href") or ""))
cdp.down("doneruprobe")
EOS
rm -rf /home/ubuntu/cdp-doneruprobe
```

- `myaccount.google.com` のまま → **既定は生きている。** `up("doneru", reseed=True)` で複製し直して、1章をもう一度
- `accounts.google.com/v3/signin/confirmidentifier`（Sign in - Google Accounts）→ **既定も切れている。** 下へ

**`SID` の cookie が在ることを「生きている」と読まない。** 2026-10-25 は `SID` も
`__Secure-1PSID` も揃っていて、それでもサインイン画面に飛んだ。**開いたページの行き先で見る**
（`ec2-chrome` 3 の「cookie を中身で調べに行かない」と同じ）。

### 既定も切れていたら、あやとに入り直してもらう

`ec2-chrome` 4 の #768（2026-10-12）と同じ形。**こちらでできることは無い**ので、札を立てて渡す:

1. `ingest-down` の issue に、**何が切れて・どこで止まって・いま何日まで入っているか**を書く。
   **閉じない**（直っていないので）
2. **通知を飛ばす**（自分で書いた `@Ayato-kosaka` は1通も飛ばない。`/ask-ayato`）。
   `call_ayato.yml` を `inputs[issue]=406` で叩く
3. 頼むことは2つのどちらか。**早いほうを選んでもらう**
   - EC2 を起こして、Chrome リモートデスクトップで**既定のプロファイル**の Google に入り直してもらう
     → そのあとこちらが `reseed` して取り直す
   - 手元のブラウザで `_dt` を `DONERU_COOKIE` に貼り替えてもらう（issue 本文の1〜3）
     → そのあとこちらが取り込みを流して突き合わせる
4. **EC2 は止めておく。** 人の返事待ちはいつ来るか分からない（`ec2-chrome` 2。1日つけっぱなしで約200円）。
   issue には「止めてあるので起こしてから入って」と書く

**このとき、あやとのスマホに通知は飛んでいない。** `/challenge/dp` を開いていないので、
いつもの「数字を選ぶ」通知は出ない。issue には**そのことも書く**
（「来た通知は無視してよい」とだけ書くと、在らぬ通知を探させる）。
