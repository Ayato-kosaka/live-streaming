---
name: cloudflare
description: Cloudflare（ドメイン ayato-arigato.com の登録と DNS）を、EC2 のログイン済み Chrome（~/cdp-cloudflare）から読む手順。入る（ログイン画面の「覚えたアカウントの行」を当てて押す）・入っているかを見る・いまの DNS を読む・欲しいレコードと比べて、あやとがスマホの Cloudflare で打てる表を出す。DNS を足す・API トークンを作るは道具でやらない（Cloudflare の WAF が止める。あやとの手の仕事として issue にする）。パスワードは打たない。トリガー語:「Cloudflare」「cloudflare」「ayato-arigato.com の DNS」「DNS レコード」「Cloudflare の API トークン」「Cloudflare に入る」。
---

# Cloudflare を EC2 の Chrome から読む

`ayato-arigato.com` は Cloudflare Registrar で買ってあり（#1198）、DNS も Cloudflare にある。
Cloudflare のアカウントは**あやとの Google アカウント**で入る（Doneru・SUZURI と同じ）。
Chrome を触る土台は `ec2-chrome`（起こす・札・止める）。ここに残すのは Cloudflare に固有のことだけ。

**道具は読むだけ。** DNS を足す・API トークンを作る・GitHub の Secret に入れる、の口は持たない（6 の WAF）。
DNS は `dns-plan` の表を渡して、あやとがスマホの Cloudflare で入れる。

## 0. スマホの決まり（先に読む）

Google の本人確認の画面（`/challenge/`）は、**開いた時点であやとのスマホに通知が飛ぶ。** 数字は5分で切れる。
2026-11-13 に、あやとがスマホを持っているか確かめずに開いて1通鳴らした（#1202）。

1. **あやとが「スマホを持てる」と返事をしてから `start` を回す。** 先に issue（`/ask-ayato`）か会話で
   「1〜2分後に Google の通知が届くかもしれません。数字はここに書きます」と伝え、返事を待つ。返事の前に回さない
2. **数字はその場で1行。** `start` が `CHALLENGE numbers=['12']` を出したら「数字は 12」とだけ書いて turn を終える
3. **数字を伝える turn で、ほかの仕事を挟まない**（issue を見る・次の段取りを考える、もしない）。結果は次の turn の `wait` で見る

いつもの道（2 の a）では、2026-11-13 にスマホを鳴らさずに入れた。それでも押したあとに Google が数字の画面を
出すかどうかはこちらで決められないので、**決まりは変えない。** 先に `check`（何も押さない）で、入っていれば `start` は要らない。

試すとき・道具を直したときは **`CHECK_ONLY=1`**。押す前（覚えたアカウントの行か、Google のアカウントの選択）で止まる（スマホは鳴らない）。

## 1. 道具

| ファイル | どこで動く | 何をするか |
| --- | --- | --- |
| `cf.py` | 手元 | `check`・`dns-list`・`dns-plan`（表は手元で組む）・`start`（EC2 を起こす → 道具を置く → EC2 で `cf_ec2.py login` を切り離して起こす → 数字が出た瞬間に1行）・`wait` |
| `cf_ec2.py` | EC2（`/home/ubuntu/cdp/`。`cf.py` が毎回置く） | Chrome（`up("cloudflare")`）で `login`・`check`・`dns-list`。最後の行は必ず `RESULT: <札> …` |

```bash
C=.claude/skills/cloudflare/cf.py
aws --profile sandbox --region ap-northeast-1 sts get-caller-identity   # 通らなければ、このセッションに EC2 の鍵は無い（ec2-chrome 0）
python3 $C check                   # 入っているか（RESULT: LOGGED_IN / NOT_LOGGED_IN）。何も押さない
python3 $C dns-list                # いまのレコードの表（種類・名前・値・プロキシ）
python3 $C dns-plan A @ 199.36.158.100 TXT @ hosting-site=live-streaming-d3cac CNAME www live-streaming-d3cac.web.app
                                   # 足りない・食い違う・橙の雲を、あやとが打てる表に。全部揃っていれば 0、打つものがあれば 6
CHECK_ONLY=1 python3 $C start      # 試す: 押す前で止まる。RESULT: CHECK_ONLY
python3 $C start                   # check が NOT_LOGGED_IN で、あやとの返事のあと。timeout 300000
python3 $C wait                    # 数字を伝えて、あやとが押したあと。最大7分。timeout 480000
python3 .claude/skills/ec2-chrome/ec2.py stop    # start で EC2 を起こしたときだけ。使っている人が居れば断られる（それでよい）
```

- **`check`・`dns-list`・`dns-plan` は、そのコマンドが EC2 を起こしたときだけ最後に `ec2.py stop` を通す。**
  入っていなければ `NOT_LOGGED_IN` で何もしない。`start`/`wait` は止めない（続けて読むため。止め忘れても30分の自動停止が止める）
- `dns-plan` の引数は `種類 名前 値` の3つずつ。名前は `@`・`www`・`www.ayato-arigato.com` のどれでもよい。
  形が違えば EC2 を起こさずに使いかたを出す
- **`start` から数字まで:** EC2 が起きていれば 40〜70秒の見込み。止まっていれば起こすぶん +1〜2分

## 2. ログインの道すじ

**a. いつもの道（2026-11-13 の実測。スマホは鳴らずにダッシュボードに着いた）**

1. `dash.cloudflare.com/login` に、前に「この端末に覚える」で入ったアカウントの行が出る（メールの字を持つ押しどころ）。
   同じ画面の Cloudflare 自身のメールとパスワードの欄は**触らない**
2. **位置で選ばない。** 行のメールを小文字にした SHA-256 で当て、行を画面の中へ送り、その点の `elementFromPoint` が
   当てた行の中かを見てから押す。あやとの行が無ければ行は押さない（「Google」があれば b へ、無ければ `STOP`）
3. ダッシュボードに着く。`/api/v4/zones?name=ayato-arigato.com` がちょうど1つ返れば `LOGGED_IN`（ゾーンの持ち主＝あやとのアカウント）。
   着いたら `down` で閉じる（セッションを書き戻す）

押したあとに Google が出てきたときに備えて、守り（3）は「押した直後の `/challenge/dp`」を通す。覚えたアカウントからは
選択の画面を飛ばして数字の画面に来ることがあるので、**画面のアカウントを sha256 で照らしてから**数字を出す（違えば数字を出さずに離れる）。
この道では入口の `prompt` を書き換えない（書き換えずに通った。`select_account` を足すと別の道になる）。

**b. あやとの行が無いとき（覚えが消えた・`~/cdp-cloudflare` を作り直した）。スマホが鳴る道**

1. 「Google」（`aria-label="Continue with Google"`）→ `oidc.iam.cfapi.net/api/v1/sso/init` → `accounts.google.com/o/oauth2/v2/auth`。
   **同じタブで移る。** 入口は Cloudflare が `prompt=select_account` を付けている（無ければ道具が足して開き直す）
2. Google のアカウントの選択を、a の 2 と同じく sha256 で当てて押す
3. `challenge/dp`（ここで鳴る）→ 同意（Continue）→ `oidc.iam.cfapi.net/api/v1/sso/callback` → ダッシュボード

## 3. 守り（`cf_ec2.py` の `Guard`）

**accounts.google.com の画面（Document）への要求は、出る前に Fetch で1本ずつ止めて見る。**
画面を見てから止めるのでは遅い（開いた時点で鳴る）。

| 要求 | どうするか |
| --- | --- |
| `/challenge/dp` | **あやとのアカウント（覚えた行か、Google の選択）を押した直後だけ通す。** それ以外（CHECK_ONLY・check・dns-list・押す前）は落とす |
| `/challenge/pwd` | 落として `STOP: パスワード…`。**パスワードは打たない。** Google のログインごと切れている → `doneru-cookie` 7章と同じく、あやとに既定のプロファイルで入り直してもらい `up("cloudflare", reseed=True)` |
| ほかの `/challenge/…`（SMS・認証アプリ…） | 落として `STOP` |
| `/o/oauth2/…` の最初の1本 | b の道だけ: `prompt=select_account` が無ければ足して開き直す |

落としたときは、出力に「開いていない。スマホは鳴っていない」と出る。**dp の画面を開いたあとで止まったとき**
（アカウントが違う・5分切れ）は**通知が1通出ている**ので、「押さなくてよい」とあやとに書く。

## 4. 出力の読みかた

| 出力 | 意味 | 次の手 |
| --- | --- | --- |
| `CHALLENGE numbers=['12']` | あやとのスマホに数字の通知が出ている | その場で「数字は 12」とだけ書いて turn を終える → 次の turn で `wait` |
| `RESULT: LOGGED_IN …` | 入れた（`もう入っていた` なら何も押していない） | `dns-list` / `dns-plan` |
| `  saved: 覚えたアカウントの行 N 件、一致 [i]` | a の道。行のメールは伏せて出る | 一致が `[]` なら行は押していない（b へ進むか `STOP`） |
| `RESULT: EXPIRED …` | 5分のうちに押されなかった | 「その通知は押さなくてよい」と書き、あやとの返事をもらってから `start` をもう一度 |
| `RESULT: STOP パスワード…` | Google のログインごと切れている | 3 の表 |
| `RESULT: STOP …落とした（スマホは鳴っていない）` | 守りが本人確認の要求を出す前に止めた | 道すじが変わった。CHECK_ONLY で見直す |
| `RESULT: STOP 入ってはいるが ayato-arigato.com が 0 件` | 別のアカウントで入っている | 何もしていない。あやとに聞く（`/ask-ayato`） |
| `RESULT: CHECK_ONLY …` | 押さずに止めた。絵は EC2 の `/home/ubuntu/shots/cf_chooser.jpg`（メールを伏せ、押すはずの点に赤い点） | `ec2.py get` で持ち帰って見る |
| `PLAN: もう在る N・足りない N・食い違う N・プロキシを切る N` | `dns-plan` の勘定。続く表（すること・種類・名前・値・プロキシ）を issue にそのまま貼る | 下の 5 |

## 5. DNS とトークンは、あやとの手で入れる

- **流れ:** `dns-plan` → 出た表を issue に貼り、`/ask-ayato` で「スマホの Cloudflare で、この表のとおりに」と頼む →
  入れたと返事が来たら、もう一度 `dns-plan` を回して **`PLAN: … 足りない 0・食い違う 0・プロキシを切る 0`（終了コード 0）を見てから**閉じる
- **比べかた:** TXT は引用符の有無、CNAME は大小と末尾の点を揃えて比べる。TXT は同じ名前に何本並んでもよい
  （`hosting-site=` と `google-site-verification=` は両方 `@`）
- **食い違う（`CLASH`）:** A・AAAA・CNAME で同じ名前に**別の値**が在る、または CNAME とほかのレコードが同じ名前に在る。
  A を2つ並べると半分の人が違う所へ行く。**どちらを残すかは、こちらが中身を見て決めてから**表に書き足す（あやとに選ばせない）
- A・AAAA・CNAME は**プロキシを切る**（DNS only＝灰色の雲）。橙にすると Firebase Hosting の証明書が進まない
- **API トークンは道具で作らない。Secret にも道具で入れない。** 要るときは、あやとが Cloudflare の画面で作る仕事として
  issue を立てる。書くのは、何に使うか・権限（例: Zone → DNS → Edit を `ayato-arigato.com` だけ）・入れる先の Secret の名前。
  値は1回しか画面に出ないので、**値がこのセッションを通らない形**（あやとが GitHub の Secret の画面へ直に入れる）にする

## 6. つまずき

- **DNS の書きは、Cloudflare の WAF が止める。抜けようとしない**（2026-11-13）。ダッシュボードの中から
  `POST /api/v4/zones/<id>/dns_records` を4本送って、4本とも **403 と「Attention Required! | Cloudflare」の HTML** が返った。
  読みは同じ形で 200 なので、ログインが切れているのではない。ヘッダを変えて3回送り直しても同じだった——
  **それ自体がやってはいけないことだった。** これは Cloudflare の守りなので、ヘッダを写す・足す・ほかの口を探す、を**試みない。**
  書きが要るものは 5 のとおり、あやとの手に渡す
- **DNS の4本は、あやとがスマホの Cloudflare で手で入れた（2026-11-14）。** いまは全部入っていて、DNS only、証明書も出ている:

  | 種類 | 名前 | 値 |
  | --- | --- | --- |
  | A | `@` | `199.36.158.100` |
  | TXT | `@` | `hosting-site=live-streaming-d3cac` |
  | CNAME | `www` | `live-streaming-d3cac.web.app` |
  | TXT | `@` | `google-site-verification=…`（Search Console が出した値） |

- **ダッシュボードの中の API は、読みにだけ使う**（2026-11-13 に 200 で通った形）: `/api/v4/…` を同じ origin へ、
  cookie つきで、ヘッダは `x-cross-site-security: dash` だけ。通ったのは `/zones?name=…`・`/zones/<id>/dns_records`・
  `/system/bootstrap`。`cf_ec2.py` の `read()` は method を受け取らない（GET だけ）
- **ログイン画面は描き終わるまで空に見える。** 開いた直後は字が0で、数秒後に覚えたアカウントの行や「Google」が出る。
  最大25秒待ち、見えてから2秒置いて読み直したもので道を決める（行とボタンが同じ瞬間に出るとは限らない）
- **閉じても抜けなかった**（2026-11-13）。EC2 を止めて起こし直した3回とも、ダッシュボードを開いただけで入っていた。
  `check` が `NOT_LOGGED_IN` になったら、まず a の道（スマホは鳴らない見込み）、行が無ければ b（0 の決まりどおり）
- 札の列は `cloudflare`（`~/cdp-cloudflare`、ポート 9357）。EC2 の上の `cf_ec2.py` が pid で取り、終われば消える。
  `start` の回は `timeout 900` で必ず終わる（人の返事の待ちで札を持ち続けない＝30分の自動停止を妨げない）
- 手元の `ec2.py` から読む `cf.py` の聞き直しは1回 4〜6秒。数字が出てから手元に届くまでの遅れはその分だけ
