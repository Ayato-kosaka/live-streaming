# 検証とつまずき

**手順の文書。** 確かめるときに何をどう回すか（1章）と、踏みやすいところ（2章）と、数の読みかた（3章）。
決まりそのものは仕様（`docs/island-standards.md`）にある。ここは「どう回すか」と「どこで転ぶか」だけ。

2026-11-22 まで `CLAUDE.md` の「検証のしかた」「このサンドボックスから出られない先」「つまずきやすいところ」に
在ったものを、見出しも字もそのまま移した（`docs/adr/0009-claude-md-two-parts.md`）。
コードのコメントが「`CLAUDE.md`「◯◯」」と名指していたら、ここの同じ見出しを引く。

## 1. 検証のしかた

```bash
cd site
npx next dev -p 3000            # 開発サーバー
NEXT_DIST_DIR=.next-verify npx next build   # 確認用ビルド
```

**`NEXT_DIST_DIR` は、ビルドだけでなく開発サーバーにも付ける。**
付けないと `.next` を共有する。並列で何人も動かしていると、開発サーバー同士と
ビルドが同じ `.next` を奪い合って、ハイドレーションが止まったり
（「スマホ幅なのにPCの表示になる」）、`build-manifest.json が無い` で
ビルドが落ちたりする。**1人1つ、ポートと同じ名前を付ける。**

```bash
NEXT_DIST_DIR=.next-dev3130 npx next dev -p 3130
tools/build.sh 3130          # ビルドはこれで。1本ずつ順番に回る
```

**ビルドは `tools/build.sh` から回す。** 並列で `next build` が3本同時に走ると
load average が 130 まで行って、箱が `cat /proc/loadavg` すら返さなくなる（4コア）。
1本40秒なので、待ったほうが速い。

**測るときは開発サーバーを使わない。書き出したものを静的に配る。**

```bash
tools/build.sh 3130
python3 -m http.server 4130 --directory site/.next-3130 &
```

理由は2つ。**(1) 開発サーバーは 3.7GB まで膨らむ。** 静的に配ると 20MB。
今日3回、終わった担当の開発サーバーが 3.6〜3.7GB 抱えたまま残っていて、
空きメモリが 1.5GB まで落ちて箱が止まりかけた。
**(2) 開発サーバーの数字は本番と違う。** 先読みは既定で効かないし、
束ね方も圧縮も違う。転送量も描画も、書き出したもので測る。

開発サーバーを立てるのは、画面を作りながら見たいときだけ。
**そのときは終わったら必ず落とす**（`lsof -ti:3130 | xargs -r kill -9`）。

`.next` は 600MB を超える。使い終わったら消す。

**見張りを足した・書き換えたら、その見張りが「落ちるときに落ちる」かを見る。**

```bash
python3 python/selftest_runner.py        # 見張りを全部回す（緑かどうか。手元は2本ずつ並べる・CI は CPU の数。混んでいれば --jobs 1）
python3 python/mutation_drill.py --list  # 対照を、何に当てられるか
python3 python/mutation_drill.py         # 守っている実物を壊して、赤くなるかを見る
```

**緑は2通りに読める**——「守れている」と「何も見ていない」。
見分けるには守っている実物をわざと壊すしかない（`docs/island-standards.md` §15）。
`mutation_drill.py` は**壊したものを `git checkout --` で必ず戻す**が、
**実物を壊すあいだ、ほかの見張りを同じ置き場で回さない**こと
（混ざると嘘の赤が出る。道具の側でも鍵と `ps` で止めてある）。
本番では手で押す（Actions の「見張りの対照を当てる」）。
**手で実物を書き換えて試したら、戻したあと `__pycache__` を消す**（`find . -name __pycache__ -prune -exec rm -rf {} +`）。同じ長さの書き換えを同じ1秒で戻すと、Python は書き換えたほうの pyc を使い続ける（2026-10-23 から3日、この箱の `recipe_lag_watch.py` が何も見ずに「遅れ0件」を返していた）。
`selftest_runner.py` と `mutation_drill.py` から回すぶんは、子に空の pyc の置き場（`PYTHONPYCACHEPREFIX`）を渡すので読まない。

ページを触ったら、書き出したものを一通り回して確認する:

```bash
cd site && NEXT_DIST_DIR=.next-verify npx next build
python3 -m http.server 4321 --directory .next-verify &
cd ../tools/sprites && node crawl.mjs    # 全ページの h1・JSエラー・横あふれ・リンク切れ
```

Playwright は `tools/sprites/node_modules` にある（リポジトリ直下には無い）。
スクリーンショット系のスクリプトは `tools/sprites/` から実行する。

**無ければ入れ直す。箱を作り直したあとと、clone / worktree を切った直後は、これが要る。**

```bash
cd tools/sprites && npm ci
```

**worktree を切ったときは、2つの `node_modules` で扱いが違う。** 片方だけ直すと
残りが落ちたままになる（2026-09-21 に2人が同じところで転んだ。9本落ちて、
うち8本と1本で原因が別だった）。

| | どうするか | 外すとどうなるか |
| --- | --- | --- |
| `functions/node_modules`（331MB） | **symlink でよい** | 無いと見張りが**8本**落ちる（`clean_selftest` ほかが `functions/node_modules/.bin/tsc` を起こすだけなので、symlink 越しでも解決する） |
| `tools/sprites/node_modules`（9.6MB） | **実体を複製する。symlink では駄目** | `watch_census_selftest.py` が**1本**落ちる |

`tools/sprites` のほうが symlink で駄目なのは、`python/watch_census_selftest.py:457` が
`p.resolve().relative_to(root.resolve())` で道具の在りかを worktree 基準に直すから。
symlink だと `playwright-core/cli.js` が**元の clone の絶対パス**に解決されて、
`ValueError: is not in the subpath of` になる。

直下ではなく `tools/sprites/` に置いてあるのは、**直下は Expo の側**で、確認用の
道具とは別物だから。ここに `package.json` が無いと、npm が上に登って直下の
`package.json` を書き換える（実際に踏んだ）。

入れるのは `playwright` ではなく **`playwright-core`**。ブラウザは箱の
`/opt/pw-browsers` に入っているので、落とさせない（`playwright install` は
この箱では走らせない）。版は `1.56.0` で止めてある。`chromium-1194`（Chromium 141）に
合わせた版なので、**上げると各スクリプトの `executablePath` が外れる。**

**2026-10-22 に作業箱のイメージが替わって、`chromium-1194` が無くなった。**
在るのは `chromium-1243` の `chrome-linux64/chrome`（Chrome for Testing 153）と、
そこを指す `/opt/pw-browsers/chromium` だけ。**道具は書き換えずに、
セッションの頭（`.claude/hooks/session-start.sh`）が、名指しの場所
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` に本物への symlink を置く。**
置いたときだけ「ブラウザ: …へ繋いだ」と1行出る。1194 が実在する箱と CI の上
（`CI` / `GITHUB_ACTIONS`）では何もしない——runner は今も `playwright-core` に
1194 を自分で入れている。`playwright-core` は 1.56.0 のままで、この組み合わせで
`crawl.mjs`（全面）と `alert-compare.mjs` が通ることを 2026-11-02 に確かめた。
道具が「ブラウザが無い」で起きないときは、まず `ls -la /opt/pw-browsers` で
何が在るかを見る。hook の見張りは `python/session_start_browser_selftest.py`
（本物の置き場には触らず、偽の置き場で回す）。

**`tools/sprites/_` で始まるものは使い捨てで、git に入っていない**
（`.gitignore` の `tools/sprites/_*`）。その場で測って捨てる用なので、
**`docs/` から名指しで呼ばない。** `_` 付きは全部こちら側なので、
手元には残っていても、**clone にも worktree にも無い。**
**何本あるかはここに書かない**（2026-09-18 に 461本/242本と書いて、
2026-10-13 には 349本/340本だった）。数えるのは
`python3 python/counts.py` の「tools/sprites のファイル / うち git に在るもの」。

`docs/` に `_` 付きの名前が出てくるのは「そのとき、こう測った」という
**記録**であって、手順ではない（`island-atlas.md` の `_abport.mjs`、
`nordic-fund.md` の `_nftie.mjs` `_nlen.mjs`、`island-misses.md` の
`_errraw.mjs`、`island-review-3.md` の `_rev3walk.mjs` の5か所）。
**探しに行かない。** 同じことをもう一度測りたいなら、書き直すほうが早い。

**繰り返し使う道具は、`_` を付けずに git に入れる。** 手引きから名指しで
呼ぶものは、次にこのリポジトリを clone した人の手元にも無いといけない。

### 1-1. このサンドボックスから出られない先

**ブラウザからは** `lh3.googleusercontent.com`（住人のキャラクター画像）と
`upload.wikimedia.org`（北欧の写真）に届かない。本番では出る。

**`tools/sprites/prod.mjs` の `PASS` に無い先は、撮ると必ず空で写る。**
2026-09-16 に `storage.googleapis.com` がそれで、料理ランキングの面
（`public/#853_…`）が「いまはランキングを出せません」の空っぽな絵になった。
**本番は無事だった**（curl では 200 / 5.1MB / 18,140行）。あやうく、直っている
ものを不具合として報告するところだった。**外の宛先を使う面を撮るときは、
先に `PASS` を見る。**

**ただし curl では取れる。** 住人の絵を全員 `ayato.png` に差し替えて撮ると、
島の12人が全員そっくり同じに写って、レビューしても何も分からない。
先に落としてから撮る:

```bash
python3 tools/sprites/avatars.py     # /tmp/avatars/<icon>.png へ、名簿ぜんぶ＋他己紹介＋料理の回
                                     # （何人ぶんかは python3 python/counts.py が出す。
                                     #  22人と書いてあった時期があり、実際は129人だった）
```

差し替えは `tools/sprites/route.mjs` の `offline(ctx)` を使う。
落としてあれば**本番と同じ絵を1人ずつ**返し、無ければ `ayato.png` に落ちる。

```js
import { offline } from "./route.mjs";
const ctx = await b.newContext({ ... });
await offline(ctx);
```

## 2. つまずきやすいところ

- **定時実行は、何時間も遅れて走る。数は手引きに書かない——道具で測る** —
  cron は「書いて master に載せれば、その時刻に走るもの」ではない。
  **ここに数字を書くのをやめた**（2026-10-13）。前は実測の表が貼ってあったが、
  **6日で古くなり、しかも外れかたが「古い数字のほうが小さい」**ので、
  **ふつうの遅れを「遅すぎる」と誤って騒ぐ側に倒れていた。**

  ```bash
  python3 python/cron_lag.py              # cron を持つ全部の、回数・中央値・いちばん遅い
  python3 python/cron_lag.py --by-month   # 月ごとに切る（悪化しているかが見える）
  python3 python/cron_lag.py --days 30    # 直近だけ
  ```

  予定の時刻は `.github/workflows/*.yml` の `cron:` から読むので、
  **cron を動かしても道具を直さなくていい。** 出るのは5つ——
  回数 / いちばん早い / 中央値 / p95 / いちばん遅い / 4時間超の回数、そして
  **「もう来ないはず」と判断するまで待つ時間**（いちばん遅かったものの切り上げ。
  p95 で切ると20回に1回は無実を疑うことになるので、そちらは使わない）。
  数えかたの対照は `python/cron_lag_selftest.py`（足を5本、1本ずつ抜いて当てている）。

  **読むときに忘れないこと3つ:**

  - **遅れは月ごとに悪化している。** 2026-10-13 に測った時点で、チャット取り込みの
    中央値は 2026-03 の 0.1時間から 2026-10 の 3.6時間まで、ほぼ単調に伸びていた。
    **先月の数で今月を判断しない。** 疑う前に、まず道具を回す
  - **20:00 / 20:30 UTC の2本と、01:00〜04:30 UTC に置いた保険の cron とでは、
    遅れの桁が違う。** 前者は数十分〜数時間、**後者は一度の例外もなく4時間以上
    遅れる**（時間帯の混み具合の差）。「02:00 の保険」は 02:00 には動かない
  - **「一度も発火しない cron がある」は、もう当たらない。** 2026-09-10 に載せた
    `rebake.yml`（01:00 UTC）は、翌朝まで待っても発火せず**17日ぶん賭けられない**
    と判断したが、**いまは cron を持つ14本ぜんぶに発火の実績がある**（2026-10-13 に
    `event=schedule` の run を数えて確認）。**遅れるのは本当。発火しないのは嘘。**

  それでも、毎晩ひとりでに走ってほしいものは**実績のあるワークフローの完了に繋ぐ**
  （`workflow_run`）。cron は保険として残す——**保険が効くのは5〜7時間後**だと
  分かったうえで。
  - **繋ぐときは `conclusion` を見ない。** `schedule_fetch_chat.yml` は
    「表に無い どねID が投げ銭してきた」ときに最後の step が `exit 1` で
    終わる。あれは失敗ではなく呼び出しで、BigQuery には入っている。
    成功のときだけ繋ぐと、呼び出しの出た晩だけ焼かれない。
  - **繋ぎはワークフローの `name:` で解決される。** あちらの名前を変えると
    黙って切れる。**赤くならない。走らなくなるだけ。**
  - **繋ぎが生きているかは `Fetch Doneru Donations` を `probe: true` で
    押して確かめる。** どねるの取り込みそのものは1バイトも書かずに40秒で終わる。
    - **ただし「本番を汚さない」ではない。** あの完了には**13本**ぶら下がっていて、
      その1つが `Firebase Hosting Deploy`。**押すと本番への配りが1回起きる**
      （`grep -l 'Fetch Doneru Donations' .github/workflows/*.yml` で数えられる）。
      **配信の直前や、master に出したくないものが載っているときは押さない。**
      2026-10-16 にここを「1バイトも書かない」とだけ書いてあって、
      危うくその状態で押すところだった。
    - 配りを起こさずに繋ぎだけ見たいなら、`Firebase Hosting Deploy` の
      `wake_only: true`（#865 で足した）。書き出しも配りも丸ごと飛ばして、
      下流だけを起こす。

- **自分のアカウントで書いた `@Ayato-kosaka` は、通知が飛ばない** — セッションから
  issue に書くときは**あやと本人のトークン**で書いている。GitHub は**自分で自分を
  呼んでも通知を飛ばさない。** 字としては在るので、**書いたほうは届いた気になる。**
  飛ばすには `github-actions[bot]` に書かせる:

  ```bash
  gh api -X POST repos/Ayato-kosaka/live-streaming/actions/workflows/call_ayato.yml/dispatches \
    -f ref=master -f 'inputs[issue]=701' -f 'inputs[text]=何を決めてほしいか'
  ```

  **囲い・引用・バッククォートの中の `@名前` も飛ばない**（`ticket_labels.mention_live()`
  が判定を持っている。人の目で見ない）。**ワークフローに渡した字は公開のログに出る**ので、
  視聴者さんの素性を入れない。手順は `/ask-ayato`。

- **`EXPO_PUBLIC_` は「隠す」ではなく「公開してよい」の宣言** — Expo は
  この接頭辞の環境変数を**書き出しの中へ焼く。** GitHub Secret に入れて
  あっても、焼いた先（`dist/_expo/static/js/web/entry-….js`）が公開されて
  いれば誰でも読める。**鍵を入れない。** Doneru の鍵（#180）と Anthropic の
  API キー（#217）が、実際にこれで本番の JS に出ていた。
  鍵が要るものは Functions に置いて、ブラウザには寿命の短いトークンか、
  こちらが出した合言葉（作り直せるもの）だけを渡す。
  確かめかたは、書き出したものを直に見る:

  ```bash
  npx expo export --platform web --output-dir /tmp/x
  grep -c 'sk-ant-\|push\.doneru\.jp' /tmp/x/_expo/static/js/web/entry-*.js
  ```

  **値そのものは出さない。** このリポジトリは公開で、Actions のログも誰でも読める。

- **スプライトの色** — テクスチャを持つキットは `Textures/colormap.png` を共有してしまう。
  food-kit は必ず `models/food/` に自分のテクスチャごと置く。
- **Wikimedia のサムネイル** — 2026年から使える幅が決まっている（120 / 250 / 330 / 500 / 960 / 1920）。
  それ以外は 400 で返ってくる。
- **SVG の CSS transform** — 既定の原点は (0,0)。図形の中心で回したいときは
  `transform-box: fill-box; transform-origin: center;` を付ける。
- **静的書き出し** — `output: "export"` なので、ビルド時の日付と数字が焼き込まれる。
  「あと何日」「いちばん近い企画」「配信本数」は画面が出てから計算し直している。同じ轍を踏まない。
- **自動生成ファイルを手で直さない** — `site/content/cityStreams.ts`、
  `site/content/nordic/*.json`、`site/content/sprites.json`。元のスクリプトを直して作り直す。
- **焼いた書体を PR に入れない** — `site/public/fonts/*.woff2`・`site/app/css/fonts.css`・`tools/fonts/buckets.txt`・
  `absent.json` は、master に入ったあと `fontbake.yml` が焼いて積む。PR が持つのは表（`tools/fonts/weights.json`）と
  `subset.py` だけ。焼いたものを入れると、並行する PR がマージのたびにぶつかる（#1324 は4回やり直した）。
  PR の見張りはその場で焼いてから見るので弱まらない（`tools/fonts/subset.py` の頭）
- **`site/tsconfig.json` の include を畳まない** — Next はビルドのたびに、自分の dist の
  型パスが include に無ければ**書き足す**。並列でビルドを回していると、そこで
  書き換えが衝突してビルドが落ちる（1日に3回踏んだ）。使うポートぶんを先に
  並べてあるので、**そのまま置いておく。** 畳むと次のビルドでまた書き足される。
  （`typescript.tsconfigPath` で逃がす手は使えない。Next はそのファイルを作り直して
  くれないので、本番のビルドが `paths` を失って落ちる。試して戻した）
- **畳んだ中の絵を数えない** — 閉じた `<details>` の中の `loading="lazy"` は、
  **ブラウザが一度も要求しない**（route に1本も来ないことを数えて確かめた）。
  数えると「絵が落ちた」に見えるが、落ちてはいない。`/streams` の 26/41 がこれで、
  15枚とも curl では 200 で返る。**下まで送っても開かない。畳みを開いてから数える。**
- **面の高さを、畳んだまま測らない** — `content-visibility: auto` を持つ畳みは、
  画面の外にいるあいだ `contain-intrinsic-size` の値（68px）で報告される。
  中身が何行あっても 68px。北欧の面は送らずに測ると 3,951px、いちばん下まで
  送ってから測ると 5,067px で、1,100px 違った。**必ず下まで送ってから測る。**
- **押しどころは、見た目の箱で測らない** — `getBoundingClientRect` には
  `::after` で広げた当たり判定が出ないし、隣の要素に取られている場所も出ない。
  中心から1pxずつ外へ伸ばして `elementFromPoint` がまだ自分を返すかで測る。
  道具は `tools/sprites/hitbox.mjs`。「押せないのに厚みがある」ものを数えるのは
  `tools/sprites/popcheck.mjs`。
- **CPU の絞り（`Emulation.setCPUThrottlingRate`）は、それ自体が CPU を食う** —
  `/board` を6秒で、絞りなし 120ms が 4倍絞りで 4,710ms（うちメイン 4,367ms）。
  **どの面にも1フレーム 13ms 前後の下駄がつく。** 「島も北欧も掲示板も 13ms」が
  揃ったら、それは下駄。読み込みの速さを見るときは絞ったまま、
  描画の CPU を見るときは絞りを外してから測る。
- **描画の速さを、壁の時計で測らない** — この箱で並列に作業していると load average が
  20を超える。rAF の間隔は**同じ条件を2回測って 33ms と 116ms** が出る。
  「60fps になった」の誤報はこれで出た。CDP の `Performance.ProcessTime`（描画プロセスが
  実際に使った CPU 秒）から**1フレームあたりの CPU** を出す（同条件3回で 24/25/25）。
  道具は `tools/sprites/framecpu.mjs`。転送量（バイト数）は混み具合に影響されないので、
  そちらは壁の時計でよい。
  - **`ProcessTime` も混み具合から完全には逃げられない。** コアを取り合うと自分の
    CPU 秒が伸びる（同じ島で 15.5ms と 31.0ms が出た）。**A と B を交互に測って
    比だけを読む**（`tools/sprites/_ab.mjs`）。1条件ずつ順に測ると前後がひっくり返る。
  - **「1フレームあたりの CPU」は、fps が変わると比べられない。** 1秒あたりの仕事が
    一定なら、遅くなるほど1フレームあたりは**大きく**出る。速くしたのに数字が
    悪化して見える。1秒あたりの CPU と fps を併記して読む。
- **島の SVG の中で動かしたものは、その形の外接矩形ぶんが毎フレーム描き直される** —
  要素の数でも、画素の数でも、ぼかしでもない。**形の大きさ**で決まる。
  海のきらめきは島をぐるりと囲む形なので外接矩形が画面ぜんぶになり、
  海が画面の1割しか写っていなくても10割ぶんの代金を払っていた
  （止めるだけで PC が 12.2 → 33.8 fps）。波打ち際のレース・木の揺れ・住人の上下は
  外接矩形が小さいので、止めても数字が動かない。**足す前に外接矩形を見る。**
  - **`steps()` で値の変わる回数を減らしても効かない。** Chrome は値が同じでも
    毎フレーム描き直す。ゆっくりにするのも無駄。**止めるか、小さくするかの2つだけ。**
  - **画面1pxを何画素で描くか（deviceScaleFactor）はほとんど効かない。** 9倍にしても
    +11% だった。ラスタは別プロセスなので `ProcessTime` に出ない、というのもある。
- **アニメーションの `fill-mode: both` は、終わったあとも値を握り続ける** —
  アニメーションの値はふつうの規則より強いので、あとから `opacity` を上書きできない。
  遅れ(delay)が無いなら `backwards` で足りる（看板ロゴでこれに1回はまった）。
- **文字の濃さは、同じ面を2回撮って測る** — 1枚目はそのまま、2枚目は**字の色だけ透明**にする。
  `text-shadow` は透明にしても残るので、2枚目が「その字が乗っている地そのもの」になる。
  差の出た画素が字の画素。道具は `tools/sprites/inkpx.mjs`。
  - **字の色は、宣言された値ではなく描かれた画素から取る。** computed の `color` は
    `opacity` を含まない。0.72 で薄めてある字をそのまま使うと、実際より濃いものとして
    数えて合格に見える（地図の海の名前を「0/170」と報告して、実測 1.88 だった）。
  - **合否は中央値で決める。字の下位10%で決めない。** にじみ（アンチエイリアス）の
    画素を測ることになる。校正になるのが島の札の名前で、計算値ちょうど 9.25 の字でも
    下位10%は 5.06、最低は 3.24 と出る。真の値が 9.25 の字がそうなるので、
    下位10%で判定するとどんな字も落ちる。
  - **代わりに「地のばらつき」を見る。** 中心だけ濃い暗幕を敷いて中央値をよく見せた
    ことが1度ある（中央値 7.16 のまま端が 3.28）。あれは字ではなく**地**が場所で
    変わっていたので、2枚目（地だけの絵）を字の面積ぶん見て、いちばん明るい地と
    いちばん暗い地の両方で比を出せば分かる。
  - **島を止めてから撮る。** 2枚のあいだに住人が歩きカメラが寄ると、差分に字と
    関係ない画素が混ざる（「地が紫（住人の服）」という値が実際に出た）。
    CSS の animation を止めるだけでは足りない。島は rAF で動くので
    `window.requestAnimationFrame = () => 0` で止める。
  - **dpr は 2 以上で撮る。** dpr1 だと同じ字が 7.02、dpr2 だと 9.25 と、2〜3割低く出る。
- **SVG の SMIL（`<animate repeatCount="indefinite">`）も、中身を全部描き直す** —
  `/nordic/sweden` は誰も触っていない3秒で CPU 3,180ms（島 920 / 掲示板 120）だった。
  目印のパルス22本が、そのたび 380本のパスを焼き直していた。
  外すと 5,640ms → **0ms**。要素数でも、ぼかしでも、画素数でもない
  （`filter` 除去・`clip-path` 除去・`opacity` を1に・dpr=1、どれも効かない）。
  動かすものは**地図とは別の小さな要素**に載せて、CSS の `transform` / `opacity` でやる。
- **SVG は `viewBox` を書き換えると中身を全部描き直す** — 1ドットでも動かすと、
  画面の外にある部分まで毎フレームなぞる。島はこれで1フレーム 26.6ms（うち 20ms が
  ラスタライズ）だった。動かすのは CSS の `transform` にして、`viewBox` は据え置く。
  `will-change` を SVG の**中の要素**に付けるのは逆効果（133ms まで悪化した）。付けるなら `<svg>` に。

## 3. 数は道具で数える

**数そのものは手引きから読まない。`python3 python/counts.py` が数える**
（焼き込み・章・歩いた国・図鑑・料理・伝説・面・行数…）。
手で書いた数は、書いた日から古くなる——2026-10-13 に突き合わせたら
手引き5か所が全部ずれていた。**0 を答えとして出さない**（置き場が動いたら 2 で落ちる）
