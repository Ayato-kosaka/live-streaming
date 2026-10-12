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
| アカウント | **あやとの ChatGPT**。あやとが既定のプロファイルでログインし、こちらは `up("chatgpt", reseed=True)` で複製し直して使う | Q1: A |
| 会話の残し場所 | **専用のプロジェクト「あやと島案内鳥」** に入れる。一時チャットは使わない | Q2: C。あやとの履歴・メモリに島の作業を混ぜない。長い待ちのあとでも取りに戻れる |
| 名乗り | ChatGPT への頼みごとの中で `Claude` と名乗らない（視聴者さんに出る字に混ざりうる） | CLAUDE.md |

## 1. 使いかた

最初に置く（`cdp.py` と一緒に）:

```bash
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/ec2-chrome/cdp.py /home/ubuntu/cdp/cdp.py
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/chatgpt/chatgpt.py /home/ubuntu/cdp/chatgpt.py
```

1往復だけなら、問いを**ファイルで**渡す（SSM のコマンドに日本語や引用符を直に入れると崩れる）:

```bash
python3 .claude/skills/ec2-chrome/ec2.py put /tmp/…/q.txt /home/ubuntu/chatgpt/q.txt
python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && python3 chatgpt.py ask /home/ubuntu/chatgpt/q.txt') 200
```

続けて何往復かするときは python で:

```python
from chatgpt import *
t = fresh()                 # ChatGPT のタブを1枚だけ残して、新しい会話を開く
print(logged_in(t))         # False なら止まる（下の 3）
a = ask(t, "……")            # 返事の本文（Markdown）。同じ t で続けて呼べば同じ会話の続き
print(turns(t))             # [(role, 本文, 書き終わったか), …]
print(where(t.url()))       # 会話の URL（chatgpt.com/c/… ）。あとで fresh(url) で戻れる
```

| 関数 | 何をするか |
| --- | --- |
| `fresh(url)` | 新しいタブを作り、**ほかのタブは全部閉じて**から開く（前の send-command のタブは固まっていることがある＝`ec2-chrome` 4） |
| `send(t, text)` / `wait_reply(t, n)` / `ask(t, text)` | 送る・書き終わりを待つ・その両方 |
| `turns(t)` | 会話を読む。返事は DOM から Markdown に戻す（コードブロック・表・箇条書き） |
| `busy(t)` | 書いている途中か |
| `logged_in(t)` | ログインしているか |

## 2. 画面のつくり（2026-10-12 に見たもの）

**class では探さない。** 2026-10 の画面は class が stylex の乱数（`x1gnnqk1 x9f619 …`）で、
出し直しのたびに変わる。aria-label と data-* 属性で探す。

| もの | 探しかた |
| --- | --- |
| 入力欄 | `textarea[name=prompt]`（aria-label「Chat with ChatGPT」。id は `mobile-composer-prompt`） |
| 送る | `button[aria-label="Send message"]` |
| 書いている途中 | 送るボタンが `button[aria-label="Stop generating"]` に変わる |
| 会話 | `ol[aria-label=Conversation] > li[data-message-role=user\|assistant]` |
| 書き終わった返事 | その `li` に `data-message-complete` が付く |
| 返事の本文 | `li` の中の `section[aria-label="DIL content"]` |
| 問いの見出し | `[data-message-attribution]`（「You said:」）。本文から外して読む |
| ファイルを渡す | `input#octane-mobile-composer-files-input` / `…-photos-input`（`t.set_files(css, [パス])`） |

- **`innerText` で読まない。** コードブロックの囲い（```）が落ち、言語名の札（`python`）が
  本文の1行に混ざる。`turns()` が DOM を Markdown に戻している
- 書き終わりは「`data-message-complete` が付いた」**かつ**「Stop generating が消えた」の両方で見る。
  片方だけだと、書き始める前の一瞬を「書き終わった」と取ることがある

## 3. ログイン

- **ログインしているかは `logged_in(t)` で見る**（未ログインの画面は「Log in」のボタンを出す）。
  cookie を中身で調べに行かない（`ec2-chrome` 3）
- **ログインしていなくても、文字の問いには答えが返る**（2026-10-12 に実測。2〜7秒）。ただし
  **絵を作る・ファイルを渡す・会話を残す はできない**（画面に「Log in to … create images and upload files」）。
  未ログインの会話（`chatgpt.com/uc/…`）は、タブを閉じると戻れない（開き直すと `/` に飛ぶ）
- 切れたら**こちらからログインしに行かない。** あやとに #780 の形で頼む（Chrome リモートデスクトップで入り、
  ふだんの Chrome で chatgpt.com にログイン → こちらが `up("chatgpt", reseed=True)`）。
  `google_login.py` で「Continue with Google」を押す形は使わない——あやとの ChatGPT が Google で
  作ったものでなければ別のアカウントができてしまうのと、Google のログインを使う Chrome を増やすと
  まとめて切れた前例があるため（#768）

## 4. 待ちかた（インスタンスを止めるか）

**返事を待つあいだ、EC2 は止めない。** 止めて得になるのは待ちが1時間を超えるときだけ。

| 待つもの | 長さ（実測） | EC2 |
| --- | --- | --- |
| 文字の返事 | 2〜7秒 | 止めない |
| 絵1枚 | （ログイン後に測る） | 止めない |
| Deep research など | 数十分になりうる | 止めない。ただし SSM を握ったまま待たない（下） |
| **人の返事**（あやとのログイン・ヒアリング） | 分からない | **止める**（`ec2-chrome` 2） |

- t3.medium は1時間 約8円。30分待っても4円。起こし直しは**箱が立つまで1〜2分 + Chrome の起動 +
  SSM が繋がるまで**かかり、`/tmp` も消える。数分〜数十分の待ちで止めると、時間を払って何も浮かない
- **SSM のコマンドを握ったまま長く待たない。** 同じ箱への send-command は1本ずつしか流れない
  （`ec2-chrome` 4）。長い返事は「送ったら、いったん抜ける」→「あとで `fresh(会話のURL)` で開き直して
  `turns()` を読む」にする。**返事は ChatGPT のサーバーで作られるので、タブを閉じても会話に残る**
  （ログインして、ふつうの会話かプロジェクトで頼んだときだけ。未ログイン・一時チャットは消える）
