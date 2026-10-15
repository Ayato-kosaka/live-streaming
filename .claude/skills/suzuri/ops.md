# ① SUZURI を触る（どの用事でも先に読む）

## 0. 置く・起こす

```bash
python3 .claude/skills/ec2-chrome/ec2.py state            # running でなければ start（自分で起こしたら最後に stop）
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/ec2-chrome/cdp.py   /home/ubuntu/cdp/cdp.py
python3 .claude/skills/ec2-chrome/ec2.py put python/suzuri_common.py              /home/ubuntu/cdp/suzuri_common.py
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/suzuri/suzuri_ops.py /home/ubuntu/cdp/suzuri_ops.py
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/suzuri/characters.py /home/ubuntu/cdp/characters.py
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/ec2-chrome/google_login.py /home/ubuntu/cdp/google_login.py
python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/suzuri/login.py /home/ubuntu/cdp/login.py
```

EC2 で走らせる中身は、スクラッチパッドに `.sh` で書いて `ec2.py run` に渡す:

```sh
cd /home/ubuntu/cdp && python3 - <<'PY'
import sys; sys.path.insert(0, "/home/ubuntu/cdp")
from suzuri_ops import *
t = fresh_tab()
m, ps = read(t, 18855523)
print(m["title"], [p["item"]["name"] for p in ps if p["published"]])
PY
```

Chrome は `~/cdp-suzuri`（ポート 9223）で動く。既定のプロファイルから1回だけ複製したもの。

## 1. ログインしているか・切れていたら入り直す

```bash
python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && sudo -u ubuntu python3 login.py check; echo "exit $?"') 150
```

`signed in: True` なら入っている。`login.py` は SUZURI のページの中から `/account/materials` を読み、
**店の名前（ayato_arigato）が出るか**で決める。

**「Log Out」のボタンが在るかでは決めない。** 2026-10-10 に、ボタンは DOM に在る（`True`）のに
一覧は読めない（ログイン画面に飛ばされる）状態だった。**cookie を中身で調べに行かない**（権限の判定で止められる）。

### 切れていたら: Google でログインし直す（Doneru と同じアカウント。あやと 2026-10-10）

先にあやとへ「1〜2分後に Google の確認か、SUZURI の確認コードのメールが届きます」と書いてから回す。

```bash
bash .claude/skills/suzuri/login_ec2.sh            # 前で回す（timeout 600000）
```

出たものを見て、**その場で turn を終えてあやとに書く:**

| 出力 | 何が起きたか | 次 |
| --- | --- | --- |
| `CODE-NEEDED` | **SUZURI があやとのメールに確認コードを送った**（2026-10-10 はこれが出た） | あやとにコードを聞く → `login_ec2.sh code <数字>` |
| `CHALLENGE: … numbers=[...]` | Google のスマホ確認（数字の照合）。この日は出なかった | 数字だけ書く → `login_ec2.sh wait` |
| `FINISHED: … result: ok` | 入れた | — |
| `result: password` / `challenge` / `no-account` | 何も打たずに止まった | あやとに渡す |

道すじ（2026-10-10 の実測）: `suzuri.jp/login` の Google → Google のアカウント選択（メールの SHA-256 で当てる。
3件並ぶ）→ **SUZURI の確認コードの画面（`show_confirmation_code`）** → `/account/materials`。
Google の押し進めは土台の `ec2-chrome/google_login.py`（Doneru で組んだ手順を取り出したもの）。

- **パスワードは打たない。** 打つのは、あやとがその場でくれた確認コードだけ
- 2026-10-10 は、コードの画面で止まったところへ手でコードを打って入った。`login_ec2.sh code` で渡す形は
  そのあとに足したもので、**通しで回すのは次が初めて。** 次に回したら、ここを実績で書き換える
- 入ったセッションは `~/cdp-suzuri` に残る（Chrome を閉じて開き直しても `signed in: True` のまま）
- 画面は英語で出る（言語の cookie が en）。字で探すときは英語の字で

## 2. 読む

編集画面（`/account/materials/{id}`）の `.editor-step01` に、デザインと品目が JSON で埋まっている。

| 属性 | 中身 |
| --- | --- |
| `data-material` | 題・本文・利益（`price`）・公開・絵の URL（`textureUrl`）・画素数 |
| `data-products` | 品目ごとの公開・値段・`scale` / `offsetX` / `offsetY`・見本の絵（`sampleImageUrl`） |
| `data-items` | SUZURI の全品目（146）と、色・寸法の型（`variants`） |

`read(t, id)` がこれを読む。**生の HTML は属性を一重引用符で囲む**（DOM の outerHTML は二重に見せる）。
**DOMParser に通さない。** 3.8MB あり、1件ごとに組み立てると20件ほどでタブが固まった。
一覧は `list_ids(t)`（`/account/materials?page=N` を最後まで）。

## 3. 書く

画面の「保存する」が送る要求を、そのページの中から送る（CSRF は `meta[name=csrf-token]`）。

| 関数 | 要求 | 中身 |
| --- | --- | --- |
| `set_text(t, id, 題, 本文, 300)` | `PUT /account/materials/{id}` | `{material: {title, description, price, published}}` |
| `set_items(t, id, items)` | `POST /account/materials/{id}/products/bulk_upsert` | `{attrs: [{itemId, published, exemplaryItemVariantId, scale, offsetX, offsetY, …}]}`。**渡さなかった品目のうち、売っているものは非公開にする** |
| `delete(t, id)` | `DELETE /account/materials/{id}` | デザインと品目ごと消える。戻せない |

まとめた関数:

| 関数 | すること |
| --- | --- |
| `create(t, 絵, 題, 本文, 300, known)` | 新しいデザインを作って5品目まで入れ、読み直して確かめる。**やり直しで2つ作らない**（下） |
| `swap(t, id, 絵)` | 絵だけ差し替えて大きさを決め直す（題・本文・URL・売れた履歴はそのまま） |
| `finish(t, id, 絵, 題, 本文, 300)` | 5品目と大きさ（と題・本文）を入れ直して確かめる |

## 4. 絵を上げる

**画面のファイル欄（`input#material-texture`）に渡して、SUZURI 自身の処理に任せる**（`upload()`）。
presign を取る → lens へ送る → 画素数を書き戻す → デザインを保存、を SUZURI の JS がやる。
手で真似ると、1つ落としただけで壊れたデザインができる。

- 新しいデザインは `/account/materials/new` で渡す（保存されると URL が `/account/materials/{id}` に変わる）
- 差し替えは `/account/materials/{id}` で渡す（`uploadedAt` が変わったら済み）
- **無いパスを渡しても Chrome は黙って空のファイルを渡す**（画面は「PNGまたはJPEG」と言うだけ）。
  `upload()` は先に存在を確かめる。**島の絵の id は絵文字から引く。手で写さない**（🦄 の所に 🪟 の id を写した）
- PNG か JPEG、20MB・15000px まで。webp は上がらない

### 下ごしらえ（`prep()`）

**余白を落として、正方形の真ん中に置く**（周りに 4%）。alpha が 8 未満の点は塵として落とす。
余白が広いと、缶バッジもマグも小さく刷られる（前から上がっていた絵の多くがそうだった）。

## 5. 大きさ

| 品目 | 決め方 | 型（見本） |
| --- | --- | --- |
| Sticker (11) | 既定（`scale` なし）。絵の形に沿って切られる | 606（M） |
| Acrylic Key Chain (147) | 既定。絵の形に沿って切られる | 1952（クリア 50mm） |
| Tin Badge (17) | **絵の形から計算**（`badge_scale` × 1255 ÷ 画素数） | 849（44mm） |
| Mug (3) | 既定（高さいっぱいで片面に収まる） | 82（白 M） |
| Acrylic Panel (766) | **中身が幅 86mm × 高さ 115mm に収まる最大**（`panel_fit`）。縦は真ん中より少し上 | 4938（100×148mm） |

`layout(絵)` がこの5つを返す（`python/suzuri_common.py`。**EC2 のスキルと Actions の `SUZURI API` が同じものを読む**）。**ここが今回いちばん外したところ**なので、理由を残す:

- **`scale` は「絵の画素数 × 倍率」で効く。** 埋める大きさに対する倍率ではない。
  同じ 0.73 でも、783px の絵は 1255px の絵の 6割の大きさに刷られる。
  見本で測ると **刷られる大きさ ≈ 0.123mm × scale × 画素数**（縦横とも。縦は少し大きく出る）
- 缶バッジの既定（`scale` なし）は丸を**覆う**大きさで、四隅が切れる。
  中心からいちばん遠い描いてある画素が、丸の 8 割の内側に来るようにしている（縁は側面へ回り込む）
- パネルの既定は**高さに合わせて上に寄せる**ので、横長・正方形の絵は左右が切れる
- **`offsetY` だけ渡すと横に動く。** 見本の URL は `scale+offsetX±offsetY` で組まれていて、
  `offsetX` が空だと `offsetY` の値が横として読まれた。縦を動かすときは `offsetX: 0.0` も渡す
- `offsetY` はパネルの高さに対する割合で、正で下へ動く（0.1 で約1割）

## 6. 確かめる

**ワークフローで作る（先にこちら。EC2 も SUZURI のログインも要らない）。** 見本の絵はログイン無しの公開の URL なので、
Actions の中で1枚に並べて成果物（`suzuri-sheet`）に置く（#741）。

```text
workflow_id: suzuri_api.yml  ref: master
inputs: {"command": "sheet", "args": "--latest 6", "dry_run": "true"}     # 新しい6件。id を並べてもよい
```

持ち帰りかた:

1. `mcp__github__actions_list`（`list_workflow_run_artifacts`、その回の run id）で `suzuri-sheet` の id を引く
2. `mcp__github__actions_get`（`download_workflow_run_artifact`）で署名付きの URL をもらう（**数分で切れる**。すぐ次へ）
3. `bash .claude/skills/suzuri/fetch_artifact.sh '<URL>' <出し先>` → `sheet.jpg` を `Read` で見る

置き場（`productionresultssa<N>.blob.core.windows.net`）はこの箱のネットワーク設定で止められていることがある。
そのときは `fetch_artifact.sh` が EC2 に取りに行かせる（SSM だけ。ログインは使わない）。
**EC2 で別の作業が長いコマンドを流していると、SSM は順番待ちになる**（2026-10-12 に5分以上待った）。

毎晩の `characters` が作った晩は、その回の成果物に一覧がもう入っている。

EC2 の Chrome で並べる形（`sheet(t, [id, ...], "/home/ubuntu/shots/v.jpg", cell=150)`）も残してある。
ワークフローが使えないときだけ。

**見るのは: 切れていないか／ほかと大きさがそろっているか／上下に寄っていないか。** 合否は機械で決めない。
見本の絵（lens）は描きたてだと 502 を返すことがある（どちらの `sheet` も取り直す）。

## 7. 一括で回すとき

- **1デザインごとにタブを替える**（`retrying(fn, ...)` が `fresh_tab()` を渡す）。
  編集画面は 146品目ぶんの見本を読み込むので、同じタブで8件ほど続けると CDP が返らなくなった
- 返らなくなったら Chrome ごと起こし直して1回だけやり直す（`retrying` がやる）
- **済んだものは飛ばす。** 結果を `/home/ubuntu/suzuri/log_*.json` に1件ずつ書き、同じスクリプトを
  もう一度流せば続きから進む形にする（このセッションの箱は途中で作り直されることがある）
- **新規は、上げる前の一覧と比べて増えた1件を拾う**（`create()`）。絵を上げた直後に固まると、
  SUZURI には空のデザインができているのに id が返らない。比べずにやり直すと2つできる
- SSM は1本ずつしか走らない。一括のあいだに様子を見に行っても返ってこない。ログの JSON を後で読む
- 1件あたり1分ほど（74件で約70分）。20件ずつに分けて流すと、Bash の待ちに収まる

## 公式の API と MCP

2026-10-09 に `suzuri.jp/developer/documentation/v1` と `/developer/documentation/mcp_server` を読んだ。

| | REST API（`suzuri.jp/api/v1`） | SUZURI MCP（`mcp.suzuri.jp/mcp`） | このスキル（EC2 の Chrome） |
| --- | --- | --- | --- |
| 認証 | ユーザごとの **API キー**（read+write）か OAuth | OAuth 2.1（Claude のコネクタから SUZURI にログインして認可）。**API キーは使えない** | EC2 の Chrome のログイン |
| デザインを作る | ○（絵は URL かデータ URI） | ○（素材のアップロード） | ○ |
| 題・本文・利益・公開 | ○ | ○ | ○ |
| 品目を選ぶ | ○（`itemId`・`published`・見本の型） | ○ | ○ |
| **大きさ・位置（scale / offset）を保存** | **○（ドキュメントには無い）**。`PUT /materials/{id}` の `products[]` に `scale` / `offsetX` / `offsetY` を載せると保存される（2026-10-09 に `probe` で確かめた） | ○（「配置を指定した商品作成」「配置プリセット」がある） | ○ |
| 消す | ○ | ○ | ○ |
| 売上・できごと | ○ | ○（読むだけ） | （画面を読めば） |
| この箱から届くか | ×（suzuri.jp はプロキシで 403） | コネクタとして繋げば届く | EC2 経由で届く |

**REST API だけで5品目とも作れる**（作る → すぐ大きさを PUT → 見本の URL で読み直す）。
いまの大きさは見本の絵の URL に `…{幅}x{高さ}[.png].{scale}+{x}+{y}.webp` の形で埋まっている
（API の応答に scale の欄は無い）。API で上げた絵には `.png` が付かない。

**あやとの決め（#732）: REST API を GitHub Actions から呼ぶ口を作り、早いときはそちらを使う。**
それが `SUZURI API`（`.github/workflows/suzuri_api.yml` / `python/suzuri_api.py`）。

| 用事 | 先に使う | 理由 |
| --- | --- | --- |
| 島に新しいキャラが入った | **ワークフロー**（毎晩ひとりでに `characters`） | 5品目・大きさまで入れる |
| あやとの絵など、1枚作る | **ワークフロー**（`create --texture <URL\|island:🦄>`） | EC2 を起こさずに済む |
| 題・本文・利益を直す／消す／一覧 | ワークフロー（手で押す） | EC2 を起こさずに済む |
| 見本を並べて確かめる | **ワークフロー**（`sheet`） | 見本の絵は公開の URL。成果物に置いて持ち帰る（上の 6） |
| 絵の差し替え | スキル（EC2） | 絵の差し替えは API の PUT に無い（texture は作るときだけ）。**EC2 の SUZURI ログインが要るのはここだけ** |

手で押すとき（この箱からは `mcp__github__actions_run_trigger`）:

```text
workflow_id: suzuri_api.yml  ref: master
inputs: {"command": "update", "args": "21116414 --price 300", "dry_run": "false"}
```

結果は Actions のログ（`mcp__github__get_job_logs`）。**ログは公開**なので、売上・ユーザ情報の口は呼べないようにしてある。

## ほしいグッズの付箋に応える（2026-10-13・Tシャツ／ポーチ／フェイスタオル）

付箋（`goods-suzuri`）の絵は**完成イメージ**（Tシャツの写真など）で、刷る絵ではない。
刷る絵は ChatGPT で作り直し（原画を添付する）、`tools/goods/compose.sh` で**刷る面の大きさ**に組み、
`tools/goods/goods.json`（1件=1デザイン×1品目）から Actions の `goods` で作る。

- **SUZURI は絵を縮めずに、1画素=1画素で刷る面に置く。** 2倍の絵を渡すと中央だけが写る
  （格子の絵で測った）。入稿サイズは `suzuri.jp/item_templates`。Tシャツ（スタンダード）2520×2992、
  フェイスタオル 6929×2992、帆布ファスナーポーチ M 1062×826
- 透過の余白は削られる。白地は**四隅からつながった白だけ**を抜く（全部抜くと白抜き文字が穴になる）
- Tシャツの裏は `sub_materials`（`printSide: back`）。裏の絵は**別のデザインとして登録される**ので、
  見本の URL は `angleImageUrls` の表と裏を別々に使う。`imageUrl` の `[/angle]` を埋めると、
  裏にも表の絵が出る（誤読して一度「裏が効いていない」と判断しかけた）
- 非公開の商品は画面で開けず、`GET /products` にも出ない。出す前に見るには **`goods --trial`**
  （作って、見本を表裏とも 1530px で取り、デザインごと消す）。見本は成果物 `suzuri-sheet`
- フェイスタオルは吊るして使う。絵は左へ90°倒して右端へ寄せると、吊るしたとき字が読める向きになる
- 付箋の題が他社の書名のとき（「地球の歩き方」）、商品名・本文・返信に使わない

## 卓上カレンダー（2026-10-14・2027年版）

**公式の API では作れない**（品目 733 desk-calendar を POST でも PUT でも 403）。画面の ✏️（お手入れ）が裏で送る
GraphQL を、EC2 のページの中から送って組む。道具は `suzuri_calendar.py`、手順の全体は `docs/goods-calendar.md`。

```bash
# 刷る正方形12枚（calbake.py --print の出力）と text.json（title・description）を EC2 の <置き場> に置いてから
python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && sudo -u ubuntu python3 suzuri_calendar.py build /home/ubuntu/suzuri/cal2') 900
python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && sudo -u ubuntu python3 suzuri_calendar.py shots <デザインid> /home/ubuntu/suzuri/cal2') 400
```

- 1月の絵で**デザイン**を作り（題・本文・利益300・**非公開**）、2〜12月は**題の無い素材**として上げ、
  `CreateProduct(itemId: 733, prints: 12面)` で一度に組む。2〜12月の素材は一覧に「題なし・非公開」で並ぶ
- 型は 9140（white / 2027）の1つしかなく、作れば自動でそれになる。値段は 1,354円 ＋ トリブン 300円 = 1,654円
- **非公開の商品の売り場（`/ayato_arigato/<id>/desk-calendar/2027/white`）は、持ち主のログインでも 404**。
  出す前に見るのは見本の絵だけ
- 見本の URL は署名に大きさが入っていて 400〜500px までしか取れない。`shots` は品目の型
  （`item.productImageUrlTemplates`）に値を埋めて大きく取る。**`{lens2Adjustment}` は `.0.5893+0.0+0.0` の形**
  （先頭に `.`）。JSON で渡すと黙って無視され、四辺の切れた見本が返る——**本物の絵が切れたと誤読しかけた**。
  署名つきの 500px と画素で突き合わせて 0.0 になるのを確かめてある。ログインなしで開けて透かしも無いので、
  島の `/goods` の商品写真にそのまま使える（`og.suzuri.jp` は透かし入り）
- 面付け（`imposition_1-6` / `imposition_7-12`）と、`turn-over` `box-*` `print` `ring` などの角度は
  SUZURI の見本写真（富士山の絵）で、こちらの絵は載らない。12か月が並ぶのを見るのは面付けの2枚

### 決めた時刻に公開する

```bash
python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && sudo -u ubuntu python3 suzuri_ops.py publish <デザインid> --dry-run') 300   # 空打ち
python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && sudo -u ubuntu python3 suzuri_ops.py publish <デザインid>') 300             # 本番
```

デザインの公開と、作ってある品目ぜんぶの公開を入れて、売り場を**ログインなしで**開いて 200 まで待つ。
最後の行が `RESULT OK` なら出ている。**空打ちは同じ2つの要求を `published: false` のまま送る**ので、
向こうが受け付けるかまでは確かめられる（中身は変わらない。変わったら NG を返す）。
卓上カレンダーは12か月の絵が揃っていないと公開しない（画面の `hasAllDeskCalendarMonthImages` と同じ見張り）。
