# ショート動画の承認ゲート

ショート動画は、**あやとの承認を2回通らないと先へ進めない。**
この紙は、その関所がどう動いて、**何を守れて、何を守れないか**を書く。

| 置き場 | 役目 |
| --- | --- |
| `.github/workflows/shorts_gate.yml` | あやとのコメントを確かめて、`github-actions[bot]` が記録を書く |
| `tools/shorts/gate.py` | 判定（ワークフローと後段が**同じ関数**を通す）・後段の確かめ・提出ブロックの組み立て |
| `shorts/config/approvers.json` | 承認できる人の表（いまは `["Ayato-kosaka"]`） |
| `tools/shorts/gate_selftest.py` | 見張り。`python/selftest_runner.py` が拾うので毎 PR で走る |
| `tools/shorts/gate_fixtures.json` | REST の実物の形（2026-10-15 に取った4通り。本文だけ差し替え） |

## 3つの関所

| 関所 | AI が出すもの | あやとが書くもの | 後段が止まるところ |
| --- | --- | --- | --- |
| Gate 1 企画 | 3案（A/B/C）の原稿・絵コンテ | `/approve plan p2 B` | 本編集の前 |
| Gate 2 完成動画 | mp4・投稿タイトル・説明文 | `/approve video v3` | 投稿の前 |
| Gate 3 投稿 | — | — | 投稿の直前。**Gate 2 で承認したその版だけ**。1バイトでも変われば止まる |

流れ:

1. AI が issue（札 `shorts`）に**提出コメント**を書く。1行目に機械可読ブロック
2. あやとがスマホか web で `/approve …` を書く
3. ワークフローが確かめて、`github-actions[bot]` が**記録コメント**を書く（承認なら札 `gate1-approved` / `gate2-approved`）
4. 後段は進む前に `gate.py require` を呼ぶ。**記録を元のコメントから導き直して**、全部一致したときだけ通る

## 書式（あやとが打つもの）

| 書くこと | 例 |
| --- | --- |
| 企画を承認（案を1つ選ぶ） | `/approve plan p2 B` |
| 完成動画を承認 | `/approve video v3` |
| 差し戻す | `/reject video v3 音が大きい` |
| 直してほしい点を伝える | `/revise 冒頭をもっと短く`（版を書かなければ、いちばん新しい提出への依頼） |
| 版を名指しで直しを頼む | `/revise video v3 冒頭をもっと短く` |

スマホで打ちやすいように、次は全部同じに読む:

- 全角のスラッシュ・全角スペース・全角英数字（`／ａｐｐｒｏｖｅ　ｐｌａｎ　ｐ２　Ｂ`）
- 大文字小文字（自動で `/Approve` になっても通る）
- 日本語の言いかた: `/承認` `/却下` `/差し戻し` `/修正` `/直して`、`企画` `動画`
- 版は数字だけでもよい（`/承認 企画 2 B` は `p2`）。案は `B案` `案B` でもよい
- 1行目だけが命令。2行目から下は自由に書いてよい

**承認のコメントは書き換えない。** 書き換えたコメントは数えない（あとから書き換えても、
その承認は消える）。間違えたら新しいコメントで書き直す。

返事は `github-actions[bot]` がコメントで返す。数えなかったときは、理由と、何をすればよいかだけを書く。

## 提出コメントの作りかた（AI・後段の担当向け）

**1行目に機械可読ブロックを置く。** 人が読む本文（3案の表・動画の情報）はそのうしろ。

```text
<!-- shorts-submission {"files":[…],"gate":"plan","options":["A","B","C"],"schema":1,"sha256":"…","version":"p2"} -->
## 企画 p2
（3案の表など）
```

ブロックは自分で書かない。`gate.py` が作る（版の採番と sha256 の計算を2か所に書かない）。

```bash
# 版は issue のコメントを読んで採番する（p1, p2, … / v1, v2, …）
python3 tools/shorts/gate.py submission --issue 950 --gate plan --options A,B,C work/plan.md
python3 tools/shorts/gate.py submission --issue 950 --gate video out/short.mp4 out/post.json
```

Python から:

```python
import gate  # tools/shorts/gate.py
b = gate.bundle(["out/short.mp4", "out/post.json"])          # {"files": [...], "sha256": "…"}
version = gate.next_version(comments, "video")                # comments は REST の形
head = gate.submission_block("video", version, b["files"])    # これを本文の1行目に
```

- **sha256 は manifest の sha256。** ファイルごとの名前・sha256・大きさを名前の順に並べた
  JSON の sha256。企画なら plan の md 1本、動画なら mp4 と投稿文 JSON の2本。
  名前を変えただけでも別の版になる
- **出した版は変えない。** 直したら次の版として出し直す（提出コメントを書き換えると、
  その版は承認できなくなり、承認済みでも後段が止まる）
- 新しい提出が来ると、その関所の承認の札は外れる（企画が来たら動画の札も外れる）

## 後段の確かめかた

```bash
python3 tools/shorts/gate.py require --issue 950 --gate plan  --files work/plan.md
python3 tools/shorts/gate.py require --issue 950 --gate video --files out/short.mp4 out/post.json
```

終了コード **0=通った**（承認の中身を JSON で出す。企画なら選ばれた案 `option`）/
**1=止めた**（理由を1行）/ **2=読めなかった**（GitHub に届かない・引数が足りない）。
**0 のときだけ進む。** 2 を「たぶん大丈夫」と読まない。

```python
d = gate.require_approval(950, "video", gate.bundle(paths)["sha256"])   # 止まれば gate.Refused
```

読むのは公開のコメントなので、鍵が無くても（切れていても）確かめられる。

## 記録の中身

`github-actions[bot]` の記録コメントの1行目:

```text
<!-- shorts-gate-record {"approver":"Ayato-kosaka","approver_id":…,"comment_created_at":"…",
  "comment_id":…,"comment_url":"…","gate":"plan","issue":950,"kind":"approve","option":"B",
  "recorded_at":"…","schema":1,"sha256":"…","submission_id":…,"version":"p2"} -->
```

対象 issue・関所・版・sha256・選んだ案・承認者・元コメントの id と URL・時刻が入る。
数えなかったときは `<!-- shorts-gate-refused {"reason":…} -->` で返す（後段はこれを読まない）。

## 守れること

- **Claude の App から書いた `/approve` は数えない。** このセッション（AI）はあやとの
  アカウントで書くので、名前（`Ayato-kosaka`）も関係（`OWNER`）もあやとと同じ。
  違うのは REST の `performed_via_github_app` だけで、App を通ると `{"slug": "claude"}` が入る
- 表に無い人・オーナー/メンバー/共同作業者でない人・bot の `/approve` は数えない
- **古い版は承認できない。** その関所のいちばん新しい提出だけ
- **承認のあとに中身が1バイトでも変わったら止まる**（sha256）。新しい版が出ても止まる
- **記録だけを信じない。** 後段は、元のコメントが**在り・書き換えられておらず・いまも同じ判定を
  通る**こと、記録の中身がそこから導き直したものと一致することまで見る。
  `github-actions[bot]` は `call_ayato.yml` からも好きな字を書けるので、bot が書いたことは証明にならない
- AI が bot のふりをして書いた記録（Claude の App でも、PAT でも）は数えない
- 外の人の偽の提出で、本物の版を「古い版」にされない
- **差し戻しを消して承認を生き返らせる、を止める。** 承認のあとに差し戻し・直しの依頼の
  コメントがあれば、記録が無くても・書き換えられていても止まる（止まる向きに倒す）

## 守れないこと

**この仕組みは「AI が手順を飛ばす・間違える」を止めるもの。「あやとのふりをする AI」は止めきれない。**

1. **個人のトークン（PAT）で書かれたコメントは、あやと本人と見分けられない。**
   PAT で書くと `performed_via_github_app` は `null` になる。#147 の 2026-09-08 の
   コメント（id 5576818772, 5588823809）が実例で、文面から AI と見られるのに `null`。
   **`null` は「人間の証明」ではなく「Claude の App を通っていない」でしかない。**
   いまのクラウドセッションは gh のトークンが無効で、書ける経路は Claude の App だけなので
   塞がっているが、**あやとの PAT がセッションに渡った日に穴が開く。**
   見張りの `limit_pat` の足が、この限界をそのまま記録している（通ってしまう、を確かめている）
2. **消されたものは見えない。** AI はあやとのアカウントで書くので、あやとのコメントも bot の
   記録も消せる。差し戻しのコメントと記録を**両方消されると**、跡は API に残らない
3. **この仕組みのコードそのものを書き換えられる。** AI は master にマージできる。
   `gate.py` や承認者の表、ワークフローを書き換えれば関所は無くなる。履歴には残る
4. 札（`gate1-approved` など）は飾り。AI でも付け外しできる。後段は札を読まない

## もっと強くする案（あやとの操作が要る）

| 案 | 塞がるもの | あやとがやること | 残る穴 |
| --- | --- | --- | --- |
| **A. AI に PAT を渡さない** | 1 | 個人のトークンをセッションの環境・Secrets に置かない。置くなら fine-grained で、このリポジトリの Issues の書き込みを外す | 2・3 |
| **B. AI に別の身元を持たせる** | 1・2 | 機械アカウント（または自前の GitHub App）を作り、AI はそちらで書く。承認者の表はあやとのまま | 3 |
| **C. 投稿の job に Environment の必須レビュアー** | 1（App 経由） | Settings → Environments → `shorts-publish` を作り、Required reviewers に Ayato-kosaka。**Prevent self-review は付けない**（AI があやととして起動するので、付けるとあやとも押せない）。投稿の job に `environment: shorts-publish` を書く | MCP には「Review deployments」を押す口が無いが、REST の `pending_deployments` は PAT なら押せる。A と組で効く |
| **D. 承認にワンタイムコード** | 1 | 認証アプリに秘密を登録し、同じ秘密を Secret `SHORTS_TOTP_SECRET` に入れる。承認は `/approve video v3 123456` | ワークフローを書き換えれば秘密を取り出せる（3）。書き換えは履歴に残る |
| **E. 関所のコードの変更をあやとに知らせる** | 3 を見えるように | 無し（`call_ayato.yml` で、`tools/shorts/gate*`・`shorts/config/`・`shorts_gate.yml` を触る PR が出たら呼ぶ見張りを足す） | 知らせるだけで止めない |

いちばん効くのは **B**（AI があやとの名前で書かなくなれば、名前で見分けられる）。
すぐできるのは **A**（何もしなければ今の状態が続く）。

## 見張り

```bash
python3 tools/shorts/gate_selftest.py              # 足71件 ＋ 守りを1本ずつ外す対照20通り
python3 tools/shorts/gate_selftest.py --no-drill   # 足だけ
BREAK=sha python3 tools/shorts/gate_selftest.py    # 守りを1本外す（sha の足だけ落ちる）
```

終了コード 0=通った / 1=落ちた / 2=実物の形が読めない・対照が外れた。
対照は**何も外さない子が同じ件数を見て0本落とす**ことを先に確かめ、それから
`BREAK=` を20通り当てて、**外した守りの足だけ**が落ちることを見る。守りの表は
`gate_selftest.py` の頭にある。守りを足したら、`BREAKS` と足を1本ずつ足す。

## 本番で確かめる手順（master に入ったあと）

`issue_comment` は既定の枝（master）のワークフローで走るので、枝の上では確かめられない。

1. 札 `shorts` を付けた試しの issue を立てる
2. AI が `gate.py submission` で作ったブロックつきの提出（企画 p1）を書く
   → 何も返らない（正しい提出には書かない）こと、Actions の要約に「提出を受けた」が出ること
3. **AI が Claude の App で `/approve plan p1 A` を書く** → bot が
   「Claude の App から書かれたコメントは承認として数えません」と返し、札が付かないこと
4. `gate.py require --issue N --gate plan --files …` → 終了コード 1（`no_record`）
5. あやとがスマホで `/approve plan p1 A` を書く → bot が記録し、`gate1-approved` が付くこと。
   記録の `comment_id` があやとのコメントの id と一致すること
6. もう一度 `require` → 終了コード 0、`option` が `A`
7. あやとの承認コメントを書き換える → `require` が `source_edited` で止まること
8. 終わったら issue を閉じる
