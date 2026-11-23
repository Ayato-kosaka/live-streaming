# キッチンカーの外装・内装の型（3D に貼る絵）

- 型は 3D の寸法表 `site/components/legends/kitchen/van3d/dims.json` から `python3 tools/van3d/template.py` が作る。1536×1024・1m = 150px。外装は外から、内装は中から見たとおりの向き
- `template-exterior.png`（外装の5面・窓・窓口・隠れる所）・`template-interior.png`（内壁4枚）。横を1枚で描く組の下絵は `guide-left.png`・`guide-right.png`（字なし）
- 描くのは柄だけ。型へ貼り込むのは `skin_pack.py`（区画・角の帯・白の区画・庇の垂れは道具が塗る）。区画の中に字・数字・ロゴを入れない

## 組ごとに置くもの（`<置き場>/<組>/`）
| ファイル | 比 | 何 |
| --- | --- | --- |
| `tile.png` | 1:1 | 継ぎ目の無い柄（四辺でつながる）。`mode: tile` の組 |
| `band.png` | 3:2 | 車体の下の帯（左右につながる1列）。のれんの組は庇の垂れにも使う |
| `left.png`・`right.png` | 3:2 | `mode: panel` の組の横（下絵 `guide-*.png` の上に描く。上下の灰の帯は切れる） |
| `front.png`・`back.png` | 1:1 | panel の組の前と後ろ（無ければ地の色） |
| `interior.png` | 3:2 | 内装を1枚で描く組（無ければ外装の柄を薄く敷く） |
| `spec.json` | — | 柄の大きさ・帯の高さ・色・垂れの形・内装の敷きかた（`skin_pack.py` の頭に例） |

## ChatGPT への頼みかた（`/chatgpt-image`。1枚ずつ）
> 柄: Draw one seamless square tile (1:1) to wrap a toy food van: <テーマ>. Flat island style: flat colours, no outlines, no shading, no highlights, no perspective. The pattern must continue across all four edges. No text, letters, numbers or logos.
> 帯: Draw a horizontal strip pattern (3:2) for the lower body of a toy van: <テーマ>, one row that repeats seamlessly from left to right. Same flat style. No text.
> 横を1枚で: Paint <テーマ> inside the white van shape of the attached guide (1536×1024). Keep the size. Do not draw the guide's lines, dashes, grey areas or light-blue windows. Flat style, no text.

## 貼る
`python3 tools/van3d/skin_pack.py <組> --src <置き場>/<組>` → `site/public/legends/nomad-kitchen-car/skins/<組>.webp`・`-1024.webp`・`interiors/<組>.webp` と `skins.json` の1行。
予算（外装 250KB・1024版 150KB・内装 150KB）を超えたら書かずに止まる。貼ったら `tools/sprites/van3d.mjs` で静止画を撮り直す。
