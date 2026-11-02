---
name: chatgpt
description: ChatGPT（chatgpt.com）を、EC2 のログイン済み Chrome から汎用に操作する土台。新しい会話を開く・問いを送る・書き終わりを待つ・返事を Markdown で読む・ファイルを渡す。絵を作る・絵を直す（背景透過など）は chatgpt-image がこの上に乗る。トリガー語:「ChatGPT」「チャッピー」「GPT に聞く」「chatgpt.com」「chatgpt」。
---

# ChatGPT を EC2 から操作する（汎用）

**先に `ec2-chrome` を読む。** ここはその上に乗る。道具は `chatgpt.py`（EC2 の `/home/ubuntu/cdp/chatgpt.py`）。

```
このセッション ──SSM──▶ EC2 ──CDP──▶ Chrome（~/cdp-chatgpt）──▶ chatgpt.com
```

## 0. 決まっていること（#780）

| | 決め | 理由 |
| --- | --- | --- |
| アカウント | **あやとの ChatGPT**（Plus）。ログインは `~/cdp-chatgpt` の Chrome に入っている。**複製し直さない**（5） | Q1: A |
| 会話の残し場所 | **専用のプロジェクト「あやと島案内鳥」**（`chatgpt.py` の `PROJECT`）に入れる。一時チャットは使わない。会話は消さない。**`chatgpt.com/` から始めない**（下） | Q2: C。あやとの履歴・メモリに島の作業を混ぜない。長い待ちのあとでも取りに戻れる |
| 会話の題 | **返事が来たら毎回付け直す**（`rename()`）。形は下 | あやと 2026-10-13「チャット名は毎回わかりやすく」 |
| 名乗り | ChatGPT への頼みごとの中で `Claude` と名乗らない（視聴者さんに出る字に混ざりうる） | CLAUDE.md |

### プロジェクトの外に作らない

**`fresh()` の既定はプロジェクト**（`PROJECT`）。`fresh("https://chatgpt.com/")` や、手で `chatgpt.com/` を開いて送ると、
あやとの履歴の本流に会話ができる（2026-10-13 に別のセッションがそうなった。あやとが見つけた）。
送る前に `in_project(t)` が True かを見る（`chatgpt.py ask` と `chatgpt_image.py` は見てから送る）。
外に作ってしまったら、会話の右上の「…」（2026-11-02 の名前は「Chat actions」）→「Move to project」→「あやと島案内鳥」で戻す。

### ほかのセッションと同じ時間に使わない（鍵）

ChatGPT の Chrome（`~/cdp-chatgpt`）は1つで、`fresh()` はほかのタブを全部閉じる。2つのセッションが
同じ時間に使うと、**お互いのタブを閉じ合う**（2026-10-13 12:54〜12:59 UTC、LINE スタンプのセッションと実際にそうなった）。

- **何回にも分けて使うとき**（一括・送ったら抜けて後で取りに来る・数十分かかる）は、始める前に鍵を置き、終わったら外す:

  ```bash
  python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && python3 chatgpt.py lock <セッション名> <用事>') 30
  # 送るスクリプトでは export CHATGPT_OWNER=<セッション名>（または fresh(owner=…)）
  python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && python3 chatgpt.py unlock <セッション名>') 30
  ```

- **`fresh()` は、ほかの人の鍵があればタブを閉じる前に止まる**（`Busy`）。止まったら待つ。誰が持っているかは `chatgpt.py who`
- `/home/ubuntu/stamp/RUNNING`（LINE スタンプの一括 #716 の置き場）も鍵として見る
- 4時間より古い鍵は、消し忘れとみなして数えない
- 1回の SSM で頼んで持ち帰りまで終わるもの（`chatgpt_image.py` 1本）は、鍵を置かなくてよい。`fresh()` が呼ぶ `up("chatgpt")` が、
  列 `chatgpt` の札をそのプロセスで取る（ほかの人が持っていれば空くまで待つ。`ec2-chrome` 2.5）。SSM のコマンドは同じ箱でも
  並んで走る（2026-10-24 に2本同時を見た）ので、守っているのは札。割り込まれるのは**コマンドとコマンドのあいだ**
- 何回にも分けるときは、鍵に加えて `ec2.py hold chatgpt --who … --purpose …` で札を持つと、ほかの道具（`up("chatgpt")` を呼ぶもの）も待つ
- 使い終わって EC2 を止めるときは、ほかのセッションが待っていないかを確かめてから（`ec2-chrome` 2）

### 会話の題

ChatGPT が自分で付ける題は「イラスト作成」「絵の描き直し依頼」ばかりで、あとから何の会話か分からない
（2026-10-13 にプロジェクトを見ると、38本のほとんどがそれだった）。**返事が来たら `rename(t, 題)` で付け直す。**

```
<日付> <用事>：<何を>（<どこで使うか・どうなったか>）
2026-10-12 背景透過：🃏 住人の絵（試し・手元版を採用）
2026-10-12 描き直し：地球をめぐるあやと（ステッカー・採用）
```

- 日付は頼んだ日（JST）。並べたときに順に並ぶ
- 用事は「背景透過」「描き直し」「新しく描く」「調べもの」など、動詞1つ
- 視聴者さんの名前・ハンドルは入れない（あやとの画面に並ぶだけだが、念のため）
- 採用・不採用が決まったら、括弧の中を書き足して付け直す

**付け直しで、その前後の大事な処理を巻き添えにしない。** 2026-11-02、右上のボタンの名前が「More」から
「Chat actions」に変わっていて付け直しが落ち、`chatgpt_image.py` が**描けた絵を保存せずに終わった**
（題を先に付け直していたため）。いまは:

- 道具の中では `rename_or_warn(t, 題)` を使う。落ちても止めず、`警告: 会話の題を付け直せなかった（2回）。<何がどう落ちたか> ／
  付けたかった題・いまの題・会話の URL` を標準エラーに**1行**出して先へ進む。戻り値は落ちた理由（通れば None）
- 絵は**保存してから**題を付け直す（保存が落ちても、題は付け直す）。`chatgpt.py ask` は付け直しが落ちても返事を出す
- 警告が出たら、その会話を `fresh(会話のURL)` で開き直して `rename` し直す。**黙って題無しのまま置かない**

## 1. 使いかた

最初に置く（`cdp.py` と一緒に）:

```bash
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/ec2-chrome/cdp.py /home/ubuntu/cdp/cdp.py
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/chatgpt/chatgpt.py /home/ubuntu/cdp/chatgpt.py
```

1往復だけなら、問いを**ファイルで**渡す（SSM のコマンドに日本語や引用符を直に入れると崩れる）:

```bash
python3 .claude/skills/ec2-chrome/ec2.py put /tmp/…/q.txt /home/ubuntu/chatgpt/q.txt
python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && python3 chatgpt.py ask /home/ubuntu/chatgpt/q.txt "2026-10-13 調べもの：○○"') 700
```

続けて何往復かするときは python で:

```python
from chatgpt import *
t = fresh()                 # タブを1枚だけ残して、プロジェクトの中の新しい会話を開く（既定が PROJECT）
print(logged_in(t), in_project(t))   # どちらかが False なら止まる（下の 3・上の 0）
a = ask(t, "……")            # 返事の本文（Markdown）。同じ t で続けて呼べば同じ会話の続き
rename(t, "2026-10-13 調べもの：○○")  # 返事が来たら毎回（上の 0）
print(turns(t))             # [(role, 本文, 書き終わったか), …]
print(where(t.url()))       # 会話の URL（…/g/g-p-…/c/…）。あとで fresh(url) で戻れる
```

| 関数 | 何をするか |
| --- | --- |
| `fresh(url)` | 新しいタブを作り、**ほかのタブは全部閉じて**から開く（前の send-command のタブは固まっていることがある＝`ec2-chrome` 4） |
| `send(t, text)` / `wait_reply(t, n)` / `ask(t, text)` | 送る・書き終わりを待つ・その両方 |
| `turns(t)` | 会話を読む。返事は DOM から Markdown に戻す（コードブロック・表・箇条書き） |
| `busy(t)` | 書いている途中か |
| `logged_in(t)` / `in_project(t)` | ログインしているか・プロジェクトの中か |
| `lock(名前, 用事)` / `unlock(名前)` / `holder()` | 鍵を置く・外す・いま誰が持っているか（上の「鍵」） |
| `rename(t, 題)` | 会話の題を付け直す（右上の「Chat actions」→「Rename」→「Chat title」→「Save」）。落ちたら例外 |
| `rename_or_warn(t, 題)` | 同じことを2回まで試し、落ちたら警告を1行出して先へ進む（上の 0「会話の題」） |
| `ask_once(問い, 題, url=PROJECT)` | `chatgpt.py ask` の中身。開いて1往復して題を付け直し、返事を返す |
| `attach(t, [EC2のパス])` | ファイルを入力欄に付ける（無いパスは先に弾く） |
| `images(t)` / `save_image(t, src, out)` | いちばん後ろの返事の絵を並べる・ページの中から取ってファイルに書く（絵を作るのは `chatgpt-image`） |

## 2. 画面のつくり（2026-10-12 に見たもの）

**class では探さない。** 2026-10 の画面は class が stylex の乱数（`x1gnnqk1 x9f619 …`）で、
出し直しのたびに変わる。aria-label と data-* 属性で探す。

**ただし aria-label も変わる**（右上の「More」が 2026-11-02 に「Chat actions」になり、題の付け直しが落ちた）。
押すものを名前1つで決め打ちしない。**知っている名前で探し、当たらなければ形（どこにあって何をするボタンか）で探す。**
押したあとは、開いたもの（メニューの項目・ダイアログの欄）で当たりかを確かめる。

**ログインの有無で、画面のつくりが別物になる。** `chatgpt.py` は両方を読む。

| もの | ログイン（ふだんはこちら） | 未ログイン |
| --- | --- | --- |
| 入力欄 | `div.ProseMirror[contenteditable=true]`（aria-label「Ask ChatGPT」／プロジェクトでは「New chat in …」） | `textarea[name=prompt]` |
| 送る | `button[aria-label="Send"]` | `button[aria-label="Send message"]` |
| 1往復 | `div[data-talvt-turn-state="in_progress"→"complete"]` | `li[data-message-role]`。書き終わると `data-message-complete` |
| 問い | `[data-user-message-bubble]` | 「You said:」の見出しを外した `li` |
| 返事 | `h4[data-conversation-role=assistant]` の次の箱 | `section[aria-label="DIL content"]` |
| 書いている途中 | **止めるボタンが出ないことがある**。箱が `in_progress` | `button[aria-label="Stop generating"]` |
| 作った絵 | `[data-testid=generated-image-gallery] img`（alt「Generated image N」、src は `blob:`） | 作れない |
| ファイルを渡す | `input[type=file][aria-label="Attach files"]`。同じ form に絵だけの口が3つ並ぶ（Take a photo など。どれも `accept=image/*…`）。名前で当たらなければ、`accept` の無い口 | 渡せない |
| 右上のメニュー | `main header` の `button[aria-haspopup=menu]`。aria-label は **2026-10「More」→ 2026-11-02「Chat actions」**。名前（`MENU_LABELS`）で当たらなければ形（`MENU_SHAPE`）で探し、開いた中に目当ての項目（「Rename」など）があるかで確かめる | — |
| 題を付け直す | 「Rename」で出るダイアログの `input[aria-label="Chat title"]`（無ければ、送る（submit）ボタンのあるダイアログのただ1つの字の欄）→「Save」（無ければ submit） | — |

- **`innerText` で読まない。** コードブロックの囲い（```）が落ち、言語名の札（`python`）が
  本文の1行に混ざる。`turns()` が DOM を Markdown に戻している
- **画面の字をまるごと出さない。** ログインした画面のサイドバーには、あやとの会話の題が並んでいる。
  調べるときも `main` の中か、ボタンの aria-label だけを出す
- **送るボタンは「入力欄と同じ form の中で、見えているもの」を押す。** `document.querySelector` で
  最初の1つを取ると、見えていない別の「Send」を押して何も送られない
- **絵を付けた直後の1回目の「送る」は、黙って無視されることがある**（2回に2回。ボタンは押せる見た目のまま）。
  `send()` は入力欄が空になるまで押し直し、何回目で通ったかを返す
- **送りそこねた問いは下書きとして残る。** 開き直しても戻ってくるので、`send()` は入れる前に入力欄を空にする
- **別の会話へ移るときは `fresh(url)`。同じタブで `t.go(url)` しない。** 会話をまたぐとタブの中身が
  別のプロセスに替わり、CDP の接続が切れる（`socket is already closed`。2026-10-13 に一覧を回して踏んだ）
- 中の API（`/backend-api/…`）は、ページの中の `fetch` でも **Bearer の札が要る**（cookie だけだと 401）。
  画面の操作で足りるうちは叩かない

## 3. ログイン

- **ログインしているかは `logged_in(t)` で見る**（未ログインの画面は「Log in」のボタンを出す）。
  cookie を中身で調べに行かない（`ec2-chrome` 3）
- **ログインしていなくても、文字の問いには答えが返る**（2026-10-12 に実測。2〜7秒）。ただし
  **絵を作る・ファイルを渡す・会話を残す はできない**（画面に「Log in to … create images and upload files」）。
  未ログインの会話（`chatgpt.com/uc/…`）は、タブを閉じると戻れない（開き直すと `/` に飛ぶ）
- 切れたら**こちらからログインしに行かない。** issue であやとに頼む（`/ask-ayato`）。頼む前に `up("chatgpt", "https://chatgpt.com/")`
  で窓を開いておき、「Chrome リモートデスクトップで入ると見える、chatgpt.com を開いた窓でログインして」と書く
  （そのログインは `~/cdp-chatgpt` に入り、以後そのまま使える。既定のプロファイルからの複製は要らない）。
  `google_login.py` で「Continue with Google」を押す形は使わない——あやとの ChatGPT が Google で
  作ったものでなければ別のアカウントができてしまうのと、Google のログインを使う Chrome を増やすと
  まとめて切れた前例があるため（#768）

## 4. 待ちかた（返事が止まって見えるとき・インスタンスを止めるか）

**タブの上の返事は、途中で止まって見えることがある。** ログインして考える型（Medium など）で頼むと、
サーバーでは書き終わっているのに、タブは「Thinking」のまま7分動かなかった（2026-10-12。あやとの画面には届いていた）。
`wait_reply()` は **45秒ごとにページを読み直して**確かめる。読み直しても返事は消えない
（ログインして、ふつうの会話かプロジェクトで頼んだとき。未ログインの会話は読み直すと消える）。

**返事を待つあいだ、EC2 は止めない。** 止めて得になるのは待ちが1時間を超えるときだけ。

| 待つもの | 長さ（実測） | EC2 |
| --- | --- | --- |
| 文字の返事（未ログイン） | 2〜7秒 | 止めない |
| 絵1枚（ログイン・Medium） | 74〜99秒 | 止めない |
| Deep research など | 数十分になりうる | 止めない。ただし SSM を握ったまま待たない（下） |
| **人の返事**（あやとのログイン・ヒアリング） | 分からない | **止める**（`ec2-chrome` 2） |

- t3.medium は1時間 約8円。30分待っても4円。起こし直しは**箱が立つまで1〜2分 + Chrome の起動 +
  SSM が繋がるまで**かかり、`/tmp` も消える。数分〜数十分の待ちで止めると、時間を払って何も浮かない
- **SSM のコマンドを握ったまま長く待たない。** 同じ箱への send-command は1本ずつしか流れない
  （`ec2-chrome` 4）。長い返事は「送ったら、いったん抜ける」→「あとで `fresh(会話のURL)` で開き直して
  `turns()` を読む」にする

## 5. ログインを消さない

- **あやとが「ログインした」と言ったら、複製し直す前に、いま開いている窓がログインしているかを先に見る。**
  2026-10-12 に、あやとがこちらの窓（`~/cdp-chatgpt`）でログインしたあと、こちらが既定のプロファイルから
  複製し直して、そのログインを消した。あやとにもう一度ログインしてもらうことになった
- 閉じるときは `down("chatgpt")`（セッションを書き戻させる）。pkill だけにしない
