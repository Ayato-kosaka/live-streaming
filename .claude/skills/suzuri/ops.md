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

```python
sheet(t, [id, ...], "/home/ubuntu/shots/v.jpg", cell=150)   # 1行1デザイン・5品目の見本を並べる
```

`ec2.py get` で持ち帰って `Read` で見る。たくさんあるときは、品目の列だけ切り出して並べ直すと見やすい
（パネルだけ・缶バッジだけ）。**見るのは: 切れていないか／ほかと大きさがそろっているか／上下に寄っていないか。**
見本の絵（lens）は描きたてだと 502 を返すことがある（`sheet()` は取り直す）。

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
| 絵の差し替え・見本を並べて確かめる | スキル（EC2） | 絵の差し替えは API の PUT に無い（texture は作るときだけ）。見本を並べる道具は EC2 側 |

手で押すとき（この箱からは `mcp__github__actions_run_trigger`）:

```text
workflow_id: suzuri_api.yml  ref: master
inputs: {"command": "update", "args": "21116414 --price 300", "dry_run": "false"}
```

結果は Actions のログ（`mcp__github__get_job_logs`）。**ログは公開**なので、売上・ユーザ情報の口は呼べないようにしてある。
