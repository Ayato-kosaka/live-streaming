# 人が直す画面（PoC）

render.py が書いた `plan.json` を、書き出しと同じ見た目で下見し、
タイトル・字幕の文字・カットの入り/出（1コマ単位）を直して、**指示書への差分**を出す。
差分は ```json の囲みで出るので、issue にそのまま貼る → `../apply_patch.py` で指示書に当てる。

スマホ幅（390×844）で、開く → 字幕を直す → カットを +1 コマ ×3 → 差分を出す →
当てて書き直す → `verify.py` が通る、まで一周させた（2026-10-15）。

```bash
cd tools/shorts/render/editor && npm ci
python3 -I prep.py <work>/plan.json ../style.json ../fonts          # public/ と props.json
python3 -I make_bundle.py props.json dist <issue の URL>             # dist/bundle.json と下見用の軽い素材
npx esbuild page/editor.tsx --bundle --minify --format=iife --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --outfile=dist/editor.js
cp page/index.html dist/ && mkdir -p dist/fonts && cp public/fonts/*.ttf dist/fonts/
python3 -I range_server.py 4177 dist &                                # 終わったら落とす
node editor_test.mjs "http://127.0.0.1:4177/?data=bundle_webm.json" out/editor
```

- `src/Short.tsx` は書き出し（`npx remotion render src/index.tsx Short out.mp4 --props=props.json`）と
  下見（`@remotion/player`）が共有する部品。render.py の PIL の絵と同じ寸法で CSS で描く。
- この箱の Chromium は H.264 を再生できないので、確かめるときは `bundle_webm.json`（VP9）を使う。
  iPhone の Safari には `bundle.json`（mp4）を渡す。
- `python3 -m http.server` は Range に応えず動画の頭出しができない。`range_server.py` を使う
  （Firebase Hosting は Range に応える）。
- 下見の `<video>` の頭出しは ±1 コマ。最後の確認は書き出した mp4 で。
- Remotion（Player を含む）は個人・3人以下の会社なら無料。それを超えたら有償（LICENSE.md）。
