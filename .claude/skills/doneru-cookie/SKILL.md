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

| ファイル | 何をするか |
| --- | --- |
| `ec2_exec.sh` | EC2 を起動 → SSM で渡したスクリプトを実行 → **必ず停止**。最後に `final state: stopped` を出す |
| `remote_refresh.sh` | EC2 上で走る。Chrome を CDP 付きで起動 → `_dt` を読む → 切れていれば押してログイン → `api.doneru.jp` で 200 を確かめる → `gh secret set DONERU_COOKIE` |

- EC2: `i-0684d39b0c1b1abb6`（ap-northeast-1）、aws の profile は `sandbox`
- **必ずこの固定パスから呼ぶ。** `.claude/settings.json` の allow はこのパスに対して書いてある。
  スクラッチパッドに写して回すと、権限の確認で止められる
- 1行目が `#TIMEOUT=<秒>` なら、その秒数が SSM の待ち時間になる（`remote_refresh.sh` は 900）

## 1. 回す（あやとがスマホを手に持てるときに）

**Google は毎回スマホの本人確認（数字の照合）を出す**（2026-09-23 に4回回して4回とも出た）。
なので、**あやとがスマホを手に持っている時刻に回す。** 先にチャット（または issue）で
「1〜2分後に Google の通知が届きます。数字はここに書きます」と伝えてから起動する。

```bash
aws --profile sandbox --region ap-northeast-1 sts get-caller-identity   # 通らなければ止める
bash .claude/skills/doneru-cookie/ec2_exec.sh .claude/skills/doneru-cookie/remote_refresh.sh   # run_in_background: true
```

同時に、**画面の数字を EC2 から読む見張り**を Monitor で立てる。スクリプトは本人確認の画面で
数字を `/tmp/doneru_challenge.txt` に書いて最大5分待つので、別の SSM コマンドでそれを読む:

```bash
A="aws --profile sandbox --region ap-northeast-1"
cid=$($A ssm send-command --instance-ids i-0684d39b0c1b1abb6 --document-name AWS-RunShellScript \
  --parameters 'commands=["cat /tmp/doneru_challenge.txt 2>/dev/null || true"]' --query Command.CommandId --output text)
$A ssm get-command-invocation --command-id "$cid" --instance-id i-0684d39b0c1b1abb6 --query StandardOutputContent --output text
```

`numbers=['48', '48']` が出たら、**すぐ**あやとに「数字は 48」と書く。`done` が付けば先へ進んでいる。
（Monitor の中でこれを10秒おきに回し、変わったときだけ1行出す。起動から数字が出るまで1〜2分）

合格は、出力に次の2行が**両方**あること:

- `OK: DONERU_COOKIE を更新しました（_dt length=33）`
- `final state: stopped`

`final state` が `stopped` でなければ、手で止める:
`aws --profile sandbox --region ap-northeast-1 ec2 stop-instances --instance-ids i-0684d39b0c1b1abb6`

1回の起動は2〜7分（本人確認の待ちを含む）。**続けて回すときは、前の回の `RUN FINISHED` を待ってから。**

## 2. 出力の読みかた

| 出力 | 意味 | 次の手 |
| --- | --- | --- |
| `existing _dt valid: True` と `browser fetch: 200` | 切れていない。そのまま入れる（本人確認は出ない） | — |
| `existing _dt, browser fetch: 403 {"message":"Forbidden","userType":"streamer"}` | Doneru には入っているが**別の YouTube チャンネルで**入っている | スクリプトがログインし直す |
| `account chooser: 2 件、一致 [0]` | Google アカウントを `ACCOUNT_SHA256` で当てた | 一致が空なら止まる |
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
