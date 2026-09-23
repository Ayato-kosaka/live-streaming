---
name: doneru-cookie
description: Doneru の取り込みが cookie（_dt）切れで止まったときに、EC2 のログイン済み Chrome から _dt を取り直して GitHub Secret の DONERU_COOKIE に入れ、取り込みを流し直す手順。値は一切出さない。パスワードや本人確認を求められたら止めてあやとに渡す。トリガー語:「Doneru の cookie」「_dt」「DONERU_COOKIE」「ingest-down」「Doneru が入っていない」「doneru-cookie」。
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

## 1. 回す

```bash
aws --profile sandbox --region ap-northeast-1 sts get-caller-identity   # 通らなければ止める
bash .claude/skills/doneru-cookie/ec2_exec.sh .claude/skills/doneru-cookie/remote_refresh.sh
```

`run_in_background: true` で回し、出力を**目で**確かめる。合格は次の2行が**両方**あること:

- `OK: DONERU_COOKIE を更新しました（_dt length=33）`
- `final state: stopped`

`final state` が `stopped` でなければ、手で止める:
`aws --profile sandbox --region ap-northeast-1 ec2 stop-instances --instance-ids i-0684d39b0c1b1abb6`

1回の起動は2〜4分。**続けて回すときは、前の回の `RUN FINISHED` を待ってから。**
（`ec2_exec.sh` は停止しきるまで待つが、止まりかけに start を投げると即死する）

## 2. 出力の読みかた

| 出力 | 意味 | 次の手 |
| --- | --- | --- |
| `google SID in profile: True` | Google のログインは生きている | — |
| `existing _dt valid: True` | 切れていない。そのまま検証して入れる | — |
| `step N: <host/path> -> <押したもの>` | ログインの画面を1枚ずつ押している | — |
| `diag: clickables=[…]` | その画面で押せそうなものの一覧（メールは `<mail>` に伏せる） | 外したときはここを見て、`FIND` の当てかたを直す |
| `STOP: パスワードを求められた` / `STOP: Google が本人確認を求めた` | 終了コード3。**何も打っていない・押していない** | あやとに渡す（4章） |
| `api.doneru.jp -> HTTP 200` と `csv rows` | `_dt` が本物 | — |

Doneru の入口は **トップ → `配信者ログイン` → `/auth/login` → `Sign in with YouTube` →
`accounts.google.com` のアカウント選択**（2026-09-23 の実測）。
`https://doneru.jp/login` は**存在しない**（「Return to Home」だけの画面）。

## 3. 入れたあと

1. `Fetch Doneru Donations` を `workflow_dispatch` で流す（inputs なし = 去年の元日〜今日。
   欠けた日はさかのぼって埋まる）
2. ワークフローの最後の step（`Doneru のぶんが、いつまで入っているかを写す`）で、
   入っている最後の日が今日か昨日になったかを見る
3. `投げ銭の台帳を入れ直す`（`tips_after_doneru.yml`）が `workflow_run` で後に続いたかを見る。
   **台帳は直近7日しか引き直さない**（`island_tips.py` の `DEFAULT_DAYS`）。
   7日より前にこぼれた投げ銭のカードは、これでは戻らない
4. `ingest-down` の issue を閉じる。書くのは「何をしたか」と `_dt` の**形**（長さ 33）だけ

## 4. あやとに渡すとき

**パスワードは絶対に打たない。本人確認の画面でも何も押さない。**
`/challenge/` の画面は**開いた時点で、あやとのスマホに通知が飛ぶ**（`challenge/dp`）。
スクリプトは次の1枚でそこを見て止まるが、**通知はもう1通届いている。**
あやとには「いつ頃の通知がこちらのものか」と「無視してよいこと」を必ず添える。

同じ理由で、**本人確認で止まっている間は、毎日の見張りに回させない。**
回すたびにあやとのスマホを鳴らすことになる。

## 5. ハマったところ（同じ所で転ばない）

- **ログインが残っているのは既定のプロファイル**（`~/.config/google-chrome/Default`）。
  `doneru-chrome` は最初は無かった
- **Chrome 136 以降は、既定の user-data-dir ではデバッグポートを開かない。**
  そこで `Default` と `Local State` を `~/doneru-chrome` に**1回だけ複製**して、そちらで起動する。
  以後はこちらが正（ログインし直したセッションもここに残る）
- **CDP の WebSocket は Origin を付けると 403 で弾かれる**（Chrome 111+）。
  起動に `--remote-allow-origins`、接続に `suppress_origin=True` の両方を付けてある
- **Ubuntu の pip は PEP 668 で素のままでは入れてくれない。** `python3-websocket` を apt で入れる
- **押すのは JS の `.click()` ではなく座標のクリック**（`Input.dispatchMouseEvent`）。
  Google のボタンが GSI の iframe に描かれる画面でも届く
- **「Google」の字を含むリンクを雑に押すと、規約のリンクを押し続ける**
  （「Googleプライバシーポリシー」を15回押して終わった回がある）。規約・ポリシー系は外してある
- **止める前に Chrome を閉じる**（`trap`）。閉じずにインスタンスを止めると、取り直した
  セッションがディスクに書き戻されないことがある
- `ec2_exec.sh` の `#TIMEOUT` 行を剥がした本体は `/tmp` に書く（前はスクリプトの隣に
  `.body` を残していて、リポジトリに未追跡のファイルが出た）
- 値の扱い: `_dt` は `/tmp/.doneru_dt`（600）を経由して `gh secret set` の stdin に渡すだけ。
  ログ・標準出力・issue・コミットに出すのは**長さ**と HTTP コードだけ
