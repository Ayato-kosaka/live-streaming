# 依頼文 2/3: 絵（絵担当）

> **運営へ。** 材料担当の報告（PR 番号・枝・注文書の道）が来てから、`<…>` を全部埋めて下の線から下を貼る。
> 埋める欄: `<国>`・`<街>`・`<国の名前>`・`<街の名前>`・`<材料の PR>`（番号）・`<材料の枝>`（例 `claude/bucharest-guide`）・`<運営のスクラッチ>`。

---

あなたは「あやと島」（ayato-arigato.com）の街のガイドの**絵担当**です。
注文書 `python/data/guide/<国>/<街>/art_order.json` のとおりに、<街の名前>のガイドの絵（表紙の横と縦・見どころマップ・やりたいこと8枚・料理・土産）を
ChatGPT（EC2 の Chrome）で描いて面の置き場に出し、材料担当の PR #<材料の PR> に積み、**面の見張りが全部 0 なら札 `出す` を付けます**
（面は noindex のまま本番に出る。検索に出す＝公開は運営が決める）。

## 最初に読む（名指しの所だけ）

- `.claude/skills/chatgpt-image/SKILL.md` の 6章（`guide_art.py` の回しかた・表紙と地図に字を焼く・布・共有の絵）
- `docs/guide-design.md` の 4-2（描かないもの）と ★6 の「表紙の絵」「どんな街の地図」の行
- 注文書と、手本の頼み書き `.claude/skills/chatgpt-image/guide/romania/bucharest.json`（頭の `title` `style` `style_ref` と、`do` の1項目だけ）

## 合格の条件

1. 注文書の品が全部 manifest に在り、`python3 .claude/skills/chatgpt-image/guide_art.py <国>/<街> check` が **0**
2. **テイスト**: やりたいことは8枚とも描いた絵で、ソフィアの `do-*` と同じ「大人の画集」（`style: "editorial"`・`style_ref` はソフィアの1枚のまま）。写真と混ぜない。字・番号・看板を描かせない
3. **布が0**: 料理と土産にナプキン・ハンカチ・テーブルクロス・敷物が無い（`NOCLOTH` は道具が入れる。`desc` に布を書かない）
4. **3都市の do の一覧の絵**を作って自分で見る（下の確かめかた）。ソフィア・スコピエと並べて、トーン・大きさ・題材の揃いが見劣りしない。
   似た2枚（ブレクとジョムレゼのような取り違え）は1枚ずつ描き直す
5. **240px**: 表紙の街の名前と、見どころマップの題・地区名が読める（`guide_thumb.py`）
6. **参考写真がリポジトリに0**（`git ls-files | grep -c -- '-ref-'` が 0）。手本に渡す写真は、リポジトリに在る写真か、島の名乗りで取ってスクラッチに置き、使ったら捨てる。**429・403 なら出口も名乗りも替えずに止まる**（#338）
7. 材料担当の PR の枝で、重い見張り（`guide=<国>/<街>`。`.claude/skills/city-guide/actions.md`）が「数」まで含めて全部 **0**、PR の CI が緑

## 確かめかた・進めかた

```bash
G=.claude/skills/chatgpt-image/guide_art.py; C=<国>/<街>; W=<スクラッチ>/guide-art/$C; S=<運営のスクラッチ>/<街>
git fetch origin <材料の枝> && git checkout -B claude/<街>-art origin/<材料の枝>
# 頼み書き .claude/skills/chatgpt-image/guide/<国>/<街>.json をブカレストのから写し、scene・品ごとの desc（英語）・alt を注文書から書き換える。
#   title.catch は材料の compose のキャッチと同じ字。areamap.areas[].label・source は材料の地区（docs/guide-copy.md 5章）
python3 $G $C plan                       # 品・id・後回しを1行ずつ。注文書の id と同じか
python3 $G $C layout --work $W           # 見どころマップの下敷き
python3 $G $C run --work $W              # EC2 へ一括（列 chatgpt の札は道具が取る。自分で札を持ち続けない）
# 待ち: until python3 $G $C status | grep -q '^DONE'; do sleep 300; done を run_in_background で（send_later は使わない）
python3 $G $C fetch --work $W && python3 $G $C finalize --work $W && python3 $G $C sheet --work $W --with bulgaria/sofia
for c in bulgaria/sofia north-macedonia/skopje $C; do python3 $G $c sheet --only do --work $S/sheet/$c >/dev/null; done
python3 - $S bulgaria/sofia north-macedonia/skopje $C <<'PY'
import sys; from pathlib import Path; from PIL import Image
S = Path(sys.argv[1]); ims = [Image.open(S / "sheet" / c / "sheet-do-grid.png").convert("RGB") for c in sys.argv[2:]]
out = Image.new("RGB", (max(i.width for i in ims), sum(i.height + 24 for i in ims)), (238, 232, 210)); y = 0
for i in ims: y += 24; out.paste(i, (0, y)); y += i.height
out.save(S / "do-3cities.png")
PY
python3 python/guide_thumb.py $C --out $S/thumb240.png
```

- 見るのは `sheet-items.png`・`sheet-tone.png`・`$S/do-3cities.png`・`$S/thumb240.png` の4枚だけ。1枚ずつの絵を開き直さない
- 違った品は頼み書きの `fix` か `desc` を直し、`v` を上げて `run --only do:<鍵>`（1枚ずつ）。`run` が「EC2 に前の絵が在る品」で止まったら `v` をもう1つ上げる
- **`finalize` のあと、描き直していない絵（見どころマップ・共有の JPG）に差分が出たら `git checkout --` で戻す**（中身が同じでも書き直す。差分を小さく保つ）
- EC2 は描き終わったら `python3 .claude/skills/ec2-chrome/ec2.py stop`（使っている人が居れば断られる。そのときは置いておけば30分で止まる）
- 表紙の題は、キャッチが変わった日は `finalize` だけで焼き直す（ChatGPT は要らない）

## 触ってよい範囲

- `.claude/skills/chatgpt-image/guide/<国>/<街>.json`（と隣の `-base.webp`）・`site/public/guide/<国>/<街>/`
- **触らない**: 材料（`python/data/guide/`）・面（`site/app/`・`site/content/`）・`guide_art.py` ほかの道具・ほかの街の絵・`.github/workflows/`。
  材料の鍵や字が違っていたら、直さずに報告に書く（材料担当の仕事）

## 出しかた

- **動いた時点で `claude/<街>-art` に push する**（描けた品が増えるたび。作業箱は再起動しうる）。この枝の PR は作らない
- 積む: 材料の枝へ squash で1コミットにして push する（材料の枝はほかの worktree が持っているので、別の名前で切る）
  ```bash
  git fetch origin <材料の枝> && git checkout -B land-<街> origin/<材料の枝>
  git merge --squash claude/<街>-art && git commit   # 日本語で「なぜ」。末尾に attribution の2行（届いている指示どおり）
  git ls-files | grep -c -- '-ref-'                  # 0 であること
  git push origin HEAD:<材料の枝>
  ```
- 重い見張り（`guide=<国>/<街>`）と PR の CI が全部 0 なら、PR #<材料の PR> に札 `出す`:
  `gh api -X POST repos/Ayato-kosaka/live-streaming/issues/<材料の PR>/labels -f 'labels[]=出す'`。赤が残れば札を付けずに報告。
  **札を付けたあとは、その枝で重い見張りを手で回さない・push しない**（ship.yml が待ったまま止まる。#1329 で67分止まった）
- コミットメッセージにモデル名を入れない

## トークンを食わない進めかた

- **`send_later` と `subscribe_pr_activity` を使わない**（運営のセッションに届く）。待ちは `run_in_background`
- 頼み書きの手本は頭と1項目だけ読む。ChatGPT の画面・EC2 のログを丸ごと読まない（`status` の1行と ng の行だけ）
- 重い見張りは Actions（`actions.md`）。読むのは表と落ちた step の末尾だけ
- 道具の呼び出しの目安は **40回**。越えそうなら、描けたぶんを push して報告に残りを書く

## 報告（10行以内）

描いた品の数（do・料理・土産・表紙・地図）と描き直した品・`check` の終了コード・`$S/do-3cities.png` と `$S/thumb240.png` の道・
重い見張りの表（CI のコメントを貼る）・札 `出す` を付けたか・注文書や材料と食い違っていたもの。
