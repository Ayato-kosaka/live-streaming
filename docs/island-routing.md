# 島の道が、誰から配られるか

`firebase.json` の `hosting` を読むときに、先にここを読む。
とくに **「受け皿（`"source": "**"`）を足したくなったとき」** は必ず。

## 配る順番（Firebase Hosting）

上から順に、**最初に当たったところで止まる。**

1. `redirects` — `/nordic/photos` → `/cards`（301）
2. **`public`（＝`dist`）の中の実ファイル** ← ここが本丸
3. `rewrites` — `/island-api/**` は Functions、Expo の4面は `expo-app.html`
4. どれにも当たらなければ **`dist/404.html` を、状態コード 404 で配る**

**2 が 3 より先だ、という証拠は本番に出ている。**
`{"source": "/_next/static/**", "destination": "/__gone__"}` という rewrite が
置いてあるのに、`_next` のチャンクはふつうに配られている。

```
/_next/static/chunks/webpack-67dc99ebfff8a70b.js   200  4099B  text/javascript
/_next/static/chunks/zzz-nope.js                   404  59273B  text/html
```

在るものはファイルとして出て、無いものだけ `__gone__`（実ファイルが無い）に落ちる。
そして落ちた先が **59,273 バイトの 404**——これが `dist/404.html`、
島の「この道の先には、なにも無い」の紙そのもの。**4 の動きが既に見えている。**

## 受け皿（`"source": "**"` → `/index.html`）を置かない

2026-09-18 に外した。**足し直さないこと。** あれは Expo（SPA）の名残で、
島は Next の静的書き出し（`output: "export"`）なので、面はぜんぶ実ファイルで出る。
受け皿は「在る道を救う」ために要るのではなく、**無い道まで拾ってしまう。**

外すまで、本番はこうなっていた。

```
/kitchen/dummy-not-a-recipe  200  h1=（なし）  314816 bytes
/map/atlantis                200  h1=（なし）  314816 bytes
/nordic/day/999              200  h1=（なし）  314816 bytes
/legends/nope                200  h1=（なし）  314816 bytes
/totally-made-up             200  h1=（なし）  314816 bytes
/island/nowhere              200  h1=（なし）  314816 bytes
```

314,816 バイトはどれも**島の表紙**。困るのは3つあって、1つではない。

1. **道を間違えた人が、間違えたことに気づけない。** 表紙に飛ばされるので、
   自分がどこで外したのか分からない。島には
   `site/app/not-found.tsx`（「この道の先には、なにも無い」）が作ってあるのに、
   **誰ひとり辿り着けなかった**
2. **本番では、死んだ内部リンクが鳴らない。** 手元の静的配信は 404 を返すので
   `crawl.mjs` のリンク切れ判定は効く。けれど**本番は何を叩いても 200** なので、
   本番に出たリンク切れは**どの見張りにも見つけられない。**
   「鳴らない見張り」（`island-misses.md` #125 #127）と同じ穴
3. 検索の側から見ると、**無限の URL が表紙の写しとして 200 で並ぶ**（soft-404）

**`/404.html` へ rewrite で飛ばす形にしても直らない。** 中身は正しくなるが
**状態コードは 200 のまま**で、2 と 3 は何も変わらない。
**受け皿を置かないこと自体が直しかた**で、そうすれば Firebase が
`dist/404.html` を本物の 404 で配る（上の 4）。

### 外して大丈夫だと確かめたこと

- `site/app` の route は全部、静的書き出しの**実ファイル**
  （`output: "export"`、動く段は `generateStaticParams`）。
  sitemap に無い `/me` `/me/desk` `/me/remote` `/me/roulette` `/roulette`
  `/design` `/404` も、本番でそれぞれ別のバイト数で出ている（表紙の写しではない）
- 視聴者さんが作る企画のページは `/next/new?id=<id>` という**クエリ**なので、
  道は増えない（`components/live/Board.tsx`・`components/me/MyStuff.tsx`）
- Expo の4面（`/alertbox` `/daily_user_stats` `/ve-comment` `/ve-postit`）は、
  受け皿より前に自分の rewrite を持っている
- 配る前に、書き出した `dist/` の中を数えた（下の `--dist`）

## 数えかた

**配る前**（手元の `dist/` に、在る道が実ファイルで在るか）:

```bash
npm run build:web
node tools/sprites/notfound.mjs --dist
```

**配ったあと**（本番で、在る道が 200・無い道が 404）:

```bash
node tools/sprites/notfound.mjs
```

どちらも 0＝通った / 1＝見つかった / 2＝数えるものが無い。
`| tail` を挟まない——終了コードが消える。

見張りは**両側**を見る。「無い道が 404」だけを数えていると、
**本番に届かない日も「違反0」**になる（`island-standards.md` §15）。
対照は6本あって、1本でも外れたら本物の面の数字を1つも出さずに 2 で止まる。
足を1本ずつ抜くのは `BREAK=status|phrase|h1|live|gone`。
