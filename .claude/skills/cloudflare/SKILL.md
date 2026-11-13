---
name: cloudflare
description: Cloudflare（ドメイン ayato-arigato.com の登録と DNS）を、EC2 のログイン済み Chrome（~/cdp-cloudflare）から触る手順。「Google」で入る（あやとのスマホで数字を押してもらう）・入っているかを見る・DNS のレコードを「DNS only」で足す・DNS の編集だけの API トークンを作って GitHub の Secret に入れる。パスワードは打たない。トリガー語:「Cloudflare」「cloudflare」「ayato-arigato.com の DNS」「DNS レコードを足す」「Cloudflare の API トークン」「Cloudflare に入る」。
---

# Cloudflare を EC2 の Chrome から触る

`ayato-arigato.com` は Cloudflare Registrar で買ってあり（#1198）、DNS も Cloudflare にある。
Cloudflare のアカウントには**「Google」のボタンで入る**（あやとの Google アカウント。Doneru・SUZURI と同じ）。
Chrome を触る土台は `ec2-chrome`（起こす・札・止める）。ここに残すのは Cloudflare に固有のことだけ。

## 0. スマホの決まり（先に読む）

Google の本人確認の画面（`/challenge/`）は、**開いた時点であやとのスマホに通知が飛ぶ。** 数字は5分で切れる。
2026-11-13 に、あやとがスマホを持っているか確かめずに開いて1通鳴らした（#1202）。

1. **あやとが「スマホを持てる」と返事をしてから `start` を回す。** 先に issue（`/ask-ayato`）か会話で
   「1〜2分後に Google の通知が届きます。数字はここに書きます」と伝え、返事を待つ。返事の前に回さない
2. **数字はその場で1行。** `start` が `CHALLENGE numbers=['12']` を出したら「数字は 12」とだけ書いて turn を終える
3. **数字を伝える turn で、ほかの仕事を挟まない**（issue を見る・次の段取りを考える、もしない）。結果は次の turn の `wait` で見る

試すとき・道具を直したときは **`CHECK_ONLY=1`**。アカウントの選択の画面で、押さずに止まる（スマホは鳴らない）。

## 1. 道具

| ファイル | どこで動く | 何をするか |
| --- | --- | --- |
| `cf.py` | 手元 | `start`（EC2 を起こす → 道具を置く → EC2 で `cf_ec2.py login` を切り離して起こす → 数字が出た瞬間に1行）・`wait`・`check`・`dns-add`・`token` |
| `cf_ec2.py` | EC2（`/home/ubuntu/cdp/`。`cf.py` が毎回置く） | Chrome（`up("cloudflare")`）で中身を回す。最後の行は必ず `RESULT: <札> …` |

```bash
C=.claude/skills/cloudflare/cf.py
aws --profile sandbox --region ap-northeast-1 sts get-caller-identity   # 通らなければ、このセッションに EC2 の鍵は無い（ec2-chrome 0）
CHECK_ONLY=1 python3 $C start      # 試す: アカウントの選択で止まる。RESULT: CHECK_ONLY
python3 $C check                   # 入っているか（RESULT: LOGGED_IN / NOT_LOGGED_IN）。Google の画面は1枚も開かない
python3 $C start                   # あやとの返事のあと。数字まで 1〜2分（下）。timeout 300000
python3 $C wait                    # あやとが押したあと。最大7分。timeout 480000
python3 $C dns-add A @ 199.36.158.100 TXT @ hosting-site=live-streaming-d3cac CNAME www live-streaming-d3cac.web.app
python3 $C token                   # Secret CLOUDFLARE_API_TOKEN（--name / --secret で変えられる）
python3 .claude/skills/ec2-chrome/ec2.py stop    # start で EC2 を起こしたときだけ。使っている人が居れば断られる（それでよい）
```

- **`start` から数字まで:** 手元で EC2 が起きていれば 40〜70秒の見込み（道具を置く 10〜20秒・Chrome とログイン画面 10〜15秒・
  「Google」→ 選択 5〜10秒・押して dp 5〜10秒・聞き直し 1回 4〜6秒）。止まっていれば起こすぶん +1〜2分
- **`check`・`dns-add`・`token` は先に入っているかを見る。** 入っていなければ `NOT_LOGGED_IN` で何もしない
- `dns-add` と `token` も `CHECK_ONLY=1` で、**足さずに・作らずに**今あるものと「足す予定」だけを出す
- 3つとも、そのコマンドが EC2 を起こしたときだけ最後に `ec2.py stop` を通す。`start`/`wait` は止めない
  （続けて DNS を足すため。止め忘れても 30分の自動停止が止める）

## 2. ログインの道すじ（2026-11-13 の実測）

1. `dash.cloudflare.com/login` の「Google」（`aria-label="Continue with Google"` の `button`。同じ画面に Cloudflare 自身の
   メールとパスワードの欄もあるが、**そちらは触らない**）
2. `oidc.iam.cfapi.net/api/v1/sso/init` → 302 → `accounts.google.com/o/oauth2/v2/auth`。**同じタブで移る**（窓は開かない）。
   入口は Cloudflare が自分で `prompt=select_account` を付けている（無ければ道具が足して開き直す）
3. Google のアカウントの選択。**位置で選ばない。** メールを小文字にした SHA-256 で当て、行を画面の中へ送り、
   その点の `elementFromPoint` が当てた行の中かを見てから押す
4. `challenge/dp`: **画面のアカウントを sha256 で照らしてから**数字を出す（違えば数字を出さずに離れる）
5. 同意（Continue）→ `oidc.iam.cfapi.net/api/v1/sso/callback` → ダッシュボード。`/api/v4/user` が 200 なら `LOGGED_IN`。
   着いたら `down` で閉じる（セッションを書き戻す）

## 3. 守り（`cf_ec2.py` の `Guard`）

**accounts.google.com の画面（Document）への要求は、出る前に Fetch で1本ずつ止めて見る。**
画面を見てから止めるのでは遅い（開いた時点で鳴る）。

| 要求 | どうするか |
| --- | --- |
| `/challenge/dp` | **あやとのアカウントを押した直後だけ通す。** それ以外（CHECK_ONLY・check・dns-add・token・押す前）は落とす |
| `/challenge/pwd` | 落として `STOP: パスワード…`。**パスワードは打たない。** Google のログインごと切れている → `doneru-cookie` 7章と同じく、あやとに既定のプロファイルで入り直してもらい `up("cloudflare", reseed=True)` |
| ほかの `/challenge/…`（SMS・認証アプリ…） | 落として `STOP` |
| `/o/oauth2/…` の最初の1本 | `prompt=select_account` が無ければ足して開き直す |

落としたときは、出力に「開いていない。スマホは鳴っていない」と出る。**dp の画面を開いたあとで止まったとき**
（アカウントが違う・5分切れ）は**通知が1通出ている**ので、「押さなくてよい」とあやとに書く。

## 4. 出力の読みかた

| 出力 | 意味 | 次の手 |
| --- | --- | --- |
| `CHALLENGE numbers=['12']` | あやとのスマホに数字の通知が出ている | その場で「数字は 12」とだけ書いて turn を終える → 次の turn で `wait` |
| `RESULT: LOGGED_IN …` | 入れた（`もう入っていた` なら本人確認は出なかった） | `check` で閉じたあとも入っているかを見てから DNS |
| `  cookies: 期限つき N / 期限なし M [...]` | 閉じると消える cookie の名前 | 下の「閉じたら抜けた」 |
| `RESULT: EXPIRED …` | 5分のうちに押されなかった | 「その通知は押さなくてよい」と書き、あやとの返事をもらってから `start` をもう一度 |
| `RESULT: STOP パスワード…` | Google のログインごと切れている | 3 の表 |
| `RESULT: STOP …落とした（スマホは鳴っていない）` | 守りが本人確認の要求を出す前に止めた | 道すじが変わった。CHECK_ONLY で見直す |
| `RESULT: CHECK_ONLY …` | 押さずに止めた。絵は EC2 の `/home/ubuntu/shots/cf_chooser.jpg`（メールを伏せ、押すはずの点に赤い点） | `ec2.py get` で持ち帰って見る |
| `SAME` / `ADDED` / `CLASH` / `WOULD-ADD` | DNS: もう在る（足さない）/ 足した / 同じ名前に別の値（足さない・書き換えない）/ CHECK_ONLY の予定 | `CLASH` は中身を見て人が決める |

## 5. DNS とトークンの決めごと

- **DNS は足すだけ。** 同じもの（TXT は引用符の有無、CNAME は大小と末尾の点を揃えて比べる）が在れば足さない。
  A・AAAA・CNAME で同じ名前に**別の値**が在れば足さずに `CLASH`（A を2つ並べると、半分の人が違う所へ行く）。
  消す・書き換えるは道具に持たせていない
- A・AAAA・CNAME は**プロキシを切る**（`proxied: false`＝灰色の雲）。橙にすると Firebase Hosting の証明書が進まない
- **トークンは Zone → DNS → Edit（権限の名前は `DNS Write`）を `ayato-arigato.com` だけに。** ほかの権限は付けない
- **値は Cloudflare の画面に1回しか出ない。** `cf_ec2.py` はページの中の fetch の答えから値を python の変数に受け、
  本物の API（`api.cloudflare.com/client/v4/user/tokens/verify` とゾーンの DNS の読み）で確かめてから、
  `gh secret set <名前>`（EC2 の ubuntu がログイン済み。`doneru-cookie` と同じ）の **stdin** に渡す。
  出すのは長さと HTTP の答えだけ。報告・issue・コミットにも長さしか書かない
- 同じ名前のトークンが在れば作らない（値は二度と出ないので、要るなら古いのを Cloudflare で消してから）

## 6. つまずき

- **ダッシュボードの API は、画面と同じ形で送る**（2026-11-13 に `cf-shared-auth` の JS で見た）: `/api/v4/…` を same-origin で、
  `X-ATOK`（`window.bootstrap.atok`。入っていないときは無い）と `X-Cross-Site-Security: dash` を付ける
- **ログイン画面は描き終わるまで空に見える。** 開いた直後は字が0で、数秒後に「Google / Apple / GitHub」が出る。ボタンを最大25秒待つ
- **閉じたら抜けた、が起きうる。** Cloudflare の cookie に期限の無いものがあると、`down` で閉じたとたんに消える。
  `cf_ec2.py` は Chrome を起こす前に `~/cdp-cloudflare` の起動の設定を「前回の続き」（`session.restore_on_startup = 1`）にして、
  期限の無い cookie も書き戻させている。`wait` の `LOGGED_IN` のあと、`check` が `NOT_LOGGED_IN` なら、これが効いていない
  （**このときは DNS を足すたびにスマホが要る**ので、ここに書き足して直す）
- 札の列は `cloudflare`（`~/cdp-cloudflare`、ポート 9357）。EC2 の上の `cf_ec2.py` が pid で取り、終われば消える。
  `start` の回は `timeout 900` で必ず終わる（人の返事の待ちで札を持ち続けない＝30分の自動停止を妨げない）
- 手元の `ec2.py` から読む `cf.py` の聞き直しは1回 4〜6秒。数字が出てから手元に届くまでの遅れはその分だけ
